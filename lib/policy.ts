import 'server-only'

import { db } from '@/lib/db'
import { groups } from '@/lib/db/schema'
import { setPolicy } from '@/lib/headscale'

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

// Recompute and apply the entire policy. When groups is empty, refuse to apply it (an empty policy = deny-all would accidentally disconnect existing nodes; pitfall 12).
export async function rebuildPolicy(): Promise<void> {
  const rows = db.select().from(groups).all()
  if (rows.length === 0) {
    throw new Error('rebuildPolicy: refusing to apply an empty policy because no groups exist')
  }
  await setPolicy(
    buildPolicy(rows.map((g) => ({ hsUserName: g.hsUserName, okTag: g.okTag }))),
  )
}
