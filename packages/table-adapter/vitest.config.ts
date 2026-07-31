import { defineConfig } from 'vitest/config'

// The adapters themselves are pure logic, but `@release/ui`'s barrel pulls in
// components that touch the DOM at module scope, so the suite runs jsdom —
// same environment the kit's own tests use. The `@/*` alias mirrors ui's own
// internal alias (see apps/ui/vite.config.ts) — required at runtime here too,
// since @release/ui is consumed from source.
export default defineConfig({
  resolve: {
    alias: {
      '@': new URL('../../apps/ui/src', import.meta.url).pathname,
    },
  },
  test: { environment: 'jsdom', globals: true },
})
