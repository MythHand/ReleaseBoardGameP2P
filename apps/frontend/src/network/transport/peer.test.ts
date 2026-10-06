import { afterEach, beforeEach, vi } from 'vitest'
import type { Message, WireMessage } from '../types'

// Minimal in-memory fake of the PeerJS API surface we use.
class FakeConn {
  peer: string
  private handlers: Record<string, ((arg: unknown) => void)[]> = {}
  sent: string[] = []
  closed = false
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
  close() {
    this.closed = true
  }
}

// Records every outbound connection by peer id so tests can inspect what was sent.
const outboundConns = new Map<string, FakeConn>()
// …and the options each was opened with
const connectOptions = new Map<string, unknown>()

// The most recently constructed peer, so a test can play the broker and push
// an inbound connection at the transport.
let lastPeer: FakePeer | null = null
let openImmediately = true

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
    if (event === 'open' && openImmediately) cb(this.id)
  }
  emit(event: string, arg?: unknown) {
    for (const cb of this.handlers[event] ?? []) cb(arg)
  }
  connect(peerId: string, options?: unknown) {
    const conn = new FakeConn(peerId)
    outboundConns.set(peerId, conn)
    connectOptions.set(peerId, options)
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
  connectOptions.clear()
  lastPeer = null
  openImmediately = true
})

it('resolves with an id when the peer opens', async () => {
  const t = await createTransport({ peerId: 'host-1', onMessage: () => {} })
  expect(t.id).toBe('host-1')
})

// A player's intents must reach the keeper in the order they were made: a
// take-back overtaking the put-out it answers is refused, and the put-out then
// leaves on the table a card the player took home (#168). PeerJS opens an
// unordered channel unless asked for a reliable one.
it('opens every connection ordered', async () => {
  const t = await createTransport({ peerId: 'host-1', onMessage: () => {} })
  t.connectTo('peer-2')
  expect(connectOptions.get('peer-2')).toEqual({ reliable: true })
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

it('attributes an authenticated incoming frame to the connection it arrived on', async () => {
  const received: WireMessage[] = []
  const transport = await createTransport({
    peerId: 'host-1',
    onMessage: (message) => received.push(message),
  })

  const conn = new FakeConn('peer-2')
  lastPeer?.emit('connection', conn)
  conn.emit('open')
  transport.authenticate('peer-2')
  // 'peer-2' claims to be 'peer-9'. The keeper resolves a seat from `from`, so
  // honouring that claim would let any peer act as any other.
  conn.emit('data', JSON.stringify({ type: 'PLAYER_READY', payload: {}, from: 'peer-9', seq: 4 }))

  expect(received).toHaveLength(1)
  expect(received[0].from).toBe('peer-2')
  expect(received[0].seq).toBe(4)
})

it('admits only the join handshake until the active inbound connection is authenticated', async () => {
  const received: WireMessage[] = []
  const transport = await createTransport({
    peerId: 'host-1',
    onMessage: (message) => received.push(message),
  })
  const connection = new FakeConn('peer-2')
  lastPeer?.emit('connection', connection)
  connection.emit('open')

  connection.emit(
    'data',
    JSON.stringify({
      type: 'INTENT',
      payload: { intent: { type: 'DRAW' } },
      from: 'peer-2',
      seq: 1,
    }),
  )
  connection.emit(
    'data',
    JSON.stringify({
      type: 'JOIN_REQUEST',
      payload: { name: 'Bo', resumeToken: 'resume-bo' },
      from: 'peer-2',
      seq: 2,
    }),
  )

  expect(received.map((message) => message.type)).toEqual(['JOIN_REQUEST'])

  transport.authenticate('peer-2')
  connection.emit(
    'data',
    JSON.stringify({
      type: 'INTRO_READY',
      payload: { gameId: 'g1' },
      from: 'peer-2',
      seq: 3,
    }),
  )

  expect(received.map((message) => message.type)).toEqual(['JOIN_REQUEST', 'INTRO_READY'])
})

it('retires an overlapping same-id generation and ignores stale data and close events', async () => {
  const received: WireMessage[] = []
  const lifecycle: string[] = []
  const transport = await createTransport({
    peerId: 'host-1',
    onMessage: (message) => received.push(message),
    onConnection: (peerId) => lifecycle.push(`connected:${peerId}`),
    onDisconnect: (peerId) => lifecycle.push(`disconnected:${peerId}`),
  })
  const first = new FakeConn('peer-2')
  lastPeer?.emit('connection', first)
  first.emit('open')

  const replacement = new FakeConn('peer-2')
  lastPeer?.emit('connection', replacement)
  replacement.emit('open')

  expect(first.closed).toBe(true)
  expect(lifecycle).toEqual(['connected:peer-2', 'disconnected:peer-2', 'connected:peer-2'])
  expect(transport.connectedIds()).toEqual(['peer-2'])

  first.emit(
    'data',
    JSON.stringify({
      type: 'JOIN_REQUEST',
      payload: { name: 'Stale', resumeToken: 'stale-token' },
      from: 'peer-2',
      seq: 1,
    }),
  )
  replacement.emit(
    'data',
    JSON.stringify({
      type: 'JOIN_REQUEST',
      payload: { name: 'Current', resumeToken: 'current-token' },
      from: 'peer-2',
      seq: 2,
    }),
  )
  expect(received).toHaveLength(1)
  expect(received[0].type === 'JOIN_REQUEST' && received[0].payload.name).toBe('Current')

  first.emit('close')
  expect(lifecycle).toHaveLength(3)
  expect(transport.connectedIds()).toEqual(['peer-2'])

  replacement.emit('close')
  expect(lifecycle.at(-1)).toBe('disconnected:peer-2')
  expect(transport.connectedIds()).toEqual([])
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

it('broadcasts and relays only to accepted inbound connections', async () => {
  const transport = await createTransport({ onMessage: () => {} })
  const pending = new FakeConn('pending')
  const accepted = new FakeConn('accepted')
  for (const conn of [pending, accepted]) {
    lastPeer?.emit('connection', conn)
    conn.emit('open')
  }
  transport.authenticate('accepted')
  const message: Message = { type: 'LOBBY_DISBANDED', payload: {} }
  transport.broadcast(message)
  transport.relay(['pending', 'accepted'], { ...message, from: 'original', seq: 1 })
  expect(pending.sent).toEqual([])
  expect(accepted.sent).toHaveLength(2)
  transport.send('pending', message)
  expect(pending.sent).toHaveLength(1)
})

it('retires a rejected channel immediately and flushes its reason before closing', async () => {
  const disconnected = vi.fn()
  const received = vi.fn()
  const transport = await createTransport({ onMessage: received, onDisconnect: disconnected })
  const old = new FakeConn('watcher')
  lastPeer?.emit('connection', old)
  old.emit('open')
  transport.authenticate('watcher')
  let finish!: () => void
  const sent = new Promise<void>((resolve) => {
    finish = resolve
  })
  vi.spyOn(old, 'send').mockImplementation((frame) => {
    old.sent.push(frame)
    return sent
  })
  const close = vi.spyOn(old, 'close')
  const rejection: Message = {
    type: 'JOIN_REJECTED',
    payload: { reason: 'room-full', availability: { player: false, spectator: false } },
  }
  const pending = transport.disconnectPeer('watcher', rejection)
  expect(transport.connectedIds()).toEqual([])
  expect(disconnected).toHaveBeenCalledExactlyOnceWith('watcher')
  transport.broadcast({ type: 'LOBBY_DISBANDED', payload: {} })
  old.emit('data', JSON.stringify({ type: 'PLAYER_READY', payload: {}, from: 'watcher', seq: 1 }))
  expect(received).not.toHaveBeenCalled()
  expect(old.sent.map((frame) => JSON.parse(frame).type)).toEqual(['JOIN_REJECTED'])
  expect(close).not.toHaveBeenCalled()
  const replacement = new FakeConn('watcher')
  lastPeer?.emit('connection', replacement)
  replacement.emit('open')
  finish()
  await pending
  expect(close).toHaveBeenCalledExactlyOnceWith({ flush: true })
  expect(replacement.closed).toBe(false)
  old.emit('close')
  expect(disconnected).toHaveBeenCalledTimes(1)
  expect(transport.connectedIds()).toEqual(['watcher'])
})

it('closes once even when the final send fails', async () => {
  const disconnected = vi.fn()
  const transport = await createTransport({ onMessage: () => {}, onDisconnect: disconnected })
  const connection = new FakeConn('watcher')
  lastPeer?.emit('connection', connection)
  connection.emit('open')
  vi.spyOn(connection, 'send').mockImplementation(() => {
    throw new Error('closed during send')
  })
  const close = vi.spyOn(connection, 'close')
  await transport.disconnectPeer('watcher', { type: 'LOBBY_DISBANDED', payload: {} })
  await transport.disconnectPeer('watcher')
  connection.emit('close')
  expect(close).toHaveBeenCalledTimes(1)
  expect(disconnected).toHaveBeenCalledTimes(1)
})

it('permits an unauthenticated availability check without permitting broadcasts', async () => {
  const received: WireMessage[] = []
  const transport = await createTransport({ onMessage: (message) => received.push(message) })
  const connection = new FakeConn('visitor')
  lastPeer?.emit('connection', connection)
  connection.emit('open')
  connection.emit(
    'data',
    JSON.stringify({ type: 'ROOM_CHECK', payload: {}, from: 'visitor', seq: 1 }),
  )
  expect(received.map((message) => message.type)).toEqual(['ROOM_CHECK'])
  transport.broadcast({ type: 'PLAYER_READY', payload: {} })
  expect(connection.sent).toEqual([])
})

it('destroys a temporary peer when its request is aborted', async () => {
  const destroy = vi.spyOn(FakePeer.prototype, 'destroy')
  const controller = new AbortController()
  await createTransport({ onMessage: () => {}, signal: controller.signal })
  controller.abort()
  expect(destroy).toHaveBeenCalledOnce()
  destroy.mockRestore()
})

it('ignores queued data after an aborted temporary transport is destroyed', async () => {
  const received: WireMessage[] = []
  const controller = new AbortController()
  const transport = await createTransport({
    signal: controller.signal,
    onMessage: (message) => received.push(message),
  })
  const connection = new FakeConn('host')
  lastPeer?.emit('connection', connection)
  connection.emit('open')
  transport.authenticate('host')
  controller.abort()
  connection.emit(
    'data',
    JSON.stringify({
      type: 'ROOM_AVAILABILITY',
      payload: { player: true, spectator: true },
      from: 'host',
      seq: 1,
    }),
  )
  expect(received).toEqual([])
})

it('aborts before signaling opens and ignores a late open event', async () => {
  openImmediately = false
  const controller = new AbortController()
  const onPeerOpen = vi.fn()
  const pending = createTransport({ signal: controller.signal, onMessage: () => {}, onPeerOpen })
  const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  controller.abort()
  await rejection
  lastPeer?.emit('open', 'visitor')
  expect(onPeerOpen).not.toHaveBeenCalled()
})
