import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const uiSrc = fileURLToPath(new URL('../ui/src', import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: '@release/ui/global.css', replacement: `${uiSrc}/design/global.css` },
      { find: '@release/ui/tokens.css', replacement: `${uiSrc}/design/tokens.css` },
      { find: '@release/ui', replacement: `${uiSrc}/index.ts` },
      { find: '@', replacement: uiSrc },
    ],
  },
})
