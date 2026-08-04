import 'server-only'

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { getLocale } from 'next-intl/server'
import { SignJWT, jwtVerify } from 'jose'
import { eq } from 'drizzle-orm'
import { redirect } from '@/i18n/navigation'
import { db } from '@/lib/db'
import { admins, groups } from '@/lib/db/schema'
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
  /** super 正以某个组的身份行事（见 getSession）；真实身份仍是 super */
  impersonating?: boolean
}

// super 在侧边栏选中某个组后，整个面板都按「该组管理员」来跑：不只列表收敛，
// requireSuper 也会把组管理/子网/网段这些超管页面挡在外面，误操作伤不到别的组。
// 放在会话层做，而不是给每个页面传参数——漏传一处就是一个越权口子。
export const IMPERSONATE_COOKIE = 'hs_group'

// 只认真实存在的组；cookie 是客户端可改的，改成别的值最多让降级失效，
// 绝不会凭空得到权限（降级只会收窄）。
async function readImpersonatedGid(): Promise<number | null> {
  const raw = (await cookies()).get(IMPERSONATE_COOKIE)?.value
  if (!raw) return null
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0) return null
  const row = db.select().from(groups).where(eq(groups.id, id)).get()
  return row ? id : null
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
  const row = db
    .select()
    .from(admins)
    .where(eq(admins.username, username))
    .get()
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

// JWT 里的真实身份，不受组切换影响。切换器本身、以及切换动作必须用它，
// 否则 super 一旦切进某个组就再也切不回来了。
export const getRealSession = cache(
  async function getRealSession(): Promise<Session | null> {
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
  },
)

// 业务侧一律用这个：super 选了组就降级成该组的 group 角色。
export const getSession = cache(
  async function getSession(): Promise<Session | null> {
    const real = await getRealSession()
    if (!real || real.role !== 'super') return real
    const gid = await readImpersonatedGid()
    if (gid == null) return real
    return { sub: real.sub, role: 'group', gid, impersonating: true }
  },
)

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

// 真实身份未登录直接 redirect；不受组切换降级影响
export async function requireRealSession(): Promise<Session> {
  const s = await getRealSession()
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
