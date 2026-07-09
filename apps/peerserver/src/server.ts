import http from 'node:http'
import express from 'express'
import { ExpressPeerServer } from 'peer'
import type { Config } from './config.js'

export function createServer(config: Config): http.Server {
  const app = express()
  const server = http.createServer(app)

  // Registered before the PeerServer mount so a peerPath of '/' can't shadow it.
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  const peerServer = ExpressPeerServer(server, { key: config.peerKey })
  peerServer.on('connection', (client) => {
    console.log(`peer connected: ${client.getId()}`)
  })
  peerServer.on('disconnect', (client) => {
    console.log(`peer disconnected: ${client.getId()}`)
  })
  app.use(config.peerPath, peerServer)

  return server
}
