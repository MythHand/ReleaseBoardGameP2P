import { defineConfig } from 'vitest/config'

// Node environment: the engine is pure logic with no DOM surface.
export default defineConfig({
  test: { environment: 'node', globals: true },
})
