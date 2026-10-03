import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath, URL } from 'node:url'
import generouted from '@generouted/react-router/plugin'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import svgr from 'vite-plugin-svgr'

const uiSrc = fileURLToPath(new URL('../ui/src', import.meta.url))
const appSrc = fileURLToPath(new URL('./src', import.meta.url))
const engineSrc = fileURLToPath(new URL('../../packages/engine/src', import.meta.url))
const translationSrc = fileURLToPath(
  new URL('../../packages/translation/src/index.ts', import.meta.url),
)
const debugLogs = fileURLToPath(new URL('./debug/logs', import.meta.url))

// THE DEBUG STAND'S RECORDINGS land in the project, not in the browser's
// downloads (#168): a recording is there to be read by whoever is working on the
// board, and the downloads folder is one an agent on this machine cannot open.
// Dev server only; the name is checked so nothing is written outside the folder.
function debugLogSink(): Plugin {
  return {
    name: 'release:debug-log',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__debug/log', (req, res) => {
        const name = new URL(req.url ?? '/', 'http://stand').searchParams.get('name') ?? ''
        if (req.method !== 'POST' || !/^[\w.-]+\.json$/.test(name)) {
          res.statusCode = 400
          res.end()
          return
        }
        const chunks: Buffer[] = []
        req.on('data', (chunk: Buffer) => chunks.push(chunk))
        req.on('end', () => {
          mkdir(debugLogs, { recursive: true })
            .then(() => writeFile(`${debugLogs}/${name}`, Buffer.concat(chunks)))
            .then(() => res.end(`apps/frontend/debug/logs/${name}`))
            .catch(() => {
              res.statusCode = 500
              res.end()
            })
        })
      })
    },
  }
}

export default defineConfig({
  base: process.env.VITE_BASE_URL ?? '/',
  plugins: [
    debugLogSink(),
    react(),
    // `*.svg?react` imports resolve to React components (plain `*.svg` stay
    // asset URLs). @release/ui is consumed from source and its CardParallax
    // config pulls in svgr-imported category icons.
    svgr(),
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
      // The animation layer is its own entry: a vocabulary and its steps, not
      // a component. Must precede the bare '@release/ui' find — these are matched
      // in order, and the shorter one would swallow the subpath.
      { find: '@release/ui/animations', replacement: `${uiSrc}/animations/index.ts` },
      { find: '@release/ui/global.css', replacement: `${uiSrc}/design/global.css` },
      { find: '@release/ui/tokens.css', replacement: `${uiSrc}/design/tokens.css` },
      { find: '@release/ui', replacement: `${uiSrc}/index.ts` },
      { find: '@release/engine/fake', replacement: `${engineSrc}/fake/index.ts` },
      { find: '@release/engine', replacement: `${engineSrc}/index.ts` },
      { find: '@release/translation', replacement: translationSrc },
      { find: '~', replacement: appSrc },
      { find: '@', replacement: uiSrc },
    ],
  },
  server: {
    // The /playground/ link opens the playground app (a separate Vite app on
    // :5180 — it pins that with strictPort, so this target must track it).
    // Proxy keeps it same-origin in dev so href="/playground/" works;
    // ws:true forwards the playground's HMR socket. In prod, co-locate the
    // playground build under /playground/ behind the same host.
    proxy: {
      '/playground': {
        target: 'http://localhost:5180',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
