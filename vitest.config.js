import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // The real module is a virtual module provided by the VitePWA plugin at
      // build time; vitest doesn't load that plugin, so tests get this stub.
      'virtual:pwa-register/react': fileURLToPath(new URL('./src/test/mocks/pwa-register.js', import.meta.url)),
    },
  },
  test: {
    // globals: true so @testing-library/react can auto-register its
    // afterEach cleanup (without it, renders leak across tests).
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.js'],
    // The zxcstream watcher is a separate project with its own node:test
    // suite (run from key_rotation_watcher_project/watcher via `npm test`).
    exclude: ['**/node_modules/**', '**/dist/**', 'key_rotation_watcher_project/**'],
  },
})
