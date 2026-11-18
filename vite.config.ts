import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Relative asset paths: the same build works under /whetstone/ on GitHub Pages and on other hosts.
  base: './',
  plugins: [react()],
  // Everything in the bundle is needed on the first screen, so splitting would not make it usable sooner.
  build: { chunkSizeWarningLimit: 1100 },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
})
