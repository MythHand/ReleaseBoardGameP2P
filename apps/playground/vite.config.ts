import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const uiSrc = fileURLToPath(new URL('../ui/src', import.meta.url))

export default defineConfig({
  // Served under /playground/ — both for the frontend dev proxy and prod
  // co-location behind one origin. BrowserRouter uses a matching basename.
  base: '/playground/',
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@release/ui', replacement: `${uiSrc}/index.ts` },
      { find: '@', replacement: uiSrc },
    ],
  },
  server: {
    port: 5174,
    strictPort: true,
  },
})
