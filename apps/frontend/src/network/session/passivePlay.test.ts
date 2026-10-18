import {
  type Action,
  type CardInstance,
  cardsPresent,
  type Engine,
  type Event,
  type PlayerId,
} from '@release/engine'
import {
  createFakeEngine,
  drawObligationMet,
  FAKE_DECK,
  FAKE_EVENTS,
  passiveAction,
} from '@release/engine/fake'
import type { Intent, Message, Setup, WireMessage } from '../types'
import type { Ticker } from './link'
import { createMemoryNetwork } from './memoryNetwork'
import { ABSENT_GRACE_MS, createSession, type SessionRef } from './referee'
import { attachKeeper } from './remoteLink'

// The keeper's 250ms interval, which the real ticker would be firing on.
const TICK_MS = 250

// A ticker the test advances by hand, and a clock that moves with it — the
// same pair botPlay.test.ts builds, for the same reason: the keeper's grace and
// every deadline are elapsed time, so a ticker firing against a frozen clock
// would never reach any of them.
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

const peerOf = (player: PlayerId) => `peer-${player}`

// Seats p1 (the keeper, a human sitting at the host's browser) and the rest as
// remote humans — or lobby bots, for the regression below.
//
// Seed 17 is chosen empirically, as botPlay.test.ts's is, and verified by
// running the suite rather than by reading the deck: at 17 p1's opening
// DRAW/PUSH raises no pending, so the turn reaches p2 cleanly (`handToP2`
// asserts it); p2's passive DRAW leaves no decision open, so the draw and the
// push land on separate ticks for the returning-player test; the lobby bot
// plays from hand within its first few turns; and four seats run twenty turns
// without the match ending. Seat-count and setup options do not change it.
function table(remote: number, options: { bots?: boolean; setup?: Setup } = {}) {
  // Every action the engine accepted, in order. The log alone cannot tell a
  // played card from one an event placed for the seat — an AI release drawn
  // from the events deck lands as `released` too — so the policy's own moves
  // are read here instead.
  const accepted: Action[] = []
  const fake = createFakeEngine()
  const engine: Engine = {
    ...fake,
    reduce(state, action) {
      const result = fake.reduce(state, action)
      if (result.state !== state) accepted.push(action)
      return result
    },
  }
  const clock = { at: 1_000_000 }
  const players = [
    { playerId: 'p1', peerId: peerOf('p1'), name: 'Ann' },
    ...Array.from({ length: remote }, (_, i) => {
      const playerId = `p${i + 2}`
      return options.bots
        ? { playerId, peerId: null, name: `Bot ${i + 1}`, bot: true }
        : { playerId, peerId: peerOf(playerId), name: `Guest ${i + 1}` }
    }),
  ]
  const { session } = createSession({
    gameId: 'g1',
    keeperId: 'p1',
    engine,
    seed: 17,
    players,
    setup: options.setup ?? {},
    deck: FAKE_DECK,
    events: FAKE_EVENTS,
  })
  const ref: SessionRef = { current: session }
  const network = createMemoryNetwork(players.map((p) => peerOf(p.playerId)))
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

  // Every connected board presents what it is shown at once. Without this the
  // presentation gate would hold every clock — and every unattended seat — for
  // a board that never reports.
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

  // The human at the keeper's own seat, answering at once with the least it
  // can: draw, push, decline. Only there so the table comes back round to the
  // seats under test without the keeper's turn clock costing 30 s a turn.
  const p1Acts = () => {
    const action = passiveAction(engine, ref.current.state, 'p1', clock.at)
    if (!action || action.type === 'ABANDON' || action.type === 'SURRENDER') return
    const {
      player: _player,
      at: _at,
      ...intent
    } = action as typeof action & {
      player: PlayerId
      at: number
    }
    send('p1', intent as Intent)
  }

  const tick = () => {
    present()
    ticker.fire()
    present()
  }

  const drop = (player: PlayerId) => keeper.peerLeft(peerOf(player))
  const rejoin = (player: PlayerId) => {
    keeper.peerReturned(player, peerOf(player))
    present()
  }

  present()
  return { engine, accepted, ref, clock, keeper, send, p1Acts, tick, drop, rejoin }
}

type Table = ReturnType<typeof table>

const actor = (event: Event): PlayerId | undefined =>
  'player' in event ? event.player : 'attacker' in event ? event.attacker : undefined

const eventsOf = (t: Table, player: PlayerId, since = 0) =>
  t.ref.current.log.slice(since).filter((e) => actor(e) === player)

// The moves a passive seat must never make, as the engine accepted them.
const playsOf = (t: Table, player: PlayerId, since = 0) =>
  t.accepted
    .slice(since)
    .filter((a) => (a.type === 'PLAY' || a.type === 'ATTACK') && a.player === player)

// Ends p1's opening turn, so p2 is on.
function handToP2(t: Table) {
  t.tick() // stamps the first turn clock
  t.send('p1', { type: 'DRAW' })
  t.send('p1', { type: 'PUSH' })
  // A seed whose opening raises a pending would never get here; say so loudly.
  if (t.ref.current.state.turn.player !== 'p2') throw new Error('the turn never reached p2')
}

it('an absent human past grace draws and pushes, never plays', () => {
  const t = table(1)
  handToP2(t)
  const since = t.ref.current.log.length
  const acceptedSince = t.accepted.length
  t.drop('p2')
  const droppedAt = t.clock.at

  const budget = (ABSENT_GRACE_MS + 60_000) / TICK_MS
  for (let i = 0; i < budget && t.ref.current.state.turn.player === 'p2'; i += 1) t.tick()

  expect(t.clock.at - droppedAt).toBeGreaterThanOrEqual(ABSENT_GRACE_MS)
  const types = eventsOf(t, 'p2', since).map((e) => e.type)
  expect(types).toContain('drawn')
  expect(types).toContain('turnEnded')
  expect(playsOf(t, 'p2', acceptedSince)).toEqual([])
})

it('an absent human is not driven before the grace', () => {
  const t = table(1)
  handToP2(t)
  const since = t.ref.current.log.length
  t.drop('p2')
  const droppedAt = t.clock.at

  while (t.clock.at - droppedAt + TICK_MS < 29_000) t.tick()

  expect(eventsOf(t, 'p2', since)).toEqual([])
  expect(t.ref.current.state.turn.player).toBe('p2')
})

// The regression: a seat chosen as a bot in the lobby keeps botAction, which
// plays from hand. Asserted as a PLAY or ATTACK the engine accepted for the
// bot within a bounded number of its turns, rather than on one given turn or
// on the log: whether the bot holds anything playable on a particular turn is
// the deal's business, and the log's `released` is also what an AI release
// drawn from the events deck produces, so it cannot tell a play from a draw.
it('a lobby bot still plays', () => {
  const t = table(1, { bots: true })
  t.tick()
  const botTurns = () => eventsOf(t, 'p2').filter((e) => e.type === 'turnEnded').length
  for (let i = 0; i < 4000 && botTurns() < 8 && playsOf(t, 'p2').length === 0; i += 1) {
    t.p1Acts()
    t.tick()
  }
  expect(playsOf(t, 'p2').length).toBeGreaterThan(0)
})

// Review Focus 1: a player who comes back between the passive draw and the
// passive push gets the rest of their turn, not a push made for them.
it('returning between draw and push gets the turn back', () => {
  const t = table(1)
  handToP2(t)
  const acceptedSince = t.accepted.length
  t.drop('p2')
  // Read off the accepted actions rather than the log: one DRAW may log more
  // than one `drawn` (a trigger drawn is replaced from the pile).
  const movesOfP2 = () =>
    t.accepted
      .slice(acceptedSince)
      .filter((a) => 'player' in a && a.player === 'p2')
      .map((a) => a.type)

  const budget = (ABSENT_GRACE_MS + 30_000) / TICK_MS
  for (let i = 0; i < budget && movesOfP2().length === 0; i += 1) t.tick()
  expect(movesOfP2()).toEqual(['DRAW'])
  expect(t.ref.current.state.turn.player).toBe('p2')
  expect(drawObligationMet(t.ref.current.state)).toBe(true)

  t.rejoin('p2')
  for (let i = 0; i < 8; i += 1) t.tick()

  expect(movesOfP2()).toEqual(['DRAW'])
  expect(t.ref.current.state.turn.player).toBe('p2')
  const { deadline } = t.ref.current.state.turn
  expect(deadline).toBeDefined()
  expect(deadline as number).toBeGreaterThan(t.clock.at)
})

// Review Focus 3: every guest gone at once still leaves a table that moves.
it('all humans but the keeper passive keeps the table moving', () => {
  const t = table(3)
  t.tick()
  const since = t.ref.current.log.length
  const acceptedSince = t.accepted.length
  for (const player of ['p2', 'p3', 'p4']) t.drop(player)

  const turns = () => t.ref.current.log.slice(since).filter((e) => e.type === 'turnStarted').length
  for (let i = 0; i < 20_000 && turns() < 20 && !t.ref.current.state.over; i += 1) {
    t.p1Acts()
    t.tick()
  }

  expect(turns()).toBeGreaterThanOrEqual(20)
  for (const player of ['p2', 'p3', 'p4']) expect(playsOf(t, player, acceptedSince)).toEqual([])
})

// Review Focus 4: a surrender sent while an attack is out waits for the
// exchange to close — the defence owed to p1 is not dropped, and no card goes
// missing in between.
it('surrender waits for the open exchange', () => {
  // The easy release condition, so p1's release costs no discard and the
  // window opens on the PLAY itself (attacks.test.ts stages it the same way).
  const t = table(1, { setup: { releaseCond: 'easy' } })
  const frontend: CardInstance = { uid: 'release-frontend#0', id: 'release-frontend' }
  const bug: CardInstance = { uid: 'attack-bug#0', id: 'attack-bug' }
  // Move the two cards the scene needs out of wherever the deal put them and
  // into the right hands, so the census still holds every card exactly once.
  const take = (uid: string) => (cards: CardInstance[]) => cards.filter((c) => c.uid !== uid)
  const without = (cards: CardInstance[]) => take(frontend.uid)(take(bug.uid)(cards))
  const state = t.ref.current.state
  t.ref.current = {
    ...t.ref.current,
    state: {
      ...state,
      decks: {
        ...state.decks,
        main: state.decks.main.map(without),
        discard: without(state.decks.discard),
      },
      players: {
        ...state.players,
        p1: { ...state.players.p1, hand: [frontend, ...without(state.players.p1.hand)] },
        p2: { ...state.players.p2, hand: [bug, ...without(state.players.p2.hand)] },
      },
    },
  }
  const census = [...cardsPresent(t.ref.current.state)].sort()

  t.tick()
  t.send('p1', { type: 'PLAY', card: frontend.uid })
  expect(t.ref.current.state.window).not.toBeNull()
  t.send('p2', { type: 'ATTACK', card: bug.uid })
  expect(t.ref.current.state.pending).toMatchObject({ kind: 'defend', player: 'p1' })

  t.send('p2', { type: 'SURRENDER' })
  expect(t.ref.current.seats.find((s) => s.playerId === 'p2')?.surrendering).toBe(true)
  // Well inside the defence's own deadline, so only p1 can close it.
  for (let i = 0; i < 16; i += 1) t.tick()
  expect(t.ref.current.state.eliminated).not.toContain('p2')
  expect(t.ref.current.state.pending).toMatchObject({ kind: 'defend', player: 'p1' })
  expect([...cardsPresent(t.ref.current.state)].sort()).toEqual(census)

  t.send('p1', { type: 'RESOLVE', choice: { kind: 'defend', card: null } })
  for (let i = 0; i < 40 && !t.ref.current.state.eliminated.includes('p2'); i += 1) t.tick()

  expect(t.ref.current.state.eliminated).toContain('p2')
  expect([...cardsPresent(t.ref.current.state)].sort()).toEqual(census)
})

// A surrender does not wait for the absence grace: a player who chose to leave
// is not coming back.
it('a surrendering seat is eliminated without waiting for the grace', () => {
  const t = table(2)
  t.tick()
  t.send('p3', { type: 'SURRENDER' })
  t.drop('p3')
  for (let i = 0; i < 8 && !t.ref.current.state.eliminated.includes('p3'); i += 1) t.tick()
  expect(t.ref.current.state.eliminated).toContain('p3')
})
