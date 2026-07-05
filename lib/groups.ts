import 'server-only'

import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { admins, groups, type Group } from '@/lib/db/schema'
import { createHsUser, deleteHsUser } from '@/lib/headscale'
import { rebuildPolicy } from '@/lib/policy'
import { hashPassword, type Session } from '@/lib/auth'

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,30}$/

export function listGroups(): Group[] {
  return db.select().from(groups).all()
}

export function getGroup(id: number): Group | undefined {
  return db.select().from(groups).where(eq(groups.id, id)).get()
}

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
  return nodes.filter((n) => groupOfNode(n, groups)?.id === session.gid)
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

// 建组：headscale 建 user → 落库（ok_tag=tag:ok-<slug>）→ 重算策略
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

  const hsUser = await createHsUser(slug)
  db.insert(groups)
    .values({
      slug,
      name,
      hsUserId: hsUser.id,
      hsUserName: hsUser.name,
      okTag: `tag:ok-${slug}`,
    })
    .run()
  await rebuildPolicy()
  const row = db.select().from(groups).where(eq(groups.slug, slug)).get()
  if (!row) throw new Error('Failed to read the group after creation')
  return row
}

// 删组：删本地账号 + groups 行 → 删 headscale user → 重算策略
export async function deleteGroup(id: number): Promise<void> {
  const g = getGroup(id)
  if (!g) throw new Error('Group does not exist')
  db.delete(admins).where(eq(admins.groupId, id)).run()
  db.delete(groups).where(eq(groups.id, id)).run()
  await deleteHsUser(g.hsUserId)
  await rebuildPolicy()
}

// 给组发一个登录账号（role=group）
export function createGroupAdmin(input: {
  groupId: number
  username: string
  password: string
}) {
  const username = input.username.trim()
  if (!username) throw new Error('Username is required')
  if (input.password.length < 6) throw new Error('Password must be at least 6 characters')
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
