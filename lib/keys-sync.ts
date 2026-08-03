import 'server-only'

import { inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { preauthKeys } from '@/lib/db/schema'
import { type HsPreAuthKey } from '@/lib/headscale'

// Remove rows from local preauth_keys that no longer exist in headscale (plaintext keys should not persist long-term).
// Historically, deleting a group caused headscale to also destroy that user's key, but the local backup remained.
// The input must be the full list just fetched from headscale; always skip an empty list to avoid clearing all plaintext backups
// if the API unexpectedly returns nothing.
export function pruneOrphanKeys(liveKeys: HsPreAuthKey[]): void {
  if (liveKeys.length === 0) return
  const liveIds = new Set(liveKeys.map((k) => k.id))
  const orphanIds = db
    .select({ headscaleId: preauthKeys.headscaleId })
    .from(preauthKeys)
    .all()
    .map((r) => r.headscaleId)
    .filter((id) => !liveIds.has(id))
  if (orphanIds.length) {
    db.delete(preauthKeys)
      .where(inArray(preauthKeys.headscaleId, orphanIds))
      .run()
  }
}
