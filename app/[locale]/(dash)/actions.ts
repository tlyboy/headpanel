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

// 切换 super 正在扮演的组。传 null 表示回到自己的 super 身份。
// 全程用真实身份判定：降级后的会话 role 已经是 group，用 requireSuper 会把
// 「切回去」这条路也堵死。
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
