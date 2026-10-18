import type { Event, PlayerId } from '@release/engine'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from '@release/engine/fake'
import type { Intent, Message, WireMessage } from '../types'
import type { Ticker } from './link'
import { createMemoryNetwork } from './memoryNetwork'
import { ABSENT_GRACE_MS, createSession, type Session, type SessionRef } from './referee'
import { attachKeeper, SUSPENDED_REASON } from './remoteLink'
import { createStartGate, type StartGate } from './startGate'
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
function table(options: { gate?: StartGate } = {}) {
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
  // Every frame the guest's board receives, so a test can read its answers.
  const inbox: WireMessage[] = []
  network.onDeliver(peerOf('p2'), (received) => inbox.push(received))
  const ticker = manualTicker(clock)
  const keeper = attachKeeper({
    ref,
    transport: network.transport(peerOf('p1')),
    now: () => clock.at,
    monotonicNow: () => clock.at,
    ticker,
    gate: options.gate,
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
  if (options.gate) return { ref, clock, keeper, send, tick, inbox, present }
  present()
  tick()
  send('p1', { type: 'DRAW' })
  send('p1', { type: 'PUSH' })
  tick()
  if (ref.current.state.turn.player !== 'p2') throw new Error('the turn never reached p2')
  return { ref, clock, keeper, send, tick, inbox, present }
}

// The rejections in every SYNC the guest received since `since`.
const rejectionsAt = (inbox: WireMessage[], since: number) =>
  inbox
    .slice(since)
    .flatMap((frame) => (frame.type === 'SYNC' ? (frame.payload.events ?? []) : []))
    .filter((event) => event.type === 'rejected')

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

// Losing the broker does not close live DataChannels, so a guest keeps
// acting. An unanswered PLAY would leave its board's staged card at the centre
// for good; the refusal is the answer an illegal action gets.
it('a suspended keeper rejects a guest PLAY and accepts it after resume', () => {
  const t = table()
  t.send('p2', { type: 'DRAW' })
  const view = t.ref.current.engine.project(t.ref.current.state, 'p2')
  const card = view.self?.playable[0]
  if (!card) throw new Error('p2 holds nothing playable at this seed')

  t.keeper.suspend()
  const before = t.ref.current.state
  const since = t.inbox.length
  t.send('p2', { type: 'PLAY', card })
  expect(t.ref.current.state).toBe(before)
  expect(rejectionsAt(t.inbox, since)).toEqual([
    expect.objectContaining({
      type: 'rejected',
      reason: SUSPENDED_REASON,
      action: expect.objectContaining({ type: 'PLAY', card, player: 'p2' }),
    }),
  ])

  t.keeper.resume()
  const after = t.inbox.length
  t.send('p2', { type: 'PLAY', card })
  expect(t.ref.current.state).not.toBe(before)
  expect(rejectionsAt(t.inbox, after)).toEqual([])
})

it("a suspended keeper rejects its own seat's intent through its local link", () => {
  const t = table()
  const local: Event[] = []
  t.keeper.link.subscribe((sync) => local.push(...sync.events))
  t.keeper.suspend()
  const before = t.ref.current.state
  t.keeper.link.submit({ type: 'DRAW' })
  expect(t.ref.current.state).toBe(before)
  expect(local).toEqual([expect.objectContaining({ type: 'rejected', reason: SUSPENDED_REASON })])
})

it('suspend and resume are idempotent', () => {
  const t = table()
  t.keeper.suspend()
  t.clock.at += 5_000
  t.keeper.suspend()
  t.clock.at += 5_000
  const deadline = t.ref.current.state.turn.deadline as number
  t.keeper.resume()
  expect(t.ref.current.state.turn.deadline).toBe(deadline + 10_000)
  t.keeper.resume()
  expect(t.ref.current.state.turn.deadline).toBe(deadline + 10_000)
})

// The start gate's early buffer drains through the same path, so an intent
// sent during the intro and released by the gate mid-suspension is refused as
// well — not reduced, and not lost without an answer. The keeper's own seat
// is on turn, so its DRAW would be legal: only the suspension refuses it.
it('early intents the start gate releases during a suspension are rejected', () => {
  const gate = createStartGate({ expect: ['p1', 'p2'], capMs: 60_000 })
  const t = table({ gate })
  const local: Event[] = []
  t.keeper.link.subscribe((sync) => local.push(...sync.events))
  t.keeper.link.submit({ type: 'DRAW' })
  expect(local).toEqual([])
  t.keeper.suspend()
  const logged = t.ref.current.log.length
  t.keeper.introReady(peerOf('p1'))
  t.keeper.introReady(peerOf('p2'))
  expect(gate.open).toBe(true)
  expect(t.ref.current.log.slice(logged).filter((e) => e.type === 'drawn')).toEqual([])
  expect(t.ref.current.state.turn.drawnFrom).toEqual([])
  expect(local.filter((e) => e.type === 'rejected')).toEqual([
    expect.objectContaining({ type: 'rejected', reason: SUSPENDED_REASON }),
  ])
  gate.cancel()
})
