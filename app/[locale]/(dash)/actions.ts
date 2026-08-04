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

// 切换 super 的「当前组」视图。传 null 表示看全部。
// 只写 cookie，真正的校验在服务端每次读取时做（见 lib/active-group.ts）——
// 这样即便 cookie 被改成别的组 id，也只会落回「全部」而不会越权。
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
