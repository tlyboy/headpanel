import 'server-only'
import { and, count, desc, eq, gte, like, lt, or, sql, type SQL } from 'drizzle-orm'
import { getMessages } from 'next-intl/server'
import { db } from '@/lib/db'
import { auditLog } from '@/lib/db/schema'
import { fmtTime } from '@/lib/format'
import { auditKind, AUDIT_KIND_VARIANT, displayTarget, legacyNodeId } from '@/lib/audit'
import { listNodes } from '@/lib/headscale'

export const AUDIT_BATCH = 100

export interface AuditFilters {
  q: string
  action: string
  // today / 7d / 30d, or a specific day (what a bar on the overview chart links to)
  range: string
}

// Everything the list shows, already formatted on the server so the client renders exactly what it was sent
export interface AuditRowView {
  id: number
  time: string
  actor: string
  action: string
  variant: (typeof AUDIT_KIND_VARIANT)[keyof typeof AUDIT_KIND_VARIANT]
  target: string
  detail: string
}

export interface AuditBatch {
  rows: AuditRowView[]
  // id to continue below, or null when the oldest matching record is loaded
  next: number | null
}

export function auditWhere({ q, action, range }: AuditFilters): SQL | undefined {
  const conds: SQL[] = []
  if (action) conds.push(eq(auditLog.action, action))
  if (/^\d{4}-\d{2}-\d{2}$/.test(range)) {
    conds.push(eq(sql`date(${auditLog.ts})`, range))
  } else if (range) {
    // Same basis as the overview chart (both bucket by date(ts)), so the counts match when you click through
    const days = range === 'today' ? 1 : range === '7d' ? 7 : 30
    const since = new Date(Date.now() - (days - 1) * 86400_000).toISOString().slice(0, 10)
    conds.push(gte(sql`date(${auditLog.ts})`, since))
  }
  if (q) {
    const kw = `%${q}%`
    const m = or(like(auditLog.actor, kw), like(auditLog.target, kw), like(auditLog.detail, kw))
    if (m) conds.push(m)
  }
  return conds.length ? and(...conds) : undefined
}

export function auditTotal(filters: AuditFilters): number {
  return db.select({ n: count() }).from(auditLog).where(auditWhere(filters)).get()?.n ?? 0
}

// Newest first; `before` is the smallest id already shown
export async function loadAuditBatch(filters: AuditFilters, before?: number): Promise<AuditBatch> {
  const where = auditWhere(filters)
  const rows = db
    .select()
    .from(auditLog)
    .where(before ? and(where, lt(auditLog.id, before)) : where)
    .orderBy(desc(auditLog.id))
    .limit(AUDIT_BATCH + 1)
    .all()
  const more = rows.length > AUDIT_BATCH
  const batch = more ? rows.slice(0, AUDIT_BATCH) : rows

  // action stores ids like route.approve; t() would read the dot as a namespace, so look the label up directly
  const messages = await getMessages()
  const labels = (messages.auditActions ?? {}) as Record<string, string>

  // Older records only stored the node id. Ask headscale for names only when this batch has one;
  // if headscale is down, show the id as before.
  const nodeNames = new Map<string, string>()
  if (batch.some((r) => legacyNodeId(r.action, r.target))) {
    try {
      for (const n of await listNodes()) nodeNames.set(n.id, n.givenName)
    } catch {
      // Names are a nice-to-have; the list itself doesn't depend on them
    }
  }

  return {
    rows: batch.map((r) => ({
      id: r.id,
      time: fmtTime(r.ts.replace(' ', 'T') + 'Z'),
      actor: r.actor ?? '—',
      action: labels[r.action] ?? r.action,
      variant: AUDIT_KIND_VARIANT[auditKind(r.action)],
      target: displayTarget(r.action, r.target, nodeNames) ?? '—',
      detail: r.detail ?? '—',
    })),
    next: more ? batch.at(-1)!.id : null,
  }
}
