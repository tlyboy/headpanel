import 'server-only'

import { HeadscaleError, setPolicy } from '@/lib/headscale'

// headscale only accepts PUT /policy when policy.mode=database; file mode always returns 500.
// The panel's group isolation relies entirely on the deployed ACL. If the mode is wrong, group operations must abort completely rather than continue in a broken state.
export class PolicyReadOnlyError extends Error {
  constructor() {
    super(
      "headscale rejects policy updates because policy.mode is not 'database'",
    )
    this.name = 'PolicyReadOnlyError'
  }
}

// Generate a headscale v2 policy from the groups table:
//  - One ok_tag per group, with the owner set to that group's headscale user name (must include @)
//  - One accept rule per group: members with the same ok_tag can communicate; no cross-group rules → deny → groups cannot see one another
//  - Nodes without an ok_tag (pending approval) are not in any rules → invisible to everyone
export function buildPolicy(
  rows: { hsUserName: string; okTag: string }[],
): string {
  const tagOwners: Record<string, string[]> = {}
  const acls: { action: 'accept'; src: string[]; dst: string[] }[] = []
  for (const g of rows) {
    tagOwners[g.okTag] = [`${g.hsUserName}@`]
    acls.push({ action: 'accept', src: [g.okTag], dst: [`${g.okTag}:*`] })
  }
  return JSON.stringify({ tagOwners, acls }, null, 2)
}

// Apply the policy for the group set that should exist after the operation. The caller must invoke this before changing any data:
// if it cannot be pushed, the entire operation fails, avoiding a partial result where "headscale was changed but the panel reported an error".
// When rows is empty, apply an empty policy (= deny-all); deleteGroup has already ensured that the group contains no nodes.
export async function applyPolicy(
  rows: { hsUserName: string; okTag: string }[],
): Promise<void> {
  try {
    await setPolicy(buildPolicy(rows))
  } catch (e) {
    if (
      e instanceof HeadscaleError &&
      /modes other than|policy\.mode/i.test(e.message)
    ) {
      throw new PolicyReadOnlyError()
    }
    throw e
  }
}
