'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { eq } from 'drizzle-orm'
import { requireSession } from '@/lib/auth'
import { approvedTag, resolveDefaultHsUser } from '@/lib/default-zone'
import { auditAfter, db } from '@/lib/db'
import { preauthKeys } from '@/lib/db/schema'
import { createPreAuthKey, deletePreAuthKey, HeadscaleError } from '@/lib/headscale'

// review: No tag; upon joining, there is no access tag, so the node is quarantined and awaits approval.
// direct: Includes an allow tag (approvedTag), so the node is allowed in immediately.
export type AccessMode = 'review' | 'direct'

export interface KeyResult {
  ok: boolean
  key?: string
  error?: string
}

function errMsg(e: unknown, unknownMessage: string): string {
  if (e instanceof HeadscaleError) return e.message
  return e instanceof Error ? e.message : unknownMessage
}

export async function createKeyAction(input: {
  reusable: boolean
  ephemeral: boolean
  days: number
  mode: AccessMode
}): Promise<KeyResult> {
  const [session, t] = await Promise.all([requireSession(), getTranslations('actionErrors')])
  const days = Math.max(1, Math.min(36500, Math.floor(input.days)))
  const expiration = new Date(Date.now() + days * 86400_000).toISOString()
  try {
    // Headscale requires a user when creating a key
    const userId = (await resolveDefaultHsUser()).id
    const aclTags = input.mode === 'direct' ? [approvedTag()] : []
    const k = await createPreAuthKey({
      userId,
      reusable: input.reusable,
      ephemeral: input.ephemeral,
      expiration,
      aclTags,
    })
    // Store the plaintext (Headscale only returns a masked value later) so each key's dialog can build the installation command.
    try {
      db.insert(preauthKeys)
        .values({
          headscaleId: k.id,
          key: k.key,
          mode: input.mode,
        })
        .onConflictDoUpdate({
          target: preauthKeys.headscaleId,
          set: { key: k.key, mode: input.mode },
        })
        .run()
    } catch {
      // Failure to back up the plaintext does not affect key creation.
    }
    auditAfter(
      'preauthkey.create',
      k.id,
      `reusable=${input.reusable} ephemeral=${input.ephemeral} days=${days} mode=${input.mode}`,
      { actor: session.sub },
    )
    revalidatePath('/preauthkeys')
    return { ok: true, key: k.key }
  } catch (e) {
    return { ok: false, error: errMsg(e, t('unknown')) }
  }
}

// Both v0.28 and v0.29 support DELETE /api/v1/preauthkey?id=..., so Headscale does not need to run on the same host.
export async function deleteKeyAction(id: string): Promise<KeyResult> {
  const [session, t] = await Promise.all([requireSession(), getTranslations('actionErrors')])
  try {
    await deletePreAuthKey(id)
    try {
      db.delete(preauthKeys).where(eq(preauthKeys.headscaleId, id)).run()
    } catch {
      /* Failure to delete the local plaintext record can be ignored. */
    }
    auditAfter('preauthkey.delete', id, undefined, { actor: session.sub })
    revalidatePath('/preauthkeys')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e, t('unknown')) }
  }
}
