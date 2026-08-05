// Keep constants and types in a file without 'use client': client modules only expose component references to the server,
// and importing regular values from them on the server yields undefined (this once caused
// "ACTIVITY_KEYS is not iterable" to be thrown on the dashboard).
export const ACTIVITY_KEYS = ['node', 'route', 'group', 'key', 'auth'] as const

export type ActivityKey = (typeof ACTIVITY_KEYS)[number]

export type ActivityPoint = { date: string; total: number } & Record<
  ActivityKey,
  number
>

/** Group the 16 specific actions into 5 broad categories by prefix. */
export function activityCategory(action: string): ActivityKey {
  if (action.startsWith('node.')) return 'node'
  if (action.startsWith('route.') || action.startsWith('policy.')) return 'route'
  if (action.startsWith('group.')) return 'group'
  if (action.startsWith('preauthkey.') || action.startsWith('accesskey.'))
    return 'key'
  return 'auth'
}
