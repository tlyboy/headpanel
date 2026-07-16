'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { eq } from 'drizzle-orm'
import { requireSuper } from '@/lib/auth'
import { auditAfter, db } from '@/lib/db'
import { admins } from '@/lib/db/schema'
import { createGroup, createGroupAdmin, deleteGroup } from '@/lib/groups'
import { HeadscaleError } from '@/lib/headscale'

export interface GroupResult {
  ok: boolean
  error?: string
}

function errMsg(e: unknown, unknownMessage: string): string {
  if (e instanceof HeadscaleError) return e.message
  return e instanceof Error ? e.message : unknownMessage
}

// 建组：headscale 建 user → 落库 → 重算 ACL → 发组管理员账号。
// 先校验账号名可用，避免建完组后卡在发账号（减少半成品）。
export async function createGroupAction(input: {
  name: string
  slug: string
  adminUsername: string
  adminPassword: string
}): Promise<GroupResult> {
  const [session, t] = await Promise.all([
    requireSuper(),
    getTranslations('actionErrors'),
  ])
  const username = input.adminUsername.trim()
  if (!username) return { ok: false, error: t('groupAdminRequired') }
  if (input.adminPassword.length < 6)
    return { ok: false, error: t('groupAdminPasswordLength') }
  const dup = db
    .select()
    .from(admins)
    .where(eq(admins.username, username))
    .get()
  if (dup) return { ok: false, error: t('accountExists', { username }) }

  try {
    const group = await createGroup({ name: input.name, slug: input.slug })
    createGroupAdmin({
      groupId: group.id,
      username,
      password: input.adminPassword,
    })
    auditAfter('group.create', group.slug, `admin=${username}`, {
      groupId: group.id,
      actor: session.sub,
    })
    revalidatePath('/groups')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e, t('unknown')) }
  }
}

export async function deleteGroupAction(id: number): Promise<GroupResult> {
  const [session, t] = await Promise.all([
    requireSuper(),
    getTranslations('actionErrors'),
  ])
  try {
    await deleteGroup(id)
    auditAfter('group.delete', String(id), undefined, { actor: session.sub })
    revalidatePath('/groups')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e, t('unknown')) }
  }
}
