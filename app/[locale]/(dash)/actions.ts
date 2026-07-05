'use server'

import { getLocale } from 'next-intl/server'
import { destroySession, requireSession } from '@/lib/auth'
import { audit } from '@/lib/db'
import { redirect } from '@/i18n/navigation'

export async function logout() {
  const locale = await getLocale()
  await requireSession()
  await destroySession()
  await audit('logout')
  redirect({ href: '/login', locale })
}
