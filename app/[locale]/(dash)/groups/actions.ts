'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { eq } from 'drizzle-orm'
import { requireSuper } from '@/lib/auth'
import { auditAfter, db } from '@/lib/db'
import { admins } from '@/lib/db/schema'
import {
  createGroup,
  createGroupAdmin,
  deleteGroup,
  GroupNotEmptyError,
} from '@/lib/groups'
import { HeadscaleError } from '@/lib/headscale'

export interface GroupResult {
  ok: boolean
  error?: string
}

function errMsg(e: unknown, unknownMessage: string): string {
  if (e instanceof HeadscaleError) return e.message
  return e instanceof Error ? e.message : unknownMessage
}

// Create a group: create a user in headscale → save to the database → recalculate the ACL → issue the group admin account.
// Check that the account name is available first, to avoid getting stuck issuing the account after the group is created (reduces incomplete setups).
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
    const group = await deleteGroup(id)
    // The group has been deleted, so group_id would become a dangling reference; therefore, include the identifier in target/detail (consistent with group.create).
    auditAfter(
      'group.delete',
      group.slug,
      `name=${group.name} hsUser=${group.hsUserName}`,
      { groupId: null, actor: session.sub },
    )
    revalidatePath('/groups')
    revalidatePath('/preauthkeys')
    return { ok: true }
  } catch (e) {
    if (e instanceof GroupNotEmptyError) {
      return {
        ok: false,
        error: t('groupNotEmpty', {
          nodeCount: e.nodeCount,
          keyCount: e.keyCount,
        }),
      }
    }
    return { ok: false, error: errMsg(e, t('unknown')) }
  }
}
