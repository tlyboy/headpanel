'use server'

import { getLocale, getTranslations } from 'next-intl/server'
import { authenticate, createSession } from '@/lib/auth'
import { auditAfter } from '@/lib/db'
import { redirect } from '@/i18n/navigation'

export interface LoginState {
  error?: string
}

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations('auth')])
  const username = String(formData.get('username') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  if (!username || !password) return { error: t('missing') }
  const admin = authenticate(username, password)
  if (!admin) {
    auditAfter('login.fail', username)
    return { error: t('invalid') }
  }
  await createSession({
    sub: admin.username,
    role: admin.role,
    gid: admin.groupId,
  })
  auditAfter('login.success', admin.username, undefined, {
    groupId: admin.groupId,
    actor: admin.username,
  })
  redirect({ href: '/dashboard', locale })
  return {}
}
