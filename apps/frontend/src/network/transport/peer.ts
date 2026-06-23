import { type DataConnection, Peer } from 'peerjs'
import { createEnvelope, nextSeq, parseEnvelope } from '../envelope'
import type { Message, WireMessage } from '../types'

export interface Transport {
  id: string
  connectTo(peerId: string): void
  send(to: string, message: Message): void
  broadcast(message: Message): void
  connectedIds(): string[]
  close(): void
}

// Signaling broker. Defaults to the PeerJS public cloud (0.peerjs.com); set
// VITE_PEER_HOST (+ optional VITE_PEER_PORT/VITE_PEER_PATH) to point dev at a
// local PeerServer (see `pnpm dev:p2p`). When VITE_PEER_HOST is unset the
// options stay undefined so production behaviour (public cloud) is unchanged.
function peerOptions() {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}
  if (!env.VITE_PEER_HOST) return undefined
  return {
    host: env.VITE_PEER_HOST,
    port: env.VITE_PEER_PORT ? Number(env.VITE_PEER_PORT) : 9000,
    path: env.VITE_PEER_PATH ?? '/',
  }
}

export function createTransport(args: {
  peerId?: string
  onMessage: (msg: WireMessage) => void
  onPeerOpen?: (id: string) => void
  onConnection?: (peerId: string) => void
  onDisconnect?: (peerId: string) => void
  // Surfaced for the lifetime of the peer — not just during setup. PeerJS emits
  // errors (peer-unavailable, network, disconnected, browser-incompatible, ICE
  // failures) at any time; without this they would be silently dropped.
  onError?: (err: { type?: string; message: string }) => void
}): Promise<Transport> {
  return new Promise((resolve, reject) => {
    const peer = args.peerId
      ? new Peer(args.peerId, peerOptions())
      : new Peer(undefined as never, peerOptions())
    const connections = new Map<string, DataConnection>()
    let opened = false

    const wire = (conn: DataConnection) => {
      conn.on('open', () => {
        connections.set(conn.peer, conn)
        args.onConnection?.(conn.peer)
      })
      conn.on('data', (data) => {
        try {
          args.onMessage(parseEnvelope(typeof data === 'string' ? data : JSON.stringify(data)))
        } catch {
          // Drop malformed frames rather than crash the relay.
        }
      })
      conn.on('close', () => {
        connections.delete(conn.peer)
        args.onDisconnect?.(conn.peer)
      })
      conn.on('error', (e) => {
        args.onError?.({ type: 'connection', message: (e as Error)?.message ?? String(e) })
      })
    }

    peer.on('connection', wire)
    peer.on('error', (err) => {
      const e = err as { type?: string; message: string }
      // Before the peer opens, an error means setup failed — reject the promise.
      // After it opens, surface the error instead of discarding it silently.
      if (!opened) reject(err)
      else args.onError?.({ type: e.type, message: e.message })
    })
    peer.on('open', (id) => {
      opened = true
      args.onPeerOpen?.(id as string)
      resolve({
        id: id as string,
        connectTo(peerId) {
          wire(peer.connect(peerId))
        },
        send(to, message) {
          connections
            .get(to)
            ?.send(JSON.stringify(createEnvelope(message, id as string, nextSeq())))
        },
        broadcast(message) {
          const frame = JSON.stringify(createEnvelope(message, id as string, nextSeq()))
          for (const conn of connections.values()) conn.send(frame)
        },
        connectedIds() {
          return [...connections.keys()]
        },
        close() {
          peer.destroy()
        },
      })
    })
  })
}
