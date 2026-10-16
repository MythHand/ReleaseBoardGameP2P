import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from '@release/engine/fake'
import { createMemoryNetwork } from './memoryNetwork'
import { adoptSession, createSession } from './referee'
import { attachKeeper, createRemoteLink } from './remoteLink'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function setup() {
  let mono = 0
  let wall = 10_000
  const net = createMemoryNetwork(['host', 'guest', 'spectator', 'stranger'])
  const ref = {
    current: createSession({
      gameId: 'g1',
      keeperId: 'p1',
      engine: createFakeEngine(),
      seed: 3,
      players: [
        { playerId: 'p1', peerId: 'host', name: 'H' },
        { playerId: 'p2', peerId: 'guest', name: 'G' },
      ],
      setup: {},
      deck: FAKE_DECK,
      events: FAKE_EVENTS,
    }).session,
  }
  const keeper = attachKeeper({
    ref,
    transport: net.transport('host'),
    now: () => wall,
    monotonicNow: () => mono,
    ticker: { start() {}, stop() {} },
  })
  net.onDeliver('host', (frame) => keeper.handleMessage(frame))
  const remote = createRemoteLink({
    transport: net.transport('guest'),
    keeperPeerId: 'host',
    monotonicNow: () => mono,
  })
  net.onDeliver('guest', (frame) => remote.handleMessage(frame))
  return {
    net,
    ref,
    keeper,
    remote,
    mono: () => mono,
    advance(ms: number) {
      mono += ms
    },
    wall(value: number) {
      wall = value
    },
  }
}

it('calibrates after routing is installed and stamps every delivered projection', () => {
  const s = setup()
  try {
    s.remote.activate('g1')
    expect(s.remote.link.clock.now()).toBe(10_000)
    const received: { gameId?: string; keeperNow?: number }[] = []
    s.remote.link.subscribe((sync) => received.push(sync))
    s.keeper.resync()
    expect(received[0]).toMatchObject({ gameId: 'g1', keeperNow: 10_000 })
    s.advance(500)
    s.wall(-9_000_000)
    expect(s.remote.link.clock.now()).toBe(10_500)
    expect(s.keeper.link.clock.now()).toBe(10_500)
    s.remote.link.submit({ type: 'DRAW' }) // wrong turn, rejection also carries timing
    expect(received.at(-1)).toMatchObject({ keeperNow: 10_500 })
  } finally {
    s.remote.link.close()
    s.keeper.close()
  }
})

it('clock traffic never commits game state and ignores strangers and forged responses', () => {
  const s = setup()
  try {
    const original = s.ref.current.state
    s.remote.activate('g1')
    const before = s.remote.link.clock.now()
    s.net.transport('stranger').send('guest', {
      type: 'CLOCK_RESPONSE',
      payload: {
        gameId: 'g1',
        requestId: 1,
        receivedAt: 999999,
        sentAt: 999999,
      },
    })
    expect(s.remote.link.clock.now()).toBe(before)
    const sent = vi.fn()
    s.net.onDeliver('stranger', sent)
    s.net
      .transport('stranger')
      .send('host', { type: 'CLOCK_REQUEST', payload: { gameId: 'g1', requestId: 1 } })
    expect(sent).not.toHaveBeenCalled()
    expect(s.ref.current.state).toBe(original)
    s.remote.resetClock()
    expect(s.remote.link.clock.now()).toBeNull()
  } finally {
    s.remote.link.close()
    s.keeper.close()
  }
})

it('allows registered spectators and stops replying after close', () => {
  const s = setup()
  try {
    const seen = vi.fn()
    s.net.onDeliver('spectator', seen)
    s.keeper.watch('spectator')
    expect(seen.mock.calls[0][0].payload).toMatchObject({ keeperNow: 10_000, gameId: 'g1' })
    seen.mockClear()
    const request = { type: 'CLOCK_REQUEST' as const, payload: { gameId: 'g1', requestId: 123 } }
    s.net.transport('spectator').send('host', request)
    expect(seen.mock.calls[0][0]).toMatchObject({ type: 'CLOCK_RESPONSE' })
    s.keeper.close()
    seen.mockClear()
    s.net.transport('spectator').send('host', request)
    expect(seen).not.toHaveBeenCalled()
  } finally {
    s.remote.link.close()
    s.keeper.close()
  }
})

it('preserves an adopted deadline when the successor has a different epoch', () => {
  const s = setup()
  const extras: (() => void)[] = []
  try {
    s.ref.current.state.decks.main = [[{ uid: 'draw', id: 'defense-hotfix' }]]
    s.remote.activate('g1')
    s.keeper.link.submit({ type: 'DRAW' })
    const deadline = s.ref.current.state.turn.deadline
    expect(deadline).toBe(40_000)
    s.advance(5000)
    const inherited = s.remote.link.clock.now()
    if (inherited === null) throw new Error('handover requires calibrated time')
    s.keeper.handover('p2')
    s.remote.link.close()
    const adopted = {
      current: adoptSession({
        state: s.ref.current.state,
        gameId: 'g1',
        keeperId: 'p2',
        engine: s.ref.current.engine,
        seats: s.ref.current.seats,
      }),
    }
    const ticks: (() => void)[] = []
    const successor = attachKeeper({
      ref: adopted,
      transport: s.net.transport('guest'),
      now: () => 9_000_000,
      initialKeeperNow: inherited,
      monotonicNow: s.mono,
      ticker: { start: (fn) => ticks.push(fn), stop() {} },
    })
    extras.push(successor.close)
    s.net.onDeliver('guest', successor.handleMessage)
    const remaining = createRemoteLink({
      transport: s.net.transport('host'),
      keeperPeerId: 'guest',
      monotonicNow: s.mono,
    })
    extras.push(remaining.link.close)
    s.net.onDeliver('host', remaining.handleMessage)
    remaining.activate('g1')
    expect(remaining.link.clock.now()).toBe(15_000)
    expect(adopted.current.state.turn.deadline).toBe(deadline)
    s.advance(24_999)
    ticks[0]()
    expect(adopted.current.state.turn.player).toBe('p1')
    s.advance(1)
    ticks[0]()
    expect(adopted.current.state.turn.player).toBe('p2')
  } finally {
    for (const close of extras) close()
    s.remote.link.close()
    s.keeper.close()
  }
})

it('invalidates old calibration, probes and SYNC anchors after keeper departure', () => {
  const s = setup()
  try {
    let heldId = 0
    s.net.onDeliver('host', (frame) => {
      if (frame.type === 'CLOCK_REQUEST') heldId = frame.payload.requestId
    })
    s.remote.activate('g1')
    s.keeper.resync()
    expect(s.remote.link.clock.now()).toBe(10_000)
    s.net.transport('host').send('guest', { type: 'KEEPER_CHANGED', payload: { keeperId: 'p2' } })
    expect(s.remote.link.clock.now()).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
    s.keeper.resync()
    s.net.transport('host').send('guest', {
      type: 'CLOCK_RESPONSE',
      payload: {
        gameId: 'g1',
        requestId: heldId,
        receivedAt: 20_000,
        sentAt: 20_000,
      },
    })
    expect(s.remote.link.clock.now()).toBeNull()
  } finally {
    s.remote.link.close()
    s.keeper.close()
  }
})

it('lets the handover callback inherit time and synchronously reactivate even the same peer', () => {
  const s = setup()
  s.remote.link.close()
  let captured: number | null = null
  const remote = createRemoteLink({
    transport: s.net.transport('guest'),
    keeperPeerId: 'host',
    monotonicNow: s.mono,
    onKeeperChanged() {
      captured = remote.link.clock.now()
      remote.setKeeper('host')
    },
  })
  s.net.onDeliver('guest', remote.handleMessage)
  try {
    remote.activate('g1')
    s.net.transport('host').send('guest', { type: 'KEEPER_CHANGED', payload: { keeperId: 'p2' } })
    expect(captured).toBe(10_000)
    expect(remote.link.clock.now()).toBe(10_000)
    expect(vi.getTimerCount()).toBe(3)
  } finally {
    remote.link.close()
    s.keeper.close()
  }
})

it('delivers legacy projections without subtracting an untrusted client epoch', () => {
  const s = setup()
  s.net.onDeliver('host', () => {}) // an older keeper ignores clock requests
  const received = vi.fn()
  s.remote.link.subscribe(received)
  try {
    s.remote.activate('g1')
    const payload = { view: s.ref.current.engine.project(s.ref.current.state, 'p2'), events: [] }
    s.net.transport('host').send('guest', { type: 'SYNC', payload })
    expect(received).toHaveBeenCalledTimes(1)
    expect(s.remote.link.clock.now()).toBeNull()
    s.net
      .transport('host')
      .send('guest', { type: 'SYNC', payload: { ...payload, gameId: 'old-game', keeperNow: 5000 } })
    expect(received).toHaveBeenCalledTimes(1)
    expect(s.remote.link.clock.now()).toBeNull()
    s.keeper.resync()
    expect(s.remote.link.clock.now()).toBe(10_000)
  } finally {
    s.remote.link.close()
    s.keeper.close()
  }
})
