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
    // Rust port of the React Compiler — runs natively in Turbopack instead of
    // going through Babel, so babel-plugin-react-compiler is no longer needed.
    turbopackRustReactCompiler: true,
    optimizePackageImports: ['radix-ui', 'simple-icons'],
  },
}

export default withNextIntl(nextConfig)
