import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brotliCompressSync, gzipSync } from 'node:zlib'
import { build } from 'vite'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(process.argv[process.argv.indexOf('--out') + 1] || '/tmp/release-fe-report')
await mkdir(out, { recursive: true })
process.chdir(root)
await build({
  root,
  configFile: resolve(root, 'vite.config.ts'),
  base: '/ReleaseBoardGameP2P/',
  build: { outDir: resolve(out, 'dist'), emptyOutDir: true, manifest: true },
  plugins: [
    {
      name: 'release:performance-report',
      async writeBundle(_options, bundle) {
        const chunks = Object.values(bundle)
          .filter((item) => item.type === 'chunk')
          .map((item) => ({
            file: item.fileName,
            isEntry: item.isEntry,
            imports: item.imports,
            dynamicImports: item.dynamicImports,
            modules: Object.entries(item.modules).map(([id, module]) => ({
              id,
              bytes: module.renderedLength,
            })),
          }))
        const sizes = await Promise.all(
          Object.keys(bundle)
            .filter((file) => /\.(js|css)$/.test(file))
            .map(async (file) => {
              const bytes = await readFile(resolve(out, 'dist', file))
              return {
                file,
                raw: bytes.length,
                gzip: gzipSync(bytes).length,
                brotli: brotliCompressSync(bytes).length,
              }
            }),
        )
        await writeFile(resolve(out, 'chunks.json'), JSON.stringify(chunks, null, 2))
        await writeFile(resolve(out, 'sizes.json'), JSON.stringify(sizes, null, 2))
      },
    },
  ],
})
