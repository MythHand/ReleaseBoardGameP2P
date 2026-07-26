import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import svgr from 'vite-plugin-svgr'

const uiSrc = fileURLToPath(new URL('../ui/src', import.meta.url))
// central translation catalog consumed as raw data (JSON), so a story can feed a
// component its localized copy from the single source of truth
const translationSrc = fileURLToPath(new URL('../../packages/translation/src', import.meta.url))

export default defineConfig({
  // Served under /playground/ in dev; in prod it is co-located under the
  // frontend's base path (e.g. /ReleaseBoardGameP2P/playground/) via
  // VITE_BASE_URL. BrowserRouter derives its basename from import.meta.env.BASE_URL.
  base: process.env.VITE_BASE_URL ?? '/playground/',
  // svgr: `*.svg?react` imports resolve to React components (plain `*.svg`
  // imports stay asset URLs). Used for the tintable CardParallax category icons.
  plugins: [react(), svgr()],
  resolve: {
    alias: [
      { find: '@release/ui', replacement: `${uiSrc}/index.ts` },
      { find: '@release/translation', replacement: translationSrc },
      { find: '@', replacement: uiSrc },
    ],
  },
  server: {
    port: 5180,
    strictPort: true,
  },
})
