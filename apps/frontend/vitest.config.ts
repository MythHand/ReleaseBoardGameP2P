import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const uiSrc = fileURLToPath(new URL('../ui/src', import.meta.url))
const appSrc = fileURLToPath(new URL('./src', import.meta.url))
const engineSrc = fileURLToPath(new URL('../../packages/engine/src', import.meta.url))
const svgStub = fileURLToPath(new URL('./src/test/SvgStub.tsx', import.meta.url))
const translationSrc = fileURLToPath(
  new URL('../../packages/translation/src/index.ts', import.meta.url),
)

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      // Must precede the '@' alias: these imports are matched by their suffix,
      // not their prefix, and the asset path would otherwise win.
      { find: /^.*\.svg\?react$/, replacement: svgStub },
      { find: '@release/ui', replacement: `${uiSrc}/index.ts` },
      { find: '@release/engine/fake', replacement: `${engineSrc}/fake/index.ts` },
      { find: '@release/engine', replacement: `${engineSrc}/index.ts` },
      { find: '@release/translation', replacement: translationSrc },
      { find: '~', replacement: appSrc },
      { find: '@', replacement: uiSrc },
    ],
  },
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test-setup.ts'] },
})
