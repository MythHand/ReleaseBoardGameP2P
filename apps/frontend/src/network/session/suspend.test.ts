import type { PlayerId } from '@release/engine'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from '@release/engine/fake'
import type { Intent, Message, WireMessage } from '../types'
import type { Ticker } from './link'
import { createMemoryNetwork } from './memoryNetwork'
import { ABSENT_GRACE_MS, createSession, type Session, type SessionRef } from './referee'
import { attachKeeper } from './remoteLink'
import { resumeSession } from './suspend'

const TICK_MS = 250
const peerOf = (player: PlayerId) => `peer-${player}`

function manualTicker(clock: { at: number }): Ticker & { fire(): void } {
  let fn: (() => void) | null = null
  return {
    start(f) {
      fn = f
    },
    stop() {
      fn = null
    },
    fire() {
      clock.at += TICK_MS
      fn?.()
    },
  }
}

function seated(): Session {
  return createSession({
    gameId: 'g1',
    keeperId: 'p1',
    engine: createFakeEngine(),
    seed: 17,
    players: [
      { playerId: 'p1', peerId: peerOf('p1'), name: 'Ann' },
      { playerId: 'p2', peerId: peerOf('p2'), name: 'Bo' },
      { playerId: 'p3', peerId: null, name: 'Bot', bot: true },
    ],
    setup: {},
    deck: FAKE_DECK,
    events: FAKE_EVENTS,
  }).session
}

it('resumeSession shifts the turn deadline by the pause', () => {
  const base = seated()
  const paused: Session = {
    ...base,
    state: { ...base.state, turn: { ...base.state.turn, openedAt: 1_000, deadline: 31_000 } },
  }
  const resumed = resumeSession(paused, 10_000, 70_000)
  expect(resumed.state.turn.openedAt).toBe(61_000)
  expect(resumed.state.turn.deadline).toBe(91_000)
})

it('resumeSession shifts a window, a timed pending and the presentation runtime', () => {
  const base = seated()
  const paused: Session = {
    ...base,
    state: {
      ...base.state,
      window: {
        target: { player: 'p1', slot: 0 as never, card: 'c1' },
        round: 1,
        openedAt: 5_000,
        deadline: 20_000,
        passed: [],
      },
      pending: {
        kind: 'requestCard',
        player: 'p1',
        target: 'p2',
        openedAt: 6_000,
        deadline: 16_000,
      },
    },
    presentation: {
      incarnation: 'i',
      revision: 1,
      botNotBefore: 9_000,
      wait: {
        id: { gameId: 'g1', incarnation: 'i', revision: 1 },
        issuedAt: 8_000,
        deadline: 20_000,
        waitingPeers: [],
      },
    },
  }
  const resumed = resumeSession(paused, 10_000, 15_000)
  expect(resumed.state.window).toMatchObject({ openedAt: 10_000, deadline: 25_000 })
  expect(resumed.state.pending).toMatchObject({ openedAt: 11_000, deadline: 21_000 })
  expect(resumed.presentation?.botNotBefore).toBe(14_000)
  expect(resumed.presentation?.wait).toMatchObject({ issuedAt: 13_000, deadline: 25_000 })
})

it('resumeSession leaves an unstamped clock unstamped', () => {
  const base = seated()
  const paused: Session = {
    ...base,
    state: {
      ...base.state,
      turn: { ...base.state.turn, openedAt: undefined, deadline: undefined },
      pending: { kind: 'requestCard', player: 'p1', target: 'p2' },
    },
  }
  const resumed = resumeSession(paused, 10_000, 15_000)
  expect(resumed.state.turn.deadline).toBeUndefined()
  expect(resumed.state.pending).toEqual({ kind: 'requestCard', player: 'p1', target: 'p2' })
})

it('resumeSession restamps absent humans and leaves bots', () => {
  const base = seated()
  const paused: Session = {
    ...base,
    seats: [
      { playerId: 'p1', peerId: peerOf('p1'), absentSince: null },
      { playerId: 'p2', peerId: null, absentSince: 2_000 },
      { playerId: 'p3', peerId: null, absentSince: null, bot: true },
    ],
  }
  const resumed = resumeSession(paused, 10_000, 70_000)
  expect(resumed.seats).toEqual([
    { playerId: 'p1', peerId: peerOf('p1'), absentSince: null },
    { playerId: 'p2', peerId: null, absentSince: 70_000 },
    { playerId: 'p3', peerId: null, absentSince: null, bot: true },
  ])
})

// The table passivePlay.test.ts builds, trimmed to the keeper and one remote
// human: the seed that hands the turn cleanly to p2.
function table() {
  const clock = { at: 1_000_000 }
  const players = [
    { playerId: 'p1', peerId: peerOf('p1'), name: 'Ann' },
    { playerId: 'p2', peerId: peerOf('p2'), name: 'Bo' },
  ]
  const { session } = createSession({
    gameId: 'g1',
    keeperId: 'p1',
    engine: createFakeEngine(),
    seed: 17,
    players,
    setup: {},
    deck: FAKE_DECK,
    events: FAKE_EVENTS,
  })
  const ref: SessionRef = { current: session }
  const network = createMemoryNetwork(players.map((p) => p.peerId))
  const ticker = manualTicker(clock)
  const keeper = attachKeeper({
    ref,
    transport: network.transport(peerOf('p1')),
    now: () => clock.at,
    monotonicNow: () => clock.at,
    ticker,
  })
  let seq = 0
  const frame = (from: string, message: Message) =>
    keeper.handleMessage({ ...message, from, seq: ++seq } as WireMessage)
  const present = () => {
    for (let guard = 0; guard < 10; guard += 1) {
      const wait = ref.current.presentation?.wait
      if (!wait || wait.waitingPeers.length === 0) return
      const before = ref.current
      for (const peer of wait.waitingPeers) {
        if (peer === peerOf('p1')) keeper.link.presentationReady(wait.id)
        else frame(peer, { type: 'PRESENTATION_READY', payload: { presentation: wait.id } })
      }
      if (ref.current === before) return
    }
  }
  const send = (player: PlayerId, intent: Intent) => {
    if (player === 'p1') keeper.link.submit(intent)
    else frame(peerOf(player), { type: 'INTENT', payload: { intent } })
    present()
  }
  const tick = () => {
    present()
    ticker.fire()
    present()
  }
  present()
  tick()
  send('p1', { type: 'DRAW' })
  send('p1', { type: 'PUSH' })
  tick()
  if (ref.current.state.turn.player !== 'p2') throw new Error('the turn never reached p2')
  return { ref, clock, keeper, send, tick }
}

// Review Focus 5: an outage that is the host's must not be spent as the
// guests' time. The guest's channel closes with the host's network, so the
// seat is absent — and 60 s is past both its grace and its turn clock.
it('a suspended keeper fires no deadline', () => {
  const t = table()
  const remaining = (t.ref.current.state.turn.deadline as number) - t.clock.at
  expect(Number.isFinite(remaining)).toBe(true)
  const since = t.ref.current.log.length

  t.keeper.suspend()
  t.keeper.peerLeft(peerOf('p2'))
  for (let elapsed = 0; elapsed < 60_000; elapsed += TICK_MS) t.tick()
  expect(t.ref.current.log.length).toBe(since)

  t.keeper.peerReturned('p2', peerOf('p2'))
  t.keeper.resume()
  expect((t.ref.current.state.turn.deadline as number) - t.clock.at).toBe(remaining)
  t.tick()
  expect(t.ref.current.state.turn.player).toBe('p2')
  expect(t.ref.current.log.length).toBe(since)
})

it('a seat that dropped during the suspension gets its full grace after resume', () => {
  const t = table()
  const since = t.ref.current.log.length
  t.keeper.suspend()
  t.keeper.peerLeft(peerOf('p2'))
  for (let elapsed = 0; elapsed < 60_000; elapsed += TICK_MS) t.tick()
  t.keeper.resume()
  const resumedAt = t.clock.at
  while (t.clock.at - resumedAt + TICK_MS < ABSENT_GRACE_MS - 1_000) t.tick()
  expect(t.ref.current.log.slice(since)).toEqual([])
})

it('a suspended keeper drops intents, its own included', () => {
  const t = table()
  const before = t.ref.current
  t.keeper.suspend()
  t.send('p2', { type: 'DRAW' })
  t.keeper.link.submit({ type: 'DRAW' })
  expect(t.ref.current.state).toBe(before.state)
  // Idempotent both ways: a second resume does not shift the clocks again.
  t.keeper.suspend()
  t.clock.at += 5_000
  t.keeper.resume()
  const deadline = t.ref.current.state.turn.deadline
  t.keeper.resume()
  expect(t.ref.current.state.turn.deadline).toBe(deadline)
  t.send('p2', { type: 'DRAW' })
  expect(t.ref.current.state).not.toBe(before.state)
})
