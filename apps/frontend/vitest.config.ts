import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const uiSrc = fileURLToPath(new URL('../ui/src', import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@release/ui', replacement: `${uiSrc}/index.ts` },
      { find: '@', replacement: uiSrc },
    ],
  },
  test: { environment: 'jsdom', globals: true },
})
