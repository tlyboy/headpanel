import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

const rawBasePath = process.env.HEADPANEL_BASE_PATH?.trim() ?? ''
if (
  rawBasePath &&
  (!rawBasePath.startsWith('/') ||
    rawBasePath === '/' ||
    rawBasePath.endsWith('/'))
) {
  throw new Error(
    'HEADPANEL_BASE_PATH must start with / and must not end with /',
  )
}

const nextConfig: NextConfig = {
  compress: false,
  reactCompiler: true,
  basePath: rawBasePath,
  experimental: {
    optimizePackageImports: ['lucide-react', 'radix-ui'],
  },
}

export default withNextIntl(nextConfig)
