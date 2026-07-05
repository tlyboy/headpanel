import 'server-only'

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { getLocale } from 'next-intl/server'
import { SignJWT, jwtVerify } from 'jose'
import { eq } from 'drizzle-orm'
import { redirect } from '@/i18n/navigation'
import { db } from '@/lib/db'
import { admins } from '@/lib/db/schema'
import { requiredEnv } from '@/lib/env'

const COOKIE = 'hs_session'
const MAX_AGE = 60 * 60 * 24 * 7 // 7 天

function secret() {
  return new TextEncoder().encode(requiredEnv('SESSION_SECRET'))
}

export type Role = 'super' | 'group'

export interface Session {
  sub: string // 登录账号 username
  role: Role
  gid: number | null // group 角色归属的组 id；super 为 null
}

// ---- 密码哈希（node:crypto scrypt，内置不引依赖）----
// 存储格式 "<saltHex>:<hashHex>"
export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 32)
  return `${salt.toString('hex')}:${hash.toString('hex')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':')
  if (!saltHex || !hashHex) return false
  const salt = Buffer.from(saltHex, 'hex')
  const expected = Buffer.from(hashHex, 'hex')
  const actual = scryptSync(password, salt, expected.length)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

// First bootstraps a super account from explicit environment variables.
export function ensureSeedAdmin() {
  const count = db.select().from(admins).all().length
  if (count > 0) return
  const username = requiredEnv('ADMIN_USERNAME')
  const pw = requiredEnv('ADMIN_PASSWORD')
  db.insert(admins)
    .values({
      username,
      passwordHash: hashPassword(pw),
      role: 'super',
      groupId: null,
    })
    .run()
}

// 校验账号密码，成功返回该账号；失败返回 null
export function authenticate(username: string, password: string) {
  ensureSeedAdmin()
  const row = db.select().from(admins).where(eq(admins.username, username)).get()
  if (!row) return null
  if (!verifyPassword(password, row.passwordHash)) return null
  return row
}

export async function createSession(payload: Session) {
  const token = await new SignJWT({ role: payload.role, gid: payload.gid })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret())

  const jar = await cookies()
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE,
  })
}

export async function destroySession() {
  const jar = await cookies()
  jar.delete(COOKIE)
}

export async function getSession(): Promise<Session | null> {
  const jar = await cookies()
  const token = jar.get(COOKIE)?.value
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secret())
    const role: Role = payload.role === 'super' ? 'super' : 'group'
    const gid = typeof payload.gid === 'number' ? payload.gid : null
    return { sub: String(payload.sub ?? ''), role, gid }
  } catch {
    return null
  }
}

// 在受保护的 page / server action 内调用：未登录直接 redirect
export async function requireSession(): Promise<Session> {
  const s = await getSession()
  if (!s) {
    const locale = await getLocale()
    redirect({ href: '/login', locale })
    throw new Error('Redirect failed')
  }
  return s
}

// 仅超管可访问：非 super 踢回 dashboard
export async function requireSuper(): Promise<Session> {
  const s = await requireSession()
  if (s.role !== 'super') {
    const locale = await getLocale()
    redirect({ href: '/dashboard', locale })
    throw new Error('Redirect failed')
  }
  return s
}
