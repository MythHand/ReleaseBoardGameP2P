import { afterEach, beforeEach, vi } from 'vitest'
import { backoffMs } from '../session/reconnect'
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
  off(event: string, cb: (arg: unknown) => void) {
    this.handlers[event] = (this.handlers[event] ?? []).filter((handler) => handler !== cb)
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
  static created = 0
  private handlers: Record<string, ((arg: unknown) => void)[]> = {}
  constructor(id?: string) {
    FakePeer.created++
    this.id = id ?? 'self-generated'
    lastPeer = this
  }
  on(event: string, cb: (arg: unknown) => void) {
    if (!this.handlers[event]) this.handlers[event] = []
    this.handlers[event].push(cb)
    if (event === 'open' && openImmediately) cb(this.id)
  }
  emit(event: string, arg?: unknown) {
    if (event === 'disconnected') this.disconnected = true
    if (event === 'open') {
      this.disconnected = false
      this.open = true
    }
    for (const cb of this.handlers[event] ?? []) cb(arg)
  }
  connect(peerId: string, options?: unknown) {
    const conn = new FakeConn(peerId)
    outboundConns.set(peerId, conn)
    connectOptions.set(peerId, options)
    queueMicrotask(() => conn.emit('open'))
    return conn
  }
  call(peerId: string, _stream: MediaStream, options: { metadata: unknown }) {
    return Object.assign(new FakeConn(peerId), {
      connectionId: 'media-1',
      metadata: options.metadata,
      answer: vi.fn(),
    })
  }
  off(event: string, cb: (arg: unknown) => void) {
    this.handlers[event] = (this.handlers[event] ?? []).filter((handler) => handler !== cb)
  }
  destroyed = false
  disconnected = false
  open = true
  // Like PeerJS: reconnecting a peer that is still connected throws.
  reconnect = vi.fn(() => {
    if (!this.disconnected && this.open) throw new Error('cannot reconnect: not disconnected')
  })
  destroy() {
    this.destroyed = true
  }
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

it('uses its single Peer for media and scopes media-only errors away from the game', async () => {
  const errors = vi.fn()
  const before = FakePeer.created
  const transport = await createTransport({ onMessage: () => {}, onError: errors })
  if (!transport.media) throw new Error('Media port missing')
  const call = transport.media.call('audio-only', {} as MediaStream, {
    version: 1,
    callerSessionId: 'a',
    calleeSessionId: 'b',
  })
  const mediaErrors = vi.fn()
  call.subscribe(mediaErrors)
  lastPeer?.emit('error', {
    type: 'peer-unavailable',
    message: 'Could not connect to peer audio-only',
  })
  expect(mediaErrors).toHaveBeenCalledWith({
    type: 'error',
    error: { type: 'peer-unavailable', message: 'Could not connect to peer audio-only' },
  })
  expect(errors).not.toHaveBeenCalled()
  expect(FakePeer.created - before).toBe(1)
  lastPeer?.emit('error', { type: 'webrtc', message: 'negotiation failed' })
  expect(errors).toHaveBeenCalledWith({ type: 'connection', message: 'negotiation failed' })
  lastPeer?.emit('error', { type: 'browser-incompatible', message: 'no webrtc' })
  expect(errors).toHaveBeenCalledWith({ type: 'browser-incompatible', message: 'no webrtc' })
})
it('preserves peer-unavailable for a pending game data dial', async () => {
  const errors = vi.fn()
  const transport = await createTransport({ onMessage: () => {}, onError: errors })
  if (!transport.media) throw new Error('Media port missing')
  transport.media.call('host', {} as MediaStream, {
    version: 1,
    callerSessionId: 'a',
    calleeSessionId: 'b',
  })
  transport.connectTo('host')
  lastPeer?.emit('error', { type: 'peer-unavailable', message: 'Could not connect to peer host' })
  expect(errors).toHaveBeenCalledWith({
    type: 'peer-unavailable',
    message: 'Could not connect to peer host',
  })
})

it('retired data callbacks cannot misclassify the next dial as a media-only error', async () => {
  const errors = vi.fn()
  const transport = await createTransport({ onMessage: () => {}, onError: errors })
  transport.connectTo('host')
  await Promise.resolve()
  const old = outboundConns.get('host')
  if (!transport.media) throw new Error('Media port missing')
  transport.media.call('host', {} as MediaStream, {
    version: 1,
    callerSessionId: 'a',
    calleeSessionId: 'b',
  })
  transport.connectTo('host')
  old?.emit('error', new Error('old connection error'))
  errors.mockClear()
  lastPeer?.emit('error', { type: 'peer-unavailable', message: 'Could not connect to peer host' })
  expect(errors).toHaveBeenCalledWith({
    type: 'peer-unavailable',
    message: 'Could not connect to peer host',
  })
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

it('closes owned voice calls when the transport is aborted', async () => {
  const dial = vi.spyOn(FakePeer.prototype, 'call')
  const controller = new AbortController()
  const transport = await createTransport({ onMessage: () => {}, signal: controller.signal })
  if (!transport.media) throw new Error('Media port missing')
  transport.media.call('speaker', {} as MediaStream, {
    version: 1,
    callerSessionId: 'a',
    calleeSessionId: 'b',
  })
  const connection = dial.mock.results[0].value as FakeConn
  expect(connection.closed).toBe(false)
  controller.abort()
  expect(connection.closed).toBe(true)
  dial.mockRestore()
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

describe('signaling re-registration', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('emits lost on disconnected and calls reconnect', async () => {
    const onSignaling = vi.fn()
    await createTransport({ peerId: 'host-1', onMessage: () => {}, onSignaling })
    lastPeer?.emit('disconnected')
    lastPeer?.emit('disconnected')
    expect(onSignaling).toHaveBeenCalledTimes(1)
    expect(onSignaling).toHaveBeenCalledWith('lost')
    await vi.advanceTimersByTimeAsync(backoffMs(1))
    expect(lastPeer?.reconnect).toHaveBeenCalledTimes(1)
  })

  it('backs off between failed attempts without re-reporting lost', async () => {
    const onSignaling = vi.fn()
    await createTransport({ peerId: 'host-1', onMessage: () => {}, onSignaling })
    lastPeer?.emit('disconnected')
    await vi.advanceTimersByTimeAsync(backoffMs(1))
    lastPeer?.emit('disconnected')
    await vi.advanceTimersByTimeAsync(backoffMs(2) - 1)
    expect(lastPeer?.reconnect).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(lastPeer?.reconnect).toHaveBeenCalledTimes(2)
    expect(onSignaling).toHaveBeenCalledTimes(1)
  })

  it('emits restored when the peer reopens, without resolving or announcing twice', async () => {
    const onSignaling = vi.fn()
    const onPeerOpen = vi.fn()
    await createTransport({ peerId: 'host-1', onMessage: () => {}, onSignaling, onPeerOpen })
    lastPeer?.emit('disconnected')
    lastPeer?.emit('open', 'host-1')
    expect(onSignaling.mock.calls).toEqual([['lost'], ['restored']])
    expect(onPeerOpen).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(lastPeer?.reconnect).not.toHaveBeenCalled()
    lastPeer?.emit('disconnected')
    expect(onSignaling.mock.calls).toEqual([['lost'], ['restored'], ['lost']])
  })

  it('retries reconnect on the online event', async () => {
    await createTransport({ peerId: 'host-1', onMessage: () => {}, onSignaling: vi.fn() })
    lastPeer?.emit('disconnected')
    window.dispatchEvent(new Event('online'))
    expect(lastPeer?.reconnect).toHaveBeenCalledTimes(1)
  })

  it('reconnects even without an onSignaling callback', async () => {
    await createTransport({ peerId: 'host-1', onMessage: () => {} })
    lastPeer?.emit('disconnected')
    await vi.advanceTimersByTimeAsync(backoffMs(1))
    expect(lastPeer?.reconnect).toHaveBeenCalledTimes(1)
  })

  it('does not report network errors through onError while lost', async () => {
    const onError = vi.fn()
    await createTransport({
      peerId: 'host-1',
      onMessage: () => {},
      onSignaling: vi.fn(),
      onError,
    })
    lastPeer?.emit('disconnected')
    for (const type of ['network', 'disconnected', 'server-error', 'socket-error', 'socket-closed'])
      lastPeer?.emit('error', { type, message: type })
    expect(onError).not.toHaveBeenCalled()
    lastPeer?.emit('error', { type: 'peer-unavailable', message: 'gone' })
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('treats an error before disconnected (real PeerJS order) as one drop', async () => {
    const onError = vi.fn()
    const onSignaling = vi.fn()
    await createTransport({ peerId: 'host-1', onMessage: () => {}, onSignaling, onError })
    lastPeer?.emit('error', { type: 'network', message: 'lost' })
    lastPeer?.emit('disconnected')
    expect(onError).not.toHaveBeenCalled()
    expect(onSignaling.mock.calls).toEqual([['lost']])
    await vi.advanceTimersByTimeAsync(backoffMs(1))
    expect(lastPeer?.reconnect).toHaveBeenCalledTimes(1)
  })

  it('holds a dial made during a drop until signaling is restored', async () => {
    const t = await createTransport({
      peerId: 'host-1',
      onMessage: () => {},
      onSignaling: vi.fn(),
    })
    const connect = vi.spyOn(lastPeer as FakePeer, 'connect')
    lastPeer?.emit('disconnected')
    t.connectTo('host')
    t.connectTo('host')
    expect(connect).not.toHaveBeenCalled()
    lastPeer?.emit('open', 'host-1')
    expect(connect).toHaveBeenCalledTimes(1)
    expect(connect).toHaveBeenCalledWith('host', { reliable: true })
  })

  it('recovers when a signaling error does not disconnect the peer', async () => {
    const onSignaling = vi.fn()
    const onError = vi.fn()
    const t = await createTransport({ peerId: 'host-1', onMessage: () => {}, onSignaling, onError })
    const connect = vi.spyOn(lastPeer as FakePeer, 'connect')
    lastPeer?.emit('error', { type: 'server-error', message: 'hiccup' })
    t.connectTo('host')
    expect(connect).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(backoffMs(1))
    expect(onSignaling.mock.calls).toEqual([['lost'], ['restored']])
    expect(onError).not.toHaveBeenCalled()
    expect(connect).toHaveBeenCalledTimes(1)
    expect(lastPeer?.reconnect).not.toHaveBeenCalled()
  })

  it('close() stops reconnecting', async () => {
    const t = await createTransport({
      peerId: 'host-1',
      onMessage: () => {},
      onSignaling: vi.fn(),
    })
    lastPeer?.emit('disconnected')
    t.close()
    await vi.advanceTimersByTimeAsync(60_000)
    window.dispatchEvent(new Event('online'))
    expect(lastPeer?.reconnect).not.toHaveBeenCalled()
  })
})
