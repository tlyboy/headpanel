// Keep constants and types in a file without 'use client': client modules only expose component references to the server,
// and importing regular values from them on the server yields undefined (this once caused
// "ACTIVITY_KEYS is not iterable" to be thrown on the dashboard).
import { type AuditKind } from '@/lib/audit'

/** Maximum number of detail rows to list in the hover card; the rest are grouped under "Other" */
export const ACTIVITY_TOP_N = 6

export interface ActivityItem {
  label: string
  count: number
  kind: AuditKind
}

// One numeric field per tier; stacked bars are drawn from bottom to top in AUDIT_KINDS order
export type ActivityPoint = Record<AuditKind, number> & {
  /** YYYY-MM-DD */
  date: string
  total: number
  /** Counts for each action today, translated, sorted by count in descending order, and truncated */
  items: ActivityItem[]
}
