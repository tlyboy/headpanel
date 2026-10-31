import { hasLocale } from 'next-intl'
import { getRequestConfig } from 'next-intl/server'
import { locale as rootLocale } from 'next/root-params'
import { routing } from './routing'

// Reading the [locale] root param keeps prerendering independent of request headers and of render order.
// Server Actions and Route Handlers have no root params, so they fall back to the locale header set by proxy.ts.
async function routeLocale() {
  try {
    return await rootLocale()
  } catch {
    return undefined
  }
}

export default getRequestConfig(async ({ locale: explicit, requestLocale }) => {
  let locale = explicit ?? (await routeLocale()) ?? (await requestLocale)

  if (!hasLocale(routing.locales, locale)) {
    locale = routing.defaultLocale
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  }
})
