import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const uiSrc = fileURLToPath(new URL('../ui/src', import.meta.url))

export default defineConfig({
  // Served under /playground/ in dev; in prod it is co-located under the
  // frontend's base path (e.g. /ReleaseBoardGameP2P/playground/) via
  // VITE_BASE_URL. BrowserRouter derives its basename from import.meta.env.BASE_URL.
  base: process.env.VITE_BASE_URL ?? '/playground/',
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@release/ui', replacement: `${uiSrc}/index.ts` },
      { find: '@', replacement: uiSrc },
    ],
  },
  server: {
    port: 5180,
    strictPort: true,
  },
})
