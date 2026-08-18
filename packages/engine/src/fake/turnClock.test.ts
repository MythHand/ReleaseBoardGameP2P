import type { GameConfig } from '../engine'
import type { CardInstance, GameState, Setup } from '../state'
import { TURN_ACTION_MS } from './core'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from './index'
import { reduce } from './reduce'

const engine = createFakeEngine()

const EASY: Setup = {
  handLimit: 'base',
  releases: 'base',
  releaseCond: 'easy',
  ai: 'base',
  gitBranch: 'base',
}

const config = (): GameConfig => ({
  gameId: 'g1',
  seed: 4242,
  players: [
    { id: 'p1', name: 'you' },
    { id: 'p2', name: 'kernel_panic' },
    { id: 'p3', name: 'segfault' },
  ],
  setup: EASY,
  deck: FAKE_DECK,
  events: FAKE_EVENTS,
})

const FE: CardInstance = { uid: 'release-frontend#0', id: 'release-frontend' }
const BUG: CardInstance = { uid: 'attack-bug#0', id: 'attack-bug' }

// p1 on turn holding a release; p2 holds a Bug so a window has a live responder.
const primed = (): GameState => {
  const s = engine.createGame(config())
  return {
    ...s,
    players: {
      ...s.players,
      p1: { ...s.players.p1, hand: [FE] },
      p2: { ...s.players.p2, hand: [BUG] },
      p3: { ...s.players.p3, hand: [] },
    },
  }
}

it('starts with no turn clock — createGame has no timestamp to stamp one from', () => {
  const s = engine.createGame(config())
  expect(s.turn.openedAt).toBeUndefined()
  expect(s.turn.deadline).toBeUndefined()
})

it('stamps the clock from CLOCK_STARTED at the keeper-supplied time', () => {
  const r = reduce(primed(), { type: 'CLOCK_STARTED', at: 5000 })
  expect(r.state).not.toBe(primed())
  expect(r.state.turn.openedAt).toBe(5000)
  expect(r.state.turn.deadline).toBe(5000 + TURN_ACTION_MS)
})

it('rejects CLOCK_STARTED when a clock is already running', () => {
  const started = reduce(primed(), { type: 'CLOCK_STARTED', at: 5000 }).state
  const again = reduce(started, { type: 'CLOCK_STARTED', at: 9000 })
  expect(again.state).toBe(started)
  expect(again.events.map((e) => e.type)).toEqual(['rejected'])
})

it('re-stamps the clock on every committed action while the table stays idle', () => {
  const s = reduce(primed(), { type: 'CLOCK_STARTED', at: 5000 }).state
  const drawn = reduce(s, { type: 'DRAW', player: 'p1', at: 9000 }).state
  expect(drawn.turn.openedAt).toBe(9000)
  expect(drawn.turn.deadline).toBe(9000 + TURN_ACTION_MS)
})

it('hands the next player a fresh clock when the turn ends', () => {
  const s = reduce(primed(), { type: 'CLOCK_STARTED', at: 5000 }).state
  const drawn = reduce(s, { type: 'DRAW', player: 'p1', at: 9000 }).state
  const pushed = reduce(drawn, { type: 'PUSH', player: 'p1', at: 12_000 }).state
  expect(pushed.turn.player).toBe('p2')
  expect(pushed.turn.openedAt).toBe(12_000)
  expect(pushed.turn.deadline).toBe(12_000 + TURN_ACTION_MS)
})

it('clears the clock while a reaction window holds the table', () => {
  const s = reduce(primed(), { type: 'CLOCK_STARTED', at: 5000 }).state
  const windowed = reduce(s, { type: 'PLAY', player: 'p1', card: FE.uid, at: 9000 }).state
  expect(windowed.window).not.toBeNull()
  expect(windowed.turn.openedAt).toBeUndefined()
  expect(windowed.turn.deadline).toBeUndefined()
})

it('gives the turn player a fresh clock the moment the window closes', () => {
  const s = reduce(primed(), { type: 'CLOCK_STARTED', at: 5000 }).state
  const windowed = reduce(s, { type: 'PLAY', player: 'p1', card: FE.uid, at: 9000 }).state
  const one = reduce(windowed, { type: 'PASS', player: 'p2', at: 10_000 }).state
  const closed = reduce(one, { type: 'PASS', player: 'p3', at: 11_000 }).state
  expect(closed.window).toBeNull()
  expect(closed.turn.player).toBe('p1')
  expect(closed.turn.openedAt).toBe(11_000)
  expect(closed.turn.deadline).toBe(11_000 + TURN_ACTION_MS)
})

it('rejects CLOCK_STARTED while a window is open — the window owns that wait', () => {
  const s = reduce(primed(), { type: 'CLOCK_STARTED', at: 5000 }).state
  const windowed = reduce(s, { type: 'PLAY', player: 'p1', card: FE.uid, at: 9000 }).state
  const r = reduce(windowed, { type: 'CLOCK_STARTED', at: 20_000 })
  expect(r.state).toBe(windowed)
})

it('projects the clock to every viewer', () => {
  const s = reduce(primed(), { type: 'CLOCK_STARTED', at: 5000 }).state
  for (const viewer of ['p1', 'p2', 'p3']) {
    const view = engine.project(s, viewer)
    expect(view.turn.openedAt).toBe(5000)
    expect(view.turn.deadline).toBe(5000 + TURN_ACTION_MS)
  }
})

it('rejects CLOCK_STARTED once the game is over', () => {
  const s = primed()
  const done: GameState = { ...s, over: { winner: 'p1', condition: 'release' } }
  const r = reduce(done, { type: 'CLOCK_STARTED', at: 5000 })
  expect(r.state).toBe(done)
})

// A deadline can outlive its own expiry unacted: the keeper's tick refuses to
// fire it against an empty seat, so a player who drops mid-turn comes back to a
// clock that ran out while nobody could act on it. Restarting THAT clock is
// legal — it is the deferred-expiry handover, not an extension of a live turn.
it('restarts the clock when the old deadline has already expired unacted', () => {
  const started = reduce(primed(), { type: 'CLOCK_STARTED', at: 5000 })
  const at = 5000 + TURN_ACTION_MS + 9000 // well past the deadline
  const r = reduce(started.state, { type: 'CLOCK_STARTED', at })
  expect(r.state).not.toBe(started.state)
  expect(r.state.turn.openedAt).toBe(at)
  expect(r.state.turn.deadline).toBe(at + TURN_ACTION_MS)
})

it('still rejects a restart while the clock is live — no extensions', () => {
  const started = reduce(primed(), { type: 'CLOCK_STARTED', at: 5000 })
  const r = reduce(started.state, { type: 'CLOCK_STARTED', at: 5000 + TURN_ACTION_MS - 1 })
  expect(r.state).toBe(started.state)
  expect(r.events[0]?.type).toBe('rejected')
})
