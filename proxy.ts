// Next.js 16：middleware 已更名为 proxy。
// 这里只做 optimistic check（仅看 cookie 是否存在），真正的 JWT 校验在
// 受保护 page / server action 内的 requireSession()（文档明确：proxy 不做完整鉴权）。

import createMiddleware from 'next-intl/middleware'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { routing } from './i18n/routing'

const COOKIE = 'hs_session'
const handleI18nRouting = createMiddleware(routing)

function parsePathname(pathname: string) {
  const [, maybeLocale, ...rest] = pathname.split('/')
  const hasLocale = routing.locales.some((locale) => locale === maybeLocale)

  return {
    locale: hasLocale ? maybeLocale : routing.defaultLocale,
    pathname: hasLocale ? `/${rest.join('/')}` : pathname,
  }
}

function withLocale(pathname: string, locale: string) {
  return locale === routing.defaultLocale ? pathname : `/${locale}${pathname}`
}

export function proxy(request: NextRequest) {
  const response = handleI18nRouting(request)
  if (response.headers.has('location')) {
    return response
  }

  const { locale, pathname } = parsePathname(request.nextUrl.pathname)
  const hasCookie = request.cookies.has(COOKIE)

  // 注意：这里只能做 cookie 存在性判断，不能把“有 cookie”等同于“JWT 有效”。
  // 否则 SESSION_SECRET 更换后，旧 cookie 会造成 /login <-> /dashboard 循环。
  if (pathname !== '/login' && !hasCookie) {
    const url = request.nextUrl.clone()
    url.pathname = withLocale('/login', locale)
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  // 除 API、Next 静态资源、favicon 等资源外都过 proxy。
  matcher: ['/((?!api|trpc|_next|_vercel|.*\\..*).*)'],
}
