import { afterEach, beforeEach, vi } from 'vitest'
import type { Message, WireMessage } from '../types'

// Minimal in-memory fake of the PeerJS API surface we use.
class FakeConn {
  peer: string
  private handlers: Record<string, ((arg: unknown) => void)[]> = {}
  sent: string[] = []
  constructor(peer: string) {
    this.peer = peer
  }
  on(event: string, cb: (arg: unknown) => void) {
    if (!this.handlers[event]) this.handlers[event] = []
    this.handlers[event].push(cb)
  }
  emit(event: string, arg?: unknown) {
    for (const cb of this.handlers[event] ?? []) cb(arg)
  }
  send(data: string) {
    this.sent.push(data)
  }
  close() {}
}

// Records every outbound connection by peer id so tests can inspect what was sent.
const outboundConns = new Map<string, FakeConn>()

// The most recently constructed peer, so a test can play the broker and push
// an inbound connection at the transport.
let lastPeer: FakePeer | null = null

class FakePeer {
  id: string
  private handlers: Record<string, ((arg: unknown) => void)[]> = {}
  constructor(id?: string) {
    this.id = id ?? 'self-generated'
    lastPeer = this
  }
  on(event: string, cb: (arg: unknown) => void) {
    if (!this.handlers[event]) this.handlers[event] = []
    this.handlers[event].push(cb)
    if (event === 'open') cb(this.id)
  }
  emit(event: string, arg?: unknown) {
    for (const cb of this.handlers[event] ?? []) cb(arg)
  }
  connect(peerId: string) {
    const conn = new FakeConn(peerId)
    outboundConns.set(peerId, conn)
    queueMicrotask(() => conn.emit('open'))
    return conn
  }
  destroy() {}
}

vi.mock('peerjs', () => ({ default: FakePeer, Peer: FakePeer }))

let createTransport: typeof import('./peer').createTransport
beforeEach(async () => {
  ;({ createTransport } = await import('./peer'))
})
afterEach(() => {
  vi.clearAllMocks()
  outboundConns.clear()
})

it('resolves with an id when the peer opens', async () => {
  const t = await createTransport({ peerId: 'host-1', onMessage: () => {} })
  expect(t.id).toBe('host-1')
})

it('send serializes an envelope to the target connection', async () => {
  const opened: string[] = []
  const t = await createTransport({
    peerId: 'host-1',
    onMessage: () => {},
    onConnection: (id) => opened.push(id),
  })
  t.connectTo('peer-2')
  await Promise.resolve()
  const msg: Message = { type: 'PLAYER_READY', payload: {} }
  t.send('peer-2', msg)

  expect(t.connectedIds()).toContain('peer-2')

  // The serialized envelope must have reached the target connection.
  const conn = outboundConns.get('peer-2')
  expect(conn).toBeDefined()
  expect(conn?.sent).toHaveLength(1)
  const frame = JSON.parse(conn?.sent[0] as string) as Record<string, unknown>
  expect(frame.type).toBe('PLAYER_READY')
  expect(typeof frame.seq).toBe('number')
  expect(frame.from).toBe(t.id)
})

it('attributes an incoming frame to the connection it arrived on', async () => {
  const received: WireMessage[] = []
  await createTransport({ peerId: 'host-1', onMessage: (m) => received.push(m) })

  const conn = new FakeConn('peer-2')
  lastPeer?.emit('connection', conn)
  conn.emit('open')
  // 'peer-2' claims to be 'peer-9'. The keeper resolves a seat from `from`, so
  // honouring that claim would let any peer act as any other.
  conn.emit('data', JSON.stringify({ type: 'PLAYER_READY', payload: {}, from: 'peer-9', seq: 4 }))

  expect(received).toHaveLength(1)
  expect(received[0].from).toBe('peer-2')
  expect(received[0].seq).toBe(4)
})

it('relay forwards a wire frame verbatim, preserving the original sender', async () => {
  const t = await createTransport({ peerId: 'host-1', onMessage: () => {} })
  t.connectTo('peer-2')
  await Promise.resolve()

  // A frame that originated from another peer (from: 'peer-9'), being relayed.
  const frame = { type: 'PLAYER_READY', payload: {}, from: 'peer-9', seq: 7 } as const
  t.relay(['peer-2'], frame)

  const conn = outboundConns.get('peer-2')
  expect(conn?.sent).toHaveLength(1)
  const received = JSON.parse(conn?.sent[0] as string) as Record<string, unknown>
  // The host must NOT rewrite itself as the sender when relaying.
  expect(received.from).toBe('peer-9')
  expect(received.seq).toBe(7)
})
