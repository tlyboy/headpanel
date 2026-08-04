import 'server-only'

import { cookies } from 'next/headers'
import { visibleGroups } from '@/lib/groups'
import type { Session } from '@/lib/auth'
import type { Group } from '@/lib/db/schema'

export const ACTIVE_GROUP_COOKIE = 'hs_group'

// super normally sees the whole network and can narrow the view to a single group; other roles are already limited to their own groups by scopeNodes,
// so this selection is meaningless for them and should not be offered to them.
// Returning null = do not narrow (super sees everything / non-super keeps the existing group isolation).
//
// The cookie value can be changed by the client, so it must be checked against visibleGroups:
// only accept groups already visible in the current session; changing the cookie cannot grant access.
export async function readActiveGroup(session: Session): Promise<Group | null> {
  if (session.role !== 'super') return null
  const raw = (await cookies()).get(ACTIVE_GROUP_COOKIE)?.value
  if (!raw) return null
  const id = Number(raw)
  if (!Number.isInteger(id)) return null
  return visibleGroups(session).find((g) => g.id === id) ?? null
}
