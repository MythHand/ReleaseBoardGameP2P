import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const [directory, logFile] = process.argv.slice(2)
const chunks = JSON.parse(await readFile(resolve(directory, 'chunks.json'), 'utf8'))
const logs = logFile ? JSON.parse(await readFile(logFile, 'utf8')) : []
const loaded = new Set(chunks.filter(chunk => chunk.isEntry).map(chunk => chunk.file))
for (const request of logs.flatMap(log => log.requests ?? [log])) {
  const file = request.url?.split('/ReleaseBoardGameP2P/')[1]?.split('?')[0]
  if (file) loaded.add(file)
}
for (const file of loaded) {
  for (const dependency of chunks.find(chunk => chunk.file === file)?.imports ?? []) loaded.add(dependency)
}
const forbidden = /\/packages\/engine\/|\/peerjs\/|\/peerjs@|\/network\/voice\/|\/pages\/board\/|\/features\/(create-lobby|join-lobby)\/|\/locales\/[^/]+\/rules\.json(?!\?url)|\/ui\/src\/table\/.+\.css/
const findings = chunks.filter(chunk => loaded.has(chunk.file)).flatMap(chunk =>
  chunk.modules.filter(module => module.bytes > 0 && forbidden.test(module.id)).map(module => ({ file: chunk.file, module: module.id })),
)
console.log(JSON.stringify({ loaded: [...loaded], findings }, null, 2))
process.exitCode = findings.length ? 1 : 0
