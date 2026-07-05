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

// Groups visible to the current session: super sees all; group sees only its own group
export function visibleGroups(session: Session): Group[] {
  const all = listGroups()
  if (session.role === 'super') return all
  return all.filter((g) => g.id === session.gid)
}

type NodeLike = { tags?: string[]; user?: { id: string } | null }

// Resolve the group a node belongs to. Key point: headscale uniformly overwrites the user field of nodes with forced tags to
// tagged-devices, so [use the ticket tag first to determine ownership];
// only pending nodes without a ticket have their real user field, so fall back to matching hsUserId only in that case.
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

// Filter nodes by the session's visible scope. super sees all; group sees only nodes belonging to its group.
export function scopeNodes<T extends NodeLike>(
  session: Session,
  nodes: T[],
): T[] {
  if (session.role === 'super') return nodes
  const groups = listGroups()
  return nodes.filter((n) => groupOfNode(n, groups)?.id === session.gid)
}

// Resolve the node's group and verify the session can operate on it (for approval / renaming / deletion, etc.)
export function groupForNode(session: Session, node: NodeLike): Group {
  const g = groupOfNode(node)
  if (!g) throw new Error('This node does not belong to any registered group')
  if (session.role !== 'super' && g.id !== session.gid) {
    throw new Error('You are not allowed to manage nodes from another group')
  }
  return g
}

// Create a group: create the headscale user → write to the database (ok_tag=tag:ok-<slug>) → recompute policy
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

// Delete a group: delete the local account + groups row → delete the headscale user → recompute policy
export async function deleteGroup(id: number): Promise<void> {
  const g = getGroup(id)
  if (!g) throw new Error('Group does not exist')
  db.delete(admins).where(eq(admins.groupId, id)).run()
  db.delete(groups).where(eq(groups.id, id)).run()
  await deleteHsUser(g.hsUserId)
  await rebuildPolicy()
}

// Issue a login account (role=group) for the group
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
