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
  renameGroup,
  resetGroupAdminPassword,
  GroupNotEmptyError,
  ProtectedGroupError,
} from '@/lib/groups'
import { HeadscaleError } from '@/lib/headscale'
import { PolicyReadOnlyError } from '@/lib/policy'

export interface GroupResult {
  ok: boolean
  error?: string
}

type ActionErrorT = Awaited<ReturnType<typeof getTranslations<'actionErrors'>>>

function errMsg(e: unknown, t: ActionErrorT): string {
  // When policy.mode=file, headscale refuses to apply the ACL, and the raw 500 message is meaningless to users.
  if (e instanceof PolicyReadOnlyError) return t('policyReadOnly')
  if (e instanceof ProtectedGroupError) {
    return t('groupProtected', { slug: e.slug })
  }
  if (e instanceof GroupNotEmptyError) {
    return t('groupNotEmpty', { nodeCount: e.nodeCount, keyCount: e.keyCount })
  }
  if (e instanceof HeadscaleError) return e.message
  return e instanceof Error ? e.message : t('unknown')
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
    return { ok: false, error: errMsg(e, t) }
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
    return { ok: false, error: errMsg(e, t) }
  }
}

export async function renameGroupAction(
  id: number,
  name: string,
): Promise<GroupResult> {
  const [session, t] = await Promise.all([
    requireSuper(),
    getTranslations('actionErrors'),
  ])
  try {
    const g = renameGroup(id, name)
    auditAfter('group.rename', g.slug, `name=${g.name}`, {
      groupId: g.id,
      actor: session.sub,
    })
    revalidatePath('/groups')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e, t) }
  }
}

// Reset the group admin password. The audit log records only the account name, not the password itself.
export async function resetGroupAdminPasswordAction(input: {
  groupId: number
  adminId: number
  password: string
}): Promise<GroupResult> {
  const [session, t] = await Promise.all([
    requireSuper(),
    getTranslations('actionErrors'),
  ])
  try {
    const username = resetGroupAdminPassword(input)
    auditAfter('group.resetPassword', username, undefined, {
      groupId: input.groupId,
      actor: session.sub,
    })
    revalidatePath('/groups')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e, t) }
  }
}
