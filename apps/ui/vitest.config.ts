import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // svgr matches the runtime apps: `*.svg?react` imports (the tintable category
  // icons in the composed card face) resolve to React components in tests too.
  plugins: [react(), svgr()],
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  test: { environment: 'jsdom', globals: true },
})
