import { getLocale } from 'next-intl/server'
import { getSession } from '@/lib/auth'
import { redirect } from '@/i18n/navigation'

export default async function RootPage() {
  const [locale, session] = await Promise.all([getLocale(), getSession()])

  redirect({ href: session ? '/dashboard' : '/login', locale })
  return null
}
