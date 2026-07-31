import { defineConfig } from 'vitest/config'

// The adapters themselves are pure logic, but `@release/ui`'s barrel pulls in
// components that touch the DOM at module scope, so the suite runs jsdom —
// same environment the kit's own tests use.
export default defineConfig({
  test: { environment: 'jsdom', globals: true },
})
