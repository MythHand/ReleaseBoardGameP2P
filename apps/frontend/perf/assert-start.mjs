import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

const [directory, logFile] = process.argv.slice(2)
const dist = resolve(directory, 'dist')
const manifest = JSON.parse(await readFile(resolve(dist, '.vite/manifest.json'), 'utf8'))
const entries = Object.entries(manifest)
const filesFor = (chunk) => [chunk.file, ...(chunk.css ?? [])]
const loaded = new Set(
  entries.filter(([, chunk]) => chunk.isEntry).flatMap(([, chunk]) => filesFor(chunk)),
)
const emitted = new Set(Object.values(manifest).flatMap(filesFor))
const logs = logFile ? JSON.parse(await readFile(logFile, 'utf8')) : []
for (const request of logs.flatMap((log) => log.requests ?? [log])) {
  const pathname = new URL(request.url, 'http://localhost').pathname
  const file = [...emitted].find((candidate) => pathname.endsWith(`/${candidate}`))
  if (file) loaded.add(file)
}
for (const file of loaded) {
  const chunk = entries.find(([, candidate]) => candidate.file === file)?.[1]
  for (const dependency of chunk?.imports ?? []) {
    for (const asset of filesFor(manifest[dependency])) loaded.add(asset)
  }
}

const forbidden =
  /\/packages\/engine\/|\/peerjs\/|\/peerjs@|\/network\/|\/pages\/(board|lobby)\/|\/features\/(create-lobby|join-lobby|rules|voice-chat)\/|\/SessionRuntime\.tsx|\/locales\/[^/]+\/rules\.json(?!\?url)|\/ui\/src\/table\//
const deferred = new Map(
  entries
    .filter(
      ([key, chunk]) => forbidden.test(`/${chunk.src ?? key}`) || chunk.name === 'vendor-peer',
    )
    .flatMap(([key, chunk]) => filesFor(chunk).map((file) => [file, chunk.src ?? key])),
)
const findings = []
const sizes = { js: { raw: 0, gzip: 0 }, css: { raw: 0, gzip: 0 } }
for (const file of loaded) {
  if (deferred.has(file)) findings.push({ file, module: deferred.get(file) })
  if (!/\.(js|css)$/.test(file)) continue
  const bytes = await readFile(resolve(dist, file))
  const size = sizes[file.endsWith('.js') ? 'js' : 'css']
  size.raw += bytes.length
  size.gzip += gzipSync(bytes).length
  if (!file.endsWith('.js')) continue
  // Diagnostic builds use Vite's --sourcemap hidden; normal builds need no maps.
  const map = JSON.parse(await readFile(resolve(dist, `${file}.map`), 'utf8'))
  for (const source of map.sources) {
    if (forbidden.test(`/${source.replaceAll('\\', '/')}`)) findings.push({ file, module: source })
  }
}
process.stdout.write(`${JSON.stringify({ loaded: [...loaded], sizes, findings }, null, 2)}\n`)
process.exitCode = findings.length > 0 ? 1 : 0
