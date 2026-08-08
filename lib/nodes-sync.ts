import 'server-only'

import { eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { nodeMeta } from '@/lib/db/schema'
import { listNodes, type HsNode } from '@/lib/headscale'
import { approvedTag } from '@/lib/default-zone'
import { listGroups } from '@/lib/groups'

export interface MergedNode extends HsNode {
  status: 'pending' | 'approved' | 'rejected'
  approvedAt: string | null
  note: string | null
}

// Sync headscale nodes against local node_meta (headscale has no pending concept, so this table fills the gap):
//  - Newly seen nodes that already have an approval tag (the group's ok_tag or the default area's approvedTag) → approved (direct key access)
//  - Newly seen nodes without an approval tag → pending (awaiting approval; without a ticket tag, they are isolated by the ACL)
//  - Existing records: preserve their status (status is changed only by approval actions, not overwritten by sync)
//  - Nodes deleted from headscale: clean up orphaned metadata
export async function syncAndListNodes(): Promise<MergedNode[]> {
  const nodes = await listNodes()
  const liveIds = new Set(nodes.map((n) => n.id))

  // All approval tags: each group's ticket tag plus the default area's tag. Determine whether a node already has a "ticket" by checking tags only
  // (don't use user: headscale changes the user to tagged-devices for tagged nodes).
  // If the default area's tag is missing, nodes using direct key access when there are no groups will be incorrectly marked as pending.
  const okTags = new Set([approvedTag(), ...listGroups().map((g) => g.okTag)])

  const metas = db.select().from(nodeMeta).all()
  const metaById = new Map(metas.map((m) => [m.headscaleId, m]))

  // Clean up orphaned records
  const orphanIds: string[] = []
  for (const meta of metas) {
    if (!liveIds.has(meta.headscaleId)) orphanIds.push(meta.headscaleId)
  }
  if (orphanIds.length) {
    db.delete(nodeMeta).where(inArray(nodeMeta.headscaleId, orphanIds)).run()
  }

  const merged: MergedNode[] = []
  for (const n of nodes) {
    const meta = metaById.get(n.id)
    if (!meta) {
      const initial: 'pending' | 'approved' = n.tags.some((t) => okTags.has(t))
        ? 'approved'
        : 'pending'
      db.insert(nodeMeta).values({ headscaleId: n.id, status: initial }).run()
      merged.push({
        ...n,
        status: initial,
        approvedAt: null,
        note: null,
      })
      continue
    }
    merged.push({
      ...n,
      status: meta.status,
      approvedAt: meta.approvedAt,
      note: meta.note,
    })
  }
  return merged
}

export function setNodeStatus(
  headscaleId: string,
  status: 'pending' | 'approved' | 'rejected',
  by?: string,
) {
  if (status === 'approved' && !by) {
    throw new Error('approved node status requires an actor')
  }
  const now = new Date().toISOString()
  const existing = db
    .select()
    .from(nodeMeta)
    .where(eq(nodeMeta.headscaleId, headscaleId))
    .get()
  if (existing) {
    db.update(nodeMeta)
      .set({
        status,
        approvedAt: status === 'approved' ? now : existing.approvedAt,
        approvedBy: status === 'approved' ? by : existing.approvedBy,
      })
      .where(eq(nodeMeta.headscaleId, headscaleId))
      .run()
  } else {
    db.insert(nodeMeta)
      .values({
        headscaleId,
        status,
        approvedAt: status === 'approved' ? now : null,
        approvedBy: status === 'approved' ? by : null,
      })
      .run()
  }
}

// Set/clear a node note (local node_meta only; does not modify headscale). An empty string clears it.
export function setNodeNote(headscaleId: string, note: string) {
  const trimmed = note.trim()
  const value = trimmed === '' ? null : trimmed
  const existing = db
    .select()
    .from(nodeMeta)
    .where(eq(nodeMeta.headscaleId, headscaleId))
    .get()
  if (existing) {
    db.update(nodeMeta)
      .set({ note: value })
      .where(eq(nodeMeta.headscaleId, headscaleId))
      .run()
  } else {
    db.insert(nodeMeta).values({ headscaleId, note: value }).run()
  }
}
