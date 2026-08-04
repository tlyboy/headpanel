'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getLocale } from 'next-intl/server'
import {
  destroySession,
  requireRealSession,
  requireSession,
  IMPERSONATE_COOKIE,
} from '@/lib/auth'
import { auditAfter } from '@/lib/db'
import { visibleGroups } from '@/lib/groups'
import { redirect } from '@/i18n/navigation'

export async function logout() {
  const locale = await getLocale()
  await requireSession()
  await destroySession()
  auditAfter('logout')
  redirect({ href: '/login', locale })
}

// Switch the group that super is impersonating. Pass null to return to super's own identity.
// Use the real identity for all checks: the downgraded session's role is already group, so using requireSuper would also block the
// way to "switch back".
export async function setActiveGroupAction(groupId: number | null) {
  const real = await requireRealSession()
  if (real.role !== 'super') throw new Error('Only super can switch groups')
  const jar = await cookies()
  if (groupId == null) {
    jar.delete(IMPERSONATE_COOKIE)
  } else {
    if (!visibleGroups(real).some((g) => g.id === groupId)) {
      throw new Error('Group is not visible to this session')
    }
    jar.set(IMPERSONATE_COOKIE, String(groupId), {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    })
  }
  revalidatePath('/', 'layout')
}
