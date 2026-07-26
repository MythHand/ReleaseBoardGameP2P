import { parseConfig } from './config.js'
import { createServer } from './server.js'

const config = parseConfig(process.env)
const server = createServer(config)

server.listen(config.port, () => {
  console.log(`peerserver listening on :${config.port} (peer path: ${config.peerPath})`)
})

// Containers stop with SIGTERM. server.close() waits for open sockets, and
// PeerServer holds long-lived websockets — so fall back to a hard exit.
function shutdown(signal: string): void {
  console.log(`${signal} received, shutting down`)
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 5000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
