import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const uiSrc = fileURLToPath(new URL('../ui/src', import.meta.url))
const appSrc = fileURLToPath(new URL('./src', import.meta.url))
const translationSrc = fileURLToPath(
  new URL('../../packages/translation/src/index.ts', import.meta.url),
)

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@release/ui', replacement: `${uiSrc}/index.ts` },
      { find: '@release/translation', replacement: translationSrc },
      { find: '~', replacement: appSrc },
      { find: '@', replacement: uiSrc },
    ],
  },
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test-setup.ts'] },
})
