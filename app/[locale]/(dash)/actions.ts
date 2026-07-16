'use server'

import { getLocale } from 'next-intl/server'
import { destroySession, requireSession } from '@/lib/auth'
import { auditAfter } from '@/lib/db'
import { redirect } from '@/i18n/navigation'

export async function logout() {
  const locale = await getLocale()
  await requireSession()
  await destroySession()
  auditAfter('logout')
  redirect({ href: '/login', locale })
}
