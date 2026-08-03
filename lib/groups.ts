import 'server-only'

import { cache } from 'react'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  admins,
  auditLog,
  groups,
  preauthKeys,
  type Group,
} from '@/lib/db/schema'
import {
  createHsUser,
  deleteHsUser,
  listNodes,
  listPreAuthKeys,
} from '@/lib/headscale'
import { applyPolicy } from '@/lib/policy'
import { hashPassword, type Session } from '@/lib/auth'

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,30}$/

// 组内仍有节点 / 授权 key 时拒绝删组。删 headscale user 会连带销毁它名下的
// 全部 pre-auth key，并按 fk_nodes_user ON DELETE CASCADE 级联删掉全部节点。
export class GroupNotEmptyError extends Error {
  constructor(
    readonly nodeCount: number,
    readonly keyCount: number,
  ) {
    super(
      `Group still has ${nodeCount} node(s) and ${keyCount} pre-auth key(s); remove them first`,
    )
    this.name = 'GroupNotEmptyError'
  }
}

export const listGroups = cache(function listGroups(): Group[] {
  return db.select().from(groups).all()
})

export const getGroup = cache(function getGroup(id: number): Group | undefined {
  return db.select().from(groups).where(eq(groups.id, id)).get()
})

// 当前会话可见的组：super 看全部，group 只看自己组
export function visibleGroups(session: Session): Group[] {
  const all = listGroups()
  if (session.role === 'super') return all
  return all.filter((g) => g.id === session.gid)
}

type NodeLike = { tags?: string[]; user?: { id: string } | null }

// 解析节点所属组。关键：headscale 对打了 forced tag 的节点会把 user 字段
// 统一抹成 tagged-devices，故【优先用门票 tag 判归属】；
// 只有未持票的待审批节点 user 字段才是真实的，此时才回退按 hsUserId 匹配。
export function groupOfNode(
  node: NodeLike,
  groups: Group[] = listGroups(),
): Group | undefined {
  const tags = node.tags ?? []
  const byTag = groups.find((g) => tags.includes(g.okTag))
  if (byTag) return byTag
  const uid = node.user?.id ?? ''
  return groups.find((g) => g.hsUserId === uid)
}

// 按会话可见范围过滤节点。super 看全部；group 只看归属本组的。
export function scopeNodes<T extends NodeLike>(
  session: Session,
  nodes: T[],
): T[] {
  if (session.role === 'super') return nodes
  const groups = listGroups()
  const groupIdByTag = new Map(groups.map((group) => [group.okTag, group.id]))
  const groupIdByUser = new Map(
    groups.map((group) => [group.hsUserId, group.id]),
  )
  return nodes.filter((node) => {
    for (const tag of node.tags ?? []) {
      if (groupIdByTag.get(tag) === session.gid) return true
    }
    return groupIdByUser.get(node.user?.id ?? '') === session.gid
  })
}

// 解析节点所属组并校验会话可操作（用于审批 / 改名 / 删除等）
export function groupForNode(session: Session, node: NodeLike): Group {
  const g = groupOfNode(node)
  if (!g) throw new Error('This node does not belong to any registered group')
  if (session.role !== 'super' && g.id !== session.gid) {
    throw new Error('You are not allowed to manage nodes from another group')
  }
  return g
}

// 建组：headscale 建 user → 下发含新组的 ACL → 落库（ok_tag=tag:ok-<slug>）。
// ACL 先于落库：推不上去就把刚建的 headscale user 收回，不留孤儿也不留半成品。
export async function createGroup(input: {
  slug: string
  name: string
}): Promise<Group> {
  const slug = input.slug.trim().toLowerCase()
  const name = input.name.trim()
  if (!SLUG_RE.test(slug)) {
    throw new Error(
      'Slug must be 2-31 lowercase letters, numbers, or hyphens, and start with a letter or number',
    )
  }
  if (!name) throw new Error('Group name is required')
  const dup = db.select().from(groups).where(eq(groups.slug, slug)).get()
  if (dup) throw new Error(`Slug "${slug}" already exists`)

  const okTag = `tag:ok-${slug}`
  const hsUser = await createHsUser(slug)
  try {
    await applyPolicy([...listGroups(), { hsUserName: hsUser.name, okTag }])
  } catch (e) {
    // 回收刚建的 user，否则 headscale 侧会留下一个面板不认识的孤儿
    await deleteHsUser(hsUser.id).catch(() => {})
    throw e
  }
  db.insert(groups)
    .values({
      slug,
      name,
      hsUserId: hsUser.id,
      hsUserName: hsUser.name,
      okTag,
    })
    .run()
  const row = db.select().from(groups).where(eq(groups.slug, slug)).get()
  if (!row) throw new Error('Failed to read the group after creation')
  return row
}

// 节点是否会随该组的 headscale user 一起被销毁。取两个口径的并集：
// user_id 命中是 headscale 真正级联的依据；tag 命中是因为 headscale 把带
// forced tag 的节点 user 抹成 tagged-devices（见 groupOfNode 注释），只看 user 会漏判。
export function nodeBelongsToGroup(node: NodeLike, g: Group): boolean {
  if (node.user?.id === g.hsUserId) return true
  return (node.tags ?? []).includes(g.okTag)
}

export function keyBelongsToGroup(
  key: { user?: { id: string } | null },
  g: Group,
): boolean {
  return key.user?.id === g.hsUserId
}

// 组内残留统计。删组前对账用，也供 groups 页面提前禁用删除按钮。
export async function countGroupResidue(
  g: Group,
): Promise<{ nodeCount: number; keyCount: number }> {
  const [nodes, keys] = await Promise.all([listNodes(), listPreAuthKeys()])
  return {
    nodeCount: nodes.filter((n) => nodeBelongsToGroup(n, g)).length,
    keyCount: keys.filter((k) => keyBelongsToGroup(k, g)).length,
  }
}

// 删组：对账拒绝非空组 → 下发「删除后」的 ACL → 删 headscale user → 清本地数据。
// ACL 推送排在所有改动之前：它是最容易失败的一步（如 policy.mode=file），失败时
// 什么都还没动。此时组内已无节点，先撤掉它的 tagOwner 不会误断任何东西。
export async function deleteGroup(id: number): Promise<Group> {
  const g = getGroup(id)
  if (!g) throw new Error('Group does not exist')

  const { nodeCount, keyCount } = await countGroupResidue(g)
  if (nodeCount > 0 || keyCount > 0) {
    throw new GroupNotEmptyError(nodeCount, keyCount)
  }

  await applyPolicy(listGroups().filter((x) => x.id !== id))
  await deleteHsUser(g.hsUserId)
  db.delete(admins).where(eq(admins.groupId, id)).run()
  // 明文 key 备份不能留（安全）；审计记录保留，只把悬挂的 group_id 置空
  db.delete(preauthKeys).where(eq(preauthKeys.groupId, id)).run()
  db.update(auditLog)
    .set({ groupId: null })
    .where(eq(auditLog.groupId, id))
    .run()
  db.delete(groups).where(eq(groups.id, id)).run()
  return g
}

// 给组发一个登录账号（role=group）
export function createGroupAdmin(input: {
  groupId: number
  username: string
  password: string
}) {
  const username = input.username.trim()
  if (!username) throw new Error('Username is required')
  if (input.password.length < 6)
    throw new Error('Password must be at least 6 characters')
  const dup = db
    .select()
    .from(admins)
    .where(eq(admins.username, username))
    .get()
  if (dup) throw new Error(`Account "${username}" already exists`)
  db.insert(admins)
    .values({
      username,
      passwordHash: hashPassword(input.password),
      role: 'group',
      groupId: input.groupId,
    })
    .run()
}
