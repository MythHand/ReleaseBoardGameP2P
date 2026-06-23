import { fileURLToPath, URL } from 'node:url'
import generouted from '@generouted/react-router/plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const uiSrc = fileURLToPath(new URL('../ui/src', import.meta.url))
const appSrc = fileURLToPath(new URL('./src', import.meta.url))

export default defineConfig({
  plugins: [react(), generouted({ format: false })],
  resolve: {
    alias: [
      { find: '@release/ui', replacement: `${uiSrc}/index.ts` },
      { find: '~', replacement: appSrc },
      { find: '@', replacement: uiSrc },
    ],
  },
  test: { environment: 'jsdom', globals: true },
})
