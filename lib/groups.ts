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
// 面板只删自己建的组。手工映射到 headscale 既有 user 的组（例如把 admin 挂成
// 「默认组」）删不得：deleteHsUser 会连该 user 名下的全部 pre-auth key 和节点
// （fk_nodes_user ON DELETE CASCADE）一起销毁；这类组的 ok_tag 往往还是全局
// 门票（如 tag:approved），撤掉 tagOwner 会让全网 ACL 归零。
export class ProtectedGroupError extends Error {
  constructor(readonly slug: string) {
    super(
      `Group "${slug}" was not created by the panel and must not be deleted here`,
    )
    this.name = 'ProtectedGroupError'
  }
}

// 判据取 createGroup 的生成规则（ok_tag = tag:ok-<slug>），与组内数据量无关：
// 手工写进 groups 表的映射组不会满足它。
export function isPanelManagedGroup(g: Group): boolean {
  return g.okTag === `tag:ok-${g.slug}`
}

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
// super 切到某个组时会话本身就已降级为该组的 group 角色（见 lib/auth.ts），
// 所以这里不需要再认识「当前组」这个概念。
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

// 解析节点所属组并校验会话可操作（用于审批 / 改名 / 删除等）。
// 组是可选的：不属于任何组的节点归默认区（见 lib/default-zone.ts），返回 null。
// 默认区只有 super 能管——super 切进某个组后会话已降级为 group 角色（见 lib/auth.ts），
// 那时它和普通组管理员一样碰不到组外的节点。
export function groupForNode(session: Session, node: NodeLike): Group | null {
  const g = groupOfNode(node)
  if (!g) {
    if (session.role !== 'super') {
      throw new Error('You are not allowed to manage nodes outside your group')
    }
    return null
  }
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

// 删组：拒绝非面板建的组 → 对账拒绝非空组 → 下发「删除后」的 ACL →
// 删 headscale user → 清本地数据。
// ACL 推送排在所有改动之前：它是最容易失败的一步（如 policy.mode=file），失败时
// 什么都还没动。此时组内已无节点，先撤掉它的 tagOwner 不会误断任何东西。
export async function deleteGroup(id: number): Promise<Group> {
  const g = getGroup(id)
  if (!g) throw new Error('Group does not exist')
  // 与组内数据量无关的硬保护，必须排在 countGroupResidue 之前：后者一旦因
  // 节点恰好清空（或 headscale 返回空列表）而放行，这里就是最后一道闸。
  if (!isPanelManagedGroup(g)) throw new ProtectedGroupError(g.slug)

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

// 改组显示名。只动本地 name 字段——slug / ok_tag 决定节点归属和 ACL 规则，
// 改它等于要重打所有节点的 tag 并重下 policy，那是迁移不是改名，这里不碰。
export function renameGroup(id: number, name: string): Group {
  const next = name.trim()
  if (!next) throw new Error('Group name is required')
  const g = getGroup(id)
  if (!g) throw new Error('Group does not exist')
  db.update(groups).set({ name: next }).where(eq(groups.id, id)).run()
  return { ...g, name: next }
}

// 重置某个组管理员的密码。super 专用，不校验旧密码——它本来就是「忘了密码」的出口。
// 只允许改 role=group 且确实属于该组的账号，避免顺手改掉别的组或 super 自己。
export function resetGroupAdminPassword(input: {
  groupId: number
  adminId: number
  password: string
}) {
  if (input.password.length < 6)
    throw new Error('Password must be at least 6 characters')
  const row = db.select().from(admins).where(eq(admins.id, input.adminId)).get()
  if (!row || row.groupId !== input.groupId || row.role !== 'group') {
    throw new Error('Account does not belong to this group')
  }
  db.update(admins)
    .set({ passwordHash: hashPassword(input.password) })
    .where(eq(admins.id, input.adminId))
    .run()
  return row.username
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
