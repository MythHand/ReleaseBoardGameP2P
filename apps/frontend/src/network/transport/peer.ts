import { type DataConnection, Peer } from 'peerjs'
import {
  PEER_HOST,
  PEER_PATH,
  PEER_PORT,
  PEER_SECURE,
  STUN_URL,
  TURN_CREDENTIAL,
  TURN_URL,
  TURN_USERNAME,
} from '~/shared/config'
import { createEnvelope, nextSeq, parseEnvelope } from '../envelope'
import type { Message, WireMessage } from '../types'
import { createMediaPort } from './media'
import type { VoiceMediaPort } from './mediaTypes'

export interface Transport {
  media?: VoiceMediaPort
  id: string
  connectTo(peerId: string): void
  authenticate(peerId: string): void
  send(to: string, message: Message): void
  broadcast(message: Message): void
  // Forward an already-received wire frame to the given peers verbatim. Unlike
  // send(), it preserves the original `from`/`seq` (the host must not rewrite
  // itself as the sender when relaying) and serializes once for all recipients.
  relay(toIds: string[], frame: WireMessage): void
  disconnectPeer(peerId: string, finalMessage?: Message): Promise<void>
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
    // Omitted unless explicitly configured, so PeerJS keeps deriving it from
    // the page protocol (see PEER_SECURE).
    ...(PEER_SECURE !== undefined && { secure: PEER_SECURE }),
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
    interface ConnectionGeneration {
      connection: DataConnection
      authenticated: boolean
      retired: boolean
    }
    const connections = new Map<string, ConnectionGeneration>()
    let opened = false
    let closed = false
    const dataDialPeers = new Set<string>()
    const dataDials = new Map<string, DataConnection>()
    const clearDataDial = (conn: DataConnection) => {
      if (dataDials.get(conn.peer) !== conn) return
      dataDials.delete(conn.peer)
      dataDialPeers.delete(conn.peer)
    }
    const media = createMediaPort(peer, dataDialPeers)

    const wire = (conn: DataConnection, authenticated = false) => {
      const generation: ConnectionGeneration = { connection: conn, authenticated, retired: false }
      conn.on('open', () => {
        clearDataDial(conn)
        const previous = connections.get(conn.peer)
        if (previous?.connection === conn) return
        connections.set(conn.peer, generation)
        if (previous) {
          previous.retired = true
          previous.connection.close()
          args.onDisconnect?.(conn.peer)
        }
        args.onConnection?.(conn.peer)
      })
      conn.on('data', (data) => {
        if (connections.get(conn.peer) !== generation) return
        try {
          const frame = parseEnvelope(typeof data === 'string' ? data : JSON.stringify(data))
          if (!generation.authenticated && frame.type !== 'JOIN_REQUEST') return
          // `from` is overwritten with the connection it arrived on, never read
          // from the payload: the sender wrote that field and could write any
          // peer id into it, and the keeper resolves a seat from it. The
          // guarantee reaches directly-connected peers only — a frame relayed
          // by the host arrives on the host's connection, so a keeper that is
          // not the host still sees the relay's identity, not the origin's.
          args.onMessage({ ...frame, from: conn.peer })
        } catch {
          // Drop malformed frames rather than crash the relay.
        }
      })
      conn.on('close', () => {
        clearDataDial(conn)
        if (connections.get(conn.peer) !== generation) return
        generation.retired = true
        connections.delete(conn.peer)
        args.onDisconnect?.(conn.peer)
      })
      conn.on('error', (e) => {
        clearDataDial(conn)
        if (generation.retired) return
        const active = connections.get(conn.peer)
        if (active && active !== generation) return
        args.onError?.({ type: 'connection', message: (e as Error)?.message ?? String(e) })
      })
    }

    peer.on('connection', wire)
    peer.on('error', (err) => {
      if (closed) return
      const e = err as { type?: string; message: string }
      if (media.handlePeerError(e)) return
      // Before the peer opens, an error means setup failed — reject the promise.
      // After it opens, surface the error instead of discarding it silently.
      if (opened)
        args.onError?.({ type: e.type === 'webrtc' ? 'connection' : e.type, message: e.message })
      else {
        media.close()
        reject(err)
      }
    })
    peer.on('open', (id) => {
      opened = true
      args.onPeerOpen?.(id as string)
      resolve({
        media,
        id: id as string,
        connectTo(peerId) {
          dataDialPeers.add(peerId)
          const connection = peer.connect(peerId)
          dataDials.set(peerId, connection)
          wire(connection, true)
        },
        authenticate(peerId) {
          const generation = connections.get(peerId)
          if (generation) generation.authenticated = true
        },
        send(to, message) {
          connections
            .get(to)
            ?.connection.send(JSON.stringify(createEnvelope(message, id as string, nextSeq())))
        },
        broadcast(message) {
          const frame = JSON.stringify(createEnvelope(message, id as string, nextSeq()))
          for (const { connection, authenticated } of connections.values()) {
            if (authenticated) connection.send(frame)
          }
        },
        relay(toIds, frame) {
          const serialized = JSON.stringify(frame)
          for (const to of toIds) {
            const generation = connections.get(to)
            if (generation?.authenticated) generation.connection.send(serialized)
          }
        },
        async disconnectPeer(peerId, finalMessage) {
          const generation = connections.get(peerId)
          if (!generation) return
          generation.retired = true
          connections.delete(peerId)
          args.onDisconnect?.(peerId)
          try {
            if (finalMessage)
              await generation.connection.send(
                JSON.stringify(createEnvelope(finalMessage, id as string, nextSeq())),
              )
          } catch {
            // The recipient may have closed while its final response was sent.
          } finally {
            generation.connection.close({ flush: true })
          }
        },
        connectedIds() {
          return [...connections.keys()]
        },
        close() {
          closed = true
          media.close()
          peer.destroy()
        },
      })
    })
  })
}
