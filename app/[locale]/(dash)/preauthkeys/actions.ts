'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { eq } from 'drizzle-orm'
import { requireSession } from '@/lib/auth'
import { getGroup, visibleGroups } from '@/lib/groups'
import { auditAfter, db } from '@/lib/db'
import { preauthKeys } from '@/lib/db/schema'
import {
  createPreAuthKey,
  deletePreAuthKey,
  HeadscaleError,
} from '@/lib/headscale'

// review：不带 tag，接入后无门票 → 被隔离、进待审批
// direct：带组 ok_tag，接入即放行（组内互通）
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
  const [session, t] = await Promise.all([
    requireSession(),
    getTranslations('actionErrors'),
  ])
  // 校验目标组在会话可见范围内（防越权给他组发 key）
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
    // 存明文（headscale 之后只给掩码），供每个 key 弹窗拼安装命令
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
      // 明文备份失败不影响 key 已创建
    }
    auditAfter(
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

// v0.28/v0.29 均支持 DELETE /api/v1/preauthkey?id=...，无需与 Headscale 同机。
export async function deleteKeyAction(id: string): Promise<KeyResult> {
  const [session, t] = await Promise.all([
    requireSession(),
    getTranslations('actionErrors'),
  ])
  // 用本地 group_id 做归属校验（无本地记录的旧 key 仅 super 可删）
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
    await deletePreAuthKey(id)
    try {
      db.delete(preauthKeys).where(eq(preauthKeys.headscaleId, id)).run()
    } catch {
      /* 本地明文记录删除失败可忽略 */
    }
    auditAfter('preauthkey.delete', id, undefined, {
      groupId: local?.groupId ?? null,
      actor: session.sub,
    })
    revalidatePath('/preauthkeys')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e, t('unknown')) }
  }
}
