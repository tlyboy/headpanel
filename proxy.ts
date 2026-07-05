// Next.js 16: middleware has been renamed to proxy.
// This only does an optimistic check (whether the cookie exists); the actual JWT validation happens in
// requireSession() inside protected pages / server actions (the docs explicitly state that proxy does not perform full authentication).

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

  // Note: This can only check whether the cookie exists; do not equate "cookie exists" with "JWT is valid."
  // Otherwise, after SESSION_SECRET changes, an old cookie will cause a /login <-> /dashboard loop.
  if (pathname !== '/login' && !hasCookie) {
    const url = request.nextUrl.clone()
    url.pathname = withLocale('/login', locale)
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  // Everything except API routes, Next static assets, favicon, and other resources goes through proxy.
  matcher: ['/((?!api|trpc|_next|_vercel|.*\\..*).*)'],
}
