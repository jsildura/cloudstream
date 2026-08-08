import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    // globals: true so @testing-library/react can auto-register its
    // afterEach cleanup (without it, renders leak across tests).
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.js'],
  },
})
