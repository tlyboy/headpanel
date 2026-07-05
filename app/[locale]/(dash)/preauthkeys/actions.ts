'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { eq } from 'drizzle-orm'
import { requireSession } from '@/lib/auth'
import { getGroup, visibleGroups } from '@/lib/groups'
import { audit, db } from '@/lib/db'
import { preauthKeys } from '@/lib/db/schema'
import { createPreAuthKey, HeadscaleError } from '@/lib/headscale'
import { headscaleCli } from '@/lib/headscale-cli'

// review: no tag; joins without a ticket → quarantined and pending approval
// direct: includes the group's ok_tag; admitted immediately (communication within the group is allowed)
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
  groupId: number
  reusable: boolean
  ephemeral: boolean
  days: number
  mode: AccessMode
}): Promise<KeyResult> {
  const session = await requireSession()
  const t = await getTranslations('actionErrors')
  // Verify the target group is visible in the session (prevent unauthorized key creation for another group)
  const group = getGroup(input.groupId)
  if (!group || !visibleGroups(session).some((g) => g.id === group.id)) {
    return { ok: false, error: t('forbiddenGroup') }
  }
  const days = Math.max(1, Math.min(36500, Math.floor(input.days)))
  const expiration = new Date(Date.now() + days * 86400_000).toISOString()
  const aclTags = input.mode === 'direct' ? [group.okTag] : []
  try {
    const k = await createPreAuthKey({
      userId: group.hsUserId,
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
          groupId: group.id,
        })
        .onConflictDoUpdate({
          target: preauthKeys.headscaleId,
          set: { key: k.key, mode: input.mode, groupId: group.id },
        })
        .run()
    } catch {
      // Failure to back up the plaintext does not affect key creation.
    }
    await audit(
      'preauthkey.create',
      k.id,
      `group=${group.slug} reusable=${input.reusable} ephemeral=${input.ephemeral} days=${days} mode=${input.mode}`,
      { groupId: group.id, actor: session.sub },
    )
    revalidatePath('/preauthkeys')
    return { ok: true, key: k.key }
  } catch (e) {
    return { ok: false, error: errMsg(e, t('unknown')) }
  }
}

// Delete key: headscale supports `preauthkeys delete` (physical deletion; removed from the list).
// The REST API does not support deletion by id, so use the CLI to delete by id (available when the backend and headscale run on the same host).
// --force skips interactive confirmation (required because execFile has no TTY). After deletion, the key disappears from the list and cannot be recovered.
export async function deleteKeyAction(id: string): Promise<KeyResult> {
  const session = await requireSession()
  const t = await getTranslations('actionErrors')
  // Use the local group_id to validate ownership (only super can delete older keys with no local record).
  const local = db
    .select()
    .from(preauthKeys)
    .where(eq(preauthKeys.headscaleId, id))
    .get()
  if (session.role !== 'super') {
    if (!local || local.groupId == null || local.groupId !== session.gid) {
      return { ok: false, error: t('forbiddenDeleteKey') }
    }
  }
  try {
    await headscaleCli(['preauthkeys', 'delete', '-i', String(id), '--force'])
    try {
      db.delete(preauthKeys).where(eq(preauthKeys.headscaleId, id)).run()
    } catch {
      /* Failure to delete the local plaintext record can be ignored. */
    }
    await audit('preauthkey.delete', id, undefined, {
      groupId: local?.groupId ?? null,
      actor: session.sub,
    })
    revalidatePath('/preauthkeys')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e, t('unknown')) }
  }
}
