'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getLocale } from 'next-intl/server'
import { destroySession, requireSession, requireSuper } from '@/lib/auth'
import { auditAfter } from '@/lib/db'
import { ACTIVE_GROUP_COOKIE } from '@/lib/active-group'
import { visibleGroups } from '@/lib/groups'
import { redirect } from '@/i18n/navigation'

export async function logout() {
  const locale = await getLocale()
  await requireSession()
  await destroySession()
  auditAfter('logout')
  redirect({ href: '/login', locale })
}

// Switch the super user's "current group" view. Pass null to view all groups.
// Only write the cookie; validation is performed on the server each time it's read (see lib/active-group.ts) —
// so even if the cookie is changed to another group ID, it will only fall back to "all" and won't grant unauthorized access.
export async function setActiveGroupAction(groupId: number | null) {
  await requireSuper()
  const jar = await cookies()
  if (groupId == null) {
    jar.delete(ACTIVE_GROUP_COOKIE)
  } else {
    if (!visibleGroups(await requireSession()).some((g) => g.id === groupId)) {
      throw new Error('Group is not visible to this session')
    }
    jar.set(ACTIVE_GROUP_COOKIE, String(groupId), {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    })
  }
  revalidatePath('/', 'layout')
}
