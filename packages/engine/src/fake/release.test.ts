import type { GameConfig } from '../engine'
import type { CardInstance, GameState, Setup } from '../state'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from './index'
import { reduce } from './reduce'

const engine = createFakeEngine()

const BASE: Setup = {
  handLimit: 'base',
  releases: 'base',
  releaseCond: 'base',
  ai: 'base',
  gitBranch: 'base',
}

const config = (setup: Setup = BASE): GameConfig => ({
  gameId: 'g1',
  seed: 4242,
  players: [
    { id: 'p1', name: 'you' },
    { id: 'p2', name: 'kernel_panic' },
  ],
  setup,
  deck: FAKE_DECK,
  events: FAKE_EVENTS,
})

const FE: CardInstance = { uid: 'release-frontend#0', id: 'release-frontend' }
const BE: CardInstance = { uid: 'release-backend#0', id: 'release-backend' }
const DB: CardInstance = { uid: 'release-database#0', id: 'release-database' }
const CR: CardInstance = { uid: 'support-code-review#0', id: 'support-code-review' }
const MON: CardInstance = { uid: 'protection-monitoring#0', id: 'protection-monitoring' }
const BUG: CardInstance = { uid: 'attack-bug#0', id: 'attack-bug' }

// Deal p1 an exact hand so each test is about a rule, not about the shuffle.
const handed = (hand: CardInstance[], setup: Setup = BASE): GameState => {
  const s = engine.createGame(config(setup))
  return { ...s, players: { ...s.players, p1: { ...s.players.p1, hand } } }
}

it('asks for the discard cost before the release lands', () => {
  const r = reduce(handed([FE, BUG]), { type: 'PLAY', player: 'p1', card: FE.uid, at: 1000 })
  expect(r.state.pending).toEqual({ kind: 'discardForRelease', player: 'p1', release: FE.uid })
  expect(r.state.players.p1.release.frontend).toBeUndefined()
  expect(r.state.players.p1.hand).toHaveLength(2)
})

it('places the release once the cost is paid', () => {
  const asked = reduce(handed([FE, BUG]), { type: 'PLAY', player: 'p1', card: FE.uid, at: 1000 })
  const r = reduce(asked.state, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'discardForRelease', card: BUG.uid },
    at: 1001,
  })
  expect(r.state.players.p1.release.frontend?.card).toEqual(FE)
  expect(r.state.players.p1.hand).toEqual([])
  expect(r.state.decks.discard.at(-1)).toEqual(BUG)
  expect(r.state.turn.releasesPlayed).toBe(1)
  expect(r.events.map((e) => e.type)).toEqual(['discarded', 'released', 'windowOpened'])
})

it('refuses to pay the cost with the release itself', () => {
  const asked = reduce(handed([FE, BUG]), { type: 'PLAY', player: 'p1', card: FE.uid, at: 1000 })
  const r = reduce(asked.state, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'discardForRelease', card: FE.uid },
    at: 1001,
  })
  expect(r.state).toBe(asked.state)
  expect(r.events[0].type).toBe('rejected')
})

it('skips the cost under Easy Release', () => {
  const s = handed([FE, BUG], { ...BASE, releaseCond: 'easy' })
  const r = reduce(s, { type: 'PLAY', player: 'p1', card: FE.uid, at: 1000 })
  expect(r.state.pending).toBeNull()
  expect(r.state.players.p1.release.frontend?.card).toEqual(FE)
  expect(r.state.players.p1.hand).toEqual([BUG])
})

it('rejects a second release in a turn under Base, allows it under Fast Release', () => {
  const easy = { ...BASE, releaseCond: 'easy' }
  const first = reduce(handed([FE, BE], easy), {
    type: 'PLAY',
    player: 'p1',
    card: FE.uid,
    at: 1000,
  })
  const capped = reduce(first.state, { type: 'PLAY', player: 'p1', card: BE.uid, at: 1001 })
  expect(capped.state).toBe(first.state)
  expect(capped.events[0].type).toBe('rejected')

  const fastFirst = reduce(handed([FE, BE], { ...easy, releases: 'fast' }), {
    type: 'PLAY',
    player: 'p1',
    card: FE.uid,
    at: 1000,
  })
  // The first release opened a reaction window (Task 8); the cap-lifting
  // property this test targets only shows up once that window is out of the way.
  const closed = reduce(fastFirst.state, { type: 'PASS', player: 'p2', at: 1001 })
  const fast = reduce(closed.state, { type: 'PLAY', player: 'p1', card: BE.uid, at: 1002 })
  expect(fast.state.players.p1.release.backend?.card).toEqual(BE)
  expect(fast.state.turn.releasesPlayed).toBe(2)
})

it('rejects a duplicate release type in the zone', () => {
  const twin: CardInstance = { uid: 'release-frontend#1', id: 'release-frontend' }
  const s = handed([FE, twin], { ...BASE, releaseCond: 'easy', releases: 'fast' })
  const first = reduce(s, { type: 'PLAY', player: 'p1', card: FE.uid, at: 1000 })
  const r = reduce(first.state, { type: 'PLAY', player: 'p1', card: twin.uid, at: 1001 })
  expect(r.state).toBe(first.state)
  expect(r.events[0].type).toBe('rejected')
})

it('binds Code Review to the release it was played with', () => {
  const s = handed([FE, CR], { ...BASE, releaseCond: 'easy' })
  const r = reduce(s, { type: 'PLAY', player: 'p1', card: FE.uid, combo: CR.uid, at: 1000 })
  expect(r.state.players.p1.release.frontend).toEqual({ card: FE, codeReview: CR })
  expect(r.state.players.p1.hand).toEqual([])
})

it('carries a combo Code Review across the discard pause', () => {
  const asked = reduce(handed([FE, CR, BUG]), {
    type: 'PLAY',
    player: 'p1',
    card: FE.uid,
    combo: CR.uid,
    at: 1000,
  })
  expect(asked.state.pending).toEqual({
    kind: 'discardForRelease',
    player: 'p1',
    release: FE.uid,
    codeReview: CR.uid,
  })
  const r = reduce(asked.state, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'discardForRelease', card: BUG.uid },
    at: 1001,
  })
  expect(r.state.players.p1.release.frontend).toEqual({ card: FE, codeReview: CR })
})

it('rejects Code Review paired with something that is not a release', () => {
  const s = handed([MON, CR], { ...BASE, releaseCond: 'easy' })
  const r = reduce(s, { type: 'PLAY', player: 'p1', card: MON.uid, combo: CR.uid, at: 1000 })
  expect(r.state).toBe(s)
  expect(r.events[0].type).toBe('rejected')
})

it('places Monitoring in the zone, one at a time', () => {
  const twin: CardInstance = { uid: 'protection-monitoring#1', id: 'protection-monitoring' }
  const first = reduce(handed([MON, twin]), { type: 'PLAY', player: 'p1', card: MON.uid, at: 1000 })
  expect(first.state.players.p1.release.monitoring).toEqual(MON)
  expect(first.events.map((e) => e.type)).toEqual(['placed'])
  const r = reduce(first.state, { type: 'PLAY', player: 'p1', card: twin.uid, at: 1001 })
  expect(r.state).toBe(first.state)
  expect(r.events[0].type).toBe('rejected')
})

it('never lets Debugger be played proactively', () => {
  const dbg: CardInstance = { uid: 'protection-debugger#0', id: 'protection-debugger' }
  const r = reduce(handed([dbg]), { type: 'PLAY', player: 'p1', card: dbg.uid, at: 1000 })
  expect(r.events[0].type).toBe('rejected')
})

it('ends the game when a third release lands', () => {
  const s = handed([DB], { ...BASE, releaseCond: 'easy' })
  const primed: GameState = {
    ...s,
    players: {
      ...s.players,
      p1: { ...s.players.p1, release: { frontend: { card: FE }, backend: { card: BE } } },
    },
  }
  const r = reduce(primed, { type: 'PLAY', player: 'p1', card: DB.uid, at: 1000 })
  expect(r.state.over).toEqual({ winner: 'p1', condition: 'release' })
  expect(r.events.map((e) => e.type)).toEqual(['released', 'gameOver'])
})

it('rejects a play once the game is over, or of a frozen card', () => {
  const s = handed([FE], { ...BASE, releaseCond: 'easy' })
  const over: GameState = { ...s, over: { winner: 'p2', condition: 'release' } }
  expect(reduce(over, { type: 'PLAY', player: 'p1', card: FE.uid, at: 1000 }).state).toBe(over)

  const frozen: GameState = {
    ...s,
    players: { ...s.players, p1: { ...s.players.p1, frozen: [FE.uid] } },
  }
  const r = reduce(frozen, { type: 'PLAY', player: 'p1', card: FE.uid, at: 1000 })
  expect(r.state).toBe(frozen)
  expect(r.events[0].type).toBe('rejected')
})
