// Keep constants and types in a file without 'use client': client modules only expose component references to the server,
// and importing regular values from them on the server yields undefined (this once caused
// "ACTIVITY_KEYS is not iterable" to be thrown on the dashboard).

/** Maximum number of detail rows to list in the hover card; the rest are grouped under "Other" */
export const ACTIVITY_TOP_N = 6

/** Use status colors: these three tiers are states, not three parallel series. */
export const ACTIVITY_KINDS = ['normal', 'destructive', 'failed'] as const
export type ActivityKind = (typeof ACTIVITY_KINDS)[number]

// Audit records are persisted only after successful operations; explicitly logged failures use the .fail / ...Failed naming convention.
// Identify destructive actions by their verbs: delete, revoke, reject, invalidate — when these fail, the date should be easy to spot.
export function activityKind(action: string): ActivityKind {
  if (action.endsWith('.fail') || action.endsWith('Failed')) return 'failed'
  if (/(delete|revoke|reject|expire)/i.test(action)) return 'destructive'
  return 'normal'
}

export interface ActivityItem {
  label: string
  count: number
  kind: ActivityKind
}

export interface ActivityPoint {
  /** YYYY-MM-DD */
  date: string
  normal: number
  destructive: number
  failed: number
  total: number
  /** Counts for each action today, translated, sorted by count in descending order, and truncated */
  items: ActivityItem[]
}
