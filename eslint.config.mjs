import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import { version as reactVersion } from 'react'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
  {
    // When automatically detecting the React version, eslint-plugin-react 7.37 calls
    // context.getFilename(), which was removed in ESLint 10, causing lint to crash. Specify the installed version directly to skip detection.
    settings: { react: { version: reactVersion } },
  },
  {
    rules: {
      // The underscore prefix is the existing "intentionally discarded" convention in these projects, for example, when destructuring fields from props
      // that should not be passed down. The default rule does not recognize this convention and reports all of them as unused.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
    },
  },
])

export default eslintConfig
