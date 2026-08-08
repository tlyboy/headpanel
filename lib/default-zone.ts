import 'server-only'

import { cache } from 'react'
import { listUsers, type HsUser } from '@/lib/headscale'

const DEFAULT_HS_USER = 'admin'
const DEFAULT_APPROVED_TAG = 'tag:approved'

// The default zone is the part of the tailnet that does not belong to any group. Groups are optional isolation units; even without groups, nodes still need to be
// approvable and keys still need to be issued, and each requires a well-defined value:
//  - headscale requires a user when creating a preauthkey, so keys outside groups are attached to this user
//  - Approved nodes need an allow tag; nodes outside groups get this tag
// The ownership relationship for both is declared in the policy baseline (see lib/policy.ts); the panel only references it.
export class DefaultZoneError extends Error {
  constructor(readonly userName: string) {
    super(
      `Default headscale user "${userName}" does not exist; set HEADPANEL_DEFAULT_HS_USER to an existing user`,
    )
    this.name = 'DefaultZoneError'
  }
}

export function defaultHsUserName(): string {
  return process.env.HEADPANEL_DEFAULT_HS_USER?.trim() || DEFAULT_HS_USER
}

export function approvedTag(): string {
  return process.env.HEADPANEL_APPROVED_TAG?.trim() || DEFAULT_APPROVED_TAG
}

// Look up the default user by name and get its id (createPreAuthKey requires an id, not a name).
// Cache by request so multiple uses within one request don't call headscale repeatedly.
export const resolveDefaultHsUser = cache(
  async function resolveDefaultHsUser(): Promise<HsUser> {
    const name = defaultHsUserName()
    const user = (await listUsers()).find((u) => u.name === name)
    if (!user) throw new DefaultZoneError(name)
    return user
  },
)
