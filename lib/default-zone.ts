import 'server-only'

import { cache } from 'react'
import { listUsers, type HsUser } from '@/lib/headscale'

const DEFAULT_HS_USER = 'admin'
const DEFAULT_APPROVED_TAG = 'tag:approved'

// Approving nodes and issuing keys each need a well-defined value:
//  - headscale requires a user when creating a preauthkey, so every key is attached to this user
//  - Approved nodes need an allow tag; approval puts this tag on them
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
export const resolveDefaultHsUser = cache(async function resolveDefaultHsUser(): Promise<HsUser> {
  const name = defaultHsUserName()
  const user = (await listUsers()).find((u) => u.name === name)
  if (!user) throw new DefaultZoneError(name)
  return user
})
