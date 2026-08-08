import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'zxcstream-trial']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
    },
  },
  {
    // Node-runtime config files (vite.config.js runs in Node at dev/build time,
    // so `process`, `__dirname`, etc. are legit globals there).
    files: ['*.config.js', 'vite.config.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    // Vitest globals (describe/it/expect/vi...) for test files.
    files: ['**/*.{test,spec}.{js,jsx}'],
    languageOptions: {
      globals: globals.vitest,
    },
  },
])