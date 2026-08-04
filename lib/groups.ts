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

// Refuse to delete a group if it still contains nodes or authorization keys. Deleting a headscale user also destroys all pre-auth keys belonging to it and
// cascades to delete all its nodes via fk_nodes_user ON DELETE CASCADE.
// The panel only deletes groups it created. Groups manually mapped to an existing headscale user (for example, mapping admin to the
// "default group") must not be deleted: deleteHsUser would also destroy all pre-auth keys and nodes belonging to that user
// (fk_nodes_user ON DELETE CASCADE); the group's ok_tag is often a global
// ticket (such as tag:approved), and removing tagOwner would zero out the ACL for the entire network.
export class ProtectedGroupError extends Error {
  constructor(readonly slug: string) {
    super(
      `Group "${slug}" was not created by the panel and must not be deleted here`,
    )
    this.name = 'ProtectedGroupError'
  }
}

// The criterion comes from createGroup's generation rule (ok_tag = tag:ok-<slug>), regardless of the amount of data in the group:
// groups manually added to the groups table won't satisfy it.
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

// Filter nodes to the scope visible to the session. super sees all; group sees only nodes belonging to its group.
// When super switches to a group, the session itself is already downgraded to that group's group role (see lib/auth.ts),
// so there is no need to handle the concept of a "current group" here.
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

// Resolve the node's group and verify the session can operate on it (for approval / renaming / deletion, etc.)
export function groupForNode(session: Session, node: NodeLike): Group {
  const g = groupOfNode(node)
  if (!g) throw new Error('This node does not belong to any registered group')
  if (session.role !== 'super' && g.id !== session.gid) {
    throw new Error('You are not allowed to manage nodes from another group')
  }
  return g
}

// Create a group: create a user in headscale → apply ACLs including the new group → save to the database (ok_tag=tag:ok-<slug>).
// Apply ACLs before saving: if the update fails, remove the newly created headscale user, leaving no orphan or partial result.
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
    // Remove the newly created user, or headscale will be left with an orphan the panel doesn't recognize
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

// Whether nodes will also be destroyed along with the group's headscale user. Take the union of both criteria:
// a user_id match is the basis for headscale's actual cascade; a tag match is needed because headscale clears the user field on nodes with
// forced tags, setting it to tagged-devices (see the groupOfNode comment), so checking only user would miss them.
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

// Count remaining group data. Used to reconcile before deletion and to disable the delete button in advance on the groups page.
export async function countGroupResidue(
  g: Group,
): Promise<{ nodeCount: number; keyCount: number }> {
  const [nodes, keys] = await Promise.all([listNodes(), listPreAuthKeys()])
  return {
    nodeCount: nodes.filter((n) => nodeBelongsToGroup(n, g)).length,
    keyCount: keys.filter((k) => keyBelongsToGroup(k, g)).length,
  }
}

// Delete a group: refuse groups not created by the panel → reconcile and refuse non-empty groups → apply ACLs "after deletion" →
// delete the headscale user → clear local data.
// Apply ACLs before any changes: this is the step most likely to fail (e.g. policy.mode=file); if it fails,
// nothing has changed yet. At this point the group has no nodes, so removing its tagOwner won't accidentally break anything.
export async function deleteGroup(id: number): Promise<Group> {
  const g = getGroup(id)
  if (!g) throw new Error('Group does not exist')
  // A hard safeguard independent of the amount of data in the group; it must run before countGroupResidue: if the latter allows deletion because
  // the nodes happened to be cleared (or headscale returned an empty list), this is the final gate.
  if (!isPanelManagedGroup(g)) throw new ProtectedGroupError(g.slug)

  const { nodeCount, keyCount } = await countGroupResidue(g)
  if (nodeCount > 0 || keyCount > 0) {
    throw new GroupNotEmptyError(nodeCount, keyCount)
  }

  await applyPolicy(listGroups().filter((x) => x.id !== id))
  await deleteHsUser(g.hsUserId)
  db.delete(admins).where(eq(admins.groupId, id)).run()
  // Plaintext key backups must not be retained (security); keep audit records, setting only the dangling group_id to null
  db.delete(preauthKeys).where(eq(preauthKeys.groupId, id)).run()
  db.update(auditLog)
    .set({ groupId: null })
    .where(eq(auditLog.groupId, id))
    .run()
  db.delete(groups).where(eq(groups.id, id)).run()
  return g
}

// Change the group's display name. Only update the local name field — slug / ok_tag determine node membership and ACL rules;
// changing them would mean retagging all nodes and reapplying policy. That's a migration, not a rename, so leave them alone here.
export function renameGroup(id: number, name: string): Group {
  const next = name.trim()
  if (!next) throw new Error('Group name is required')
  const g = getGroup(id)
  if (!g) throw new Error('Group does not exist')
  db.update(groups).set({ name: next }).where(eq(groups.id, id)).run()
  return { ...g, name: next }
}

// Reset a group admin's password. For super only; no old-password check — this is the escape hatch for when they've "forgotten their password."
// Only allow changes to accounts with role=group that actually belong to that group, to avoid changing another group's account or super's own account by mistake.
export function resetGroupAdminPassword(input: {
  groupId: number
  adminId: number
  password: string
}) {
  if (input.password.length < 6)
    throw new Error('Password must be at least 6 characters')
  const row = db
    .select()
    .from(admins)
    .where(eq(admins.id, input.adminId))
    .get()
  if (!row || row.groupId !== input.groupId || row.role !== 'group') {
    throw new Error('Account does not belong to this group')
  }
  db.update(admins)
    .set({ passwordHash: hashPassword(input.password) })
    .where(eq(admins.id, input.adminId))
    .run()
  return row.username
}

// Issue a login account (role=group) for the group
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
