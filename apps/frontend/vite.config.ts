import { fileURLToPath, URL } from 'node:url'
import generouted from '@generouted/react-router/plugin'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const uiSrc = fileURLToPath(new URL('../ui/src', import.meta.url))
const appSrc = fileURLToPath(new URL('./src', import.meta.url))
const translationSrc = fileURLToPath(
  new URL('../../packages/translation/src/index.ts', import.meta.url),
)

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    generouted({
      format: false,
      // Generated router lives in the app layer (FSD composition root).
      output: './src/app/router.ts',
      source: {
        routes: [
          './src/pages/**/[\\w[-]*.{jsx,tsx,mdx}',
          '!./src/pages/**/*.{test,spec}.{jsx,tsx,mdx}',
        ],
        modals: './src/pages/**/[+]*.{jsx,tsx,mdx}',
      },
    }),
  ],
  resolve: {
    alias: [
      { find: '@release/ui/global.css', replacement: `${uiSrc}/design/global.css` },
      { find: '@release/ui/tokens.css', replacement: `${uiSrc}/design/tokens.css` },
      { find: '@release/ui', replacement: `${uiSrc}/index.ts` },
      { find: '@release/translation', replacement: translationSrc },
      { find: '~', replacement: appSrc },
      { find: '@', replacement: uiSrc },
    ],
  },
  server: {
    // The /playground/ link opens the playground app (a separate Vite app on
    // :5174). Proxy keeps it same-origin in dev so href="/playground/" works;
    // ws:true forwards the playground's HMR socket. In prod, co-locate the
    // playground build under /playground/ behind the same host.
    proxy: {
      '/playground': {
        target: 'http://localhost:5174',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
