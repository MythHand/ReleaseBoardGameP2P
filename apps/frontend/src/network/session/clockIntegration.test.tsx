import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from '@release/engine/fake'
import { resources } from '@release/translation'
import { act, renderHook } from '@testing-library/react'
import { deriveDock } from '@/table/Table/dock'
import { toBoardState } from '~/entities/game/board'
import { useNow } from '~/features/play-game/useNow'
import type { Transport } from '../transport/peer'
import type { Sync } from './link'
import { createMemoryNetwork } from './memoryNetwork'
import { createSession } from './referee'
import { attachKeeper, createRemoteLink } from './remoteLink'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(1800000000000)
})
afterEach(() => vi.useRealTimers())

function setup(forward = 100, reverse = 100) {
  const net = createMemoryNetwork(['host', 'guest'])
  const delayed = (id: string, latency: number): Transport => {
    const transport = net.transport(id)
    return {
      ...transport,
      send: (to, message) => {
        setTimeout(() => transport.send(to, message), latency)
      },
    }
  }
  const ref = {
    current: createSession({
      gameId: 'g1',
      keeperId: 'p2',
      engine: createFakeEngine(),
      seed: 3,
      setup: { releaseCond: 'easy' },
      deck: FAKE_DECK,
      events: FAKE_EVENTS,
      players: [
        { playerId: 'p1', peerId: 'guest', name: 'Guest' },
        { playerId: 'p2', peerId: 'host', name: 'Host' },
      ],
    }).session,
  }
  ref.current.state.players.p1.hand = [{ uid: 'release', id: 'release-frontend' }]
  ref.current.state.players.p2.hand = [{ uid: 'attack', id: 'attack-bug' }]
  const ticks: (() => void)[] = []
  const keeper = attachKeeper({
    ref,
    transport: delayed('host', reverse),
    now: () => 1800000000000,
    monotonicNow: () => performance.now(),
    ticker: { start: (fn) => ticks.push(fn), stop() {} },
  })
  const remote = createRemoteLink({
    transport: delayed('guest', forward),
    keeperPeerId: 'host',
    monotonicNow: () => performance.now(),
  })
  net.onDeliver('host', keeper.handleMessage)
  net.onDeliver('guest', remote.handleMessage)
  let sync: Sync | null = null
  remote.link.subscribe((value) => {
    sync = value
  })
  remote.activate('g1')
  return {
    ref,
    keeper,
    remote,
    tick: () => ticks[0](),
    board: () => {
      if (!sync) throw new Error('missing projection')
      return toBoardState(sync.view, sync.events, resources.en.common.historyLabels)
    },
    close() {
      remote.link.close()
      keeper.close()
    },
  }
}

it.each([
  0, 60_000, -60_000, -3_523_000,
])('agrees for turn, release window and defense despite client epoch skew %s', (skew) => {
  const s = setup()
  const { result, unmount } = renderHook(() => useNow(true, s.remote.link.clock))
  try {
    act(() => vi.advanceTimersByTime(1000))
    s.tick()
    act(() => vi.advanceTimersByTime(100))
    act(() => vi.setSystemTime(1800000000000 + skew))
    const dock = () => deriveDock(s.board(), 'p1', result.current ?? 0)
    expect(dock().seconds).toBe(30)
    expect(s.remote.link.clock.now()).toBe(s.keeper.link.clock.now())
    s.remote.link.submit({ type: 'PLAY', card: 'release' })
    act(() => vi.advanceTimersByTime(250))
    expect(s.ref.current.state.window).not.toBeNull()
    expect(dock().seconds).toBe(15)
    s.keeper.link.submit({ type: 'ATTACK', card: 'attack' })
    act(() => vi.advanceTimersByTime(250))
    expect(s.ref.current.state.pending).toMatchObject({ kind: 'defend', player: 'p1' })
    expect(dock().seconds).toBe(15)
    act(() => vi.advanceTimersByTime(1000))
    expect(dock().seconds).toBe(14)
    const deadline =
      s.ref.current.state.pending && 'deadline' in s.ref.current.state.pending
        ? s.ref.current.state.pending.deadline
        : null
    s.remote.resetClock()
    s.remote.activate('g1')
    act(() => vi.advanceTimersByTime(500))
    expect(
      s.ref.current.state.pending && 'deadline' in s.ref.current.state.pending
        ? s.ref.current.state.pending.deadline
        : null,
    ).toBe(deadline)
    expect(s.remote.link.clock.now()).toBe(s.keeper.link.clock.now())
  } finally {
    unmount()
    s.close()
  }
})

it('bounds the estimate by half the path asymmetry instead of pretending to know one-way delay', () => {
  const s = setup(50, 150)
  try {
    vi.advanceTimersByTime(1000)
    expect((s.remote.link.clock.now() ?? 0) - (s.keeper.link.clock.now() ?? 0)).toBe(-50)
  } finally {
    s.close()
  }
})
