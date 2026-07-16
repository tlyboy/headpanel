import 'server-only'

import { eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { nodeMeta } from '@/lib/db/schema'
import { listNodes, type HsNode } from '@/lib/headscale'
import { listGroups } from '@/lib/groups'

export interface MergedNode extends HsNode {
  status: 'pending' | 'approved' | 'rejected'
  approvedAt: string | null
  note: string | null
}

// 拉 headscale 节点，与本地 node_meta 对账（headscale 无 pending 概念，靠这张表补足）：
//  - 新出现且已带【所属组的 ok_tag】→ approved（direct key 接入）
//  - 新出现且未带 ok_tag → pending（待审批，此时无门票 tag 即被 ACL 隔离）
//  - 已有记录：保留其 status（status 只由审批操作改，不被 sync 覆盖）
//  - headscale 已删除的节点：清理孤立 meta
export async function syncAndListNodes(): Promise<MergedNode[]> {
  const nodes = await listNodes()
  const liveIds = new Set(nodes.map((n) => n.id))

  // 所有组的门票 tag。判断节点是否已「持票」只看 tags（不能用 user：
  // headscale 对 tagged 节点把 user 抹成 tagged-devices，CLAUDE.md 坑 14）
  const okTags = new Set(listGroups().map((g) => g.okTag))

  const metas = db.select().from(nodeMeta).all()
  const metaById = new Map(metas.map((m) => [m.headscaleId, m]))

  // 清理孤立记录
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

// 设/清节点备注（仅本地 node_meta，不动 headscale）。空串视为清除。
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
