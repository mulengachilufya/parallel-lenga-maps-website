import { defineConfig, globalIgnores } from 'eslint/config'
import coreWebVitals from 'eslint-config-next/core-web-vitals'
import typescript from 'eslint-config-next/typescript'

export default defineConfig([
  ...coreWebVitals,
  ...typescript,
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'public/vendor/**']),
  {
    // Legacy standalone seed scripts still run under CommonJS.
    files: ['scripts/seed-*.ts'],
    rules: {
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    // Report existing React Compiler diagnostics without blocking ordinary
    // changes. The runtime hooks and dependency rules retain their defaults.
    files: ['src/**/*.tsx'],
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/refs': 'warn',
    },
  },
])
