import { type DataConnection, Peer } from 'peerjs'
import {
  PEER_HOST,
  PEER_PATH,
  PEER_PORT,
  STUN_URL,
  TURN_CREDENTIAL,
  TURN_URL,
  TURN_USERNAME,
} from '~/shared/config'
import { createEnvelope, nextSeq, parseEnvelope } from '../envelope'
import type { Message, WireMessage } from '../types'

export interface Transport {
  id: string
  connectTo(peerId: string): void
  send(to: string, message: Message): void
  broadcast(message: Message): void
  // Forward an already-received wire frame to the given peers verbatim. Unlike
  // send(), it preserves the original `from`/`seq` (the host must not rewrite
  // itself as the sender when relaying) and serializes once for all recipients.
  relay(toIds: string[], frame: WireMessage): void
  connectedIds(): string[]
  close(): void
}

// Custom ICE servers (STUN/TURN). PeerJS's default config ships only a free,
// rate-limited public TURN (turn:eu-0/us-0.turn.peerjs.com), so peers that
// can't connect directly (symmetric NAT, blocked UDP, restrictive firewalls)
// frequently fail ICE negotiation. Configure TURN_URL (+ creds) to point at a
// reliable TURN — self-hosted coturn or a managed service. When unset, PeerJS
// keeps its default config so existing behaviour is unchanged. A custom config
// REPLACES the default entirely, so include a STUN server here too.
function iceConfig(): RTCConfiguration | undefined {
  if (!TURN_URL) return undefined
  return {
    iceServers: [
      { urls: STUN_URL },
      { urls: TURN_URL, username: TURN_USERNAME, credential: TURN_CREDENTIAL },
    ],
  }
}

// Signaling broker. Defaults to the PeerJS public cloud (0.peerjs.com); set
// PEER_HOST (+ optional PEER_PORT/PEER_PATH) to point dev at a local PeerServer
// (see `pnpm dev:p2p`). ICE servers are configured independently (see
// iceConfig), so a custom TURN works with either signaling broker. Returns
// undefined only when nothing is configured, keeping the default public-cloud +
// default-ICE behaviour.
function peerOptions() {
  const config = iceConfig()
  if (!PEER_HOST) return config ? { config } : undefined
  return {
    host: PEER_HOST,
    port: PEER_PORT,
    path: PEER_PATH,
    ...(config && { config }),
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
        relay(toIds, frame) {
          const serialized = JSON.stringify(frame)
          for (const to of toIds) connections.get(to)?.send(serialized)
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
