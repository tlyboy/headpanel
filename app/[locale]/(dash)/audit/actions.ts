'use server'

import { requireSession } from '@/lib/auth'
import { loadAuditBatch, type AuditBatch, type AuditFilters } from '@/lib/audit-list'

export async function loadMoreAuditAction(
  filters: AuditFilters,
  before: number,
): Promise<AuditBatch> {
  await requireSession()
  return loadAuditBatch(filters, before)
}
