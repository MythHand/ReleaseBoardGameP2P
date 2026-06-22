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

export function createTransport(args: {
  peerId?: string
  onMessage: (msg: WireMessage) => void
  onPeerOpen?: (id: string) => void
  onConnection?: (peerId: string) => void
  onDisconnect?: (peerId: string) => void
}): Promise<Transport> {
  return new Promise((resolve, reject) => {
    const peer = args.peerId ? new Peer(args.peerId) : new Peer()
    const connections = new Map<string, DataConnection>()

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
    }

    peer.on('connection', wire)
    peer.on('error', reject)
    peer.on('open', (id) => {
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
