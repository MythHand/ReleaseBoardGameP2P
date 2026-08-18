import type { Action } from '../actions'
import type { GameConfig } from '../engine'
import type { GameState, Setup } from '../state'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from './index'
import { handLimitFor, nextSeat, reduce } from './reduce'

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
    { id: 'p3', name: 'segfault' },
  ],
  setup,
  deck: FAKE_DECK,
  events: FAKE_EVENTS,
})

// Opening hands carry no trigger cards, so a draw in these tests must not fire a
// trigger. Strip triggers from the pile to keep the turn-cycle tests isolated
// from Task 10's reveal machinery.
const withoutTriggers = (s: GameState): GameState => ({
  ...s,
  decks: {
    ...s.decks,
    main: s.decks.main.map((pile) =>
      pile.filter((c) => c.id !== 'trigger-ai' && c.id !== 'trigger-error-503'),
    ),
  },
})

it('maps the hand-limit mode axis', () => {
  expect(handLimitFor(BASE)).toBe(Number.POSITIVE_INFINITY)
  expect(handLimitFor({ ...BASE, handLimit: '8bit' })).toBe(8)
  expect(handLimitFor({ ...BASE, handLimit: 'memory' })).toBe(5)
})

it('rotates to the next living seat, wrapping the table', () => {
  const s = engine.createGame(config())
  expect(nextSeat(s, 'p1')).toBe('p2')
  expect(nextSeat(s, 'p3')).toBe('p1')
  expect(nextSeat({ ...s, eliminated: ['p2'] }, 'p1')).toBe('p3')
})

it('draws one card and marks the turn as drawn', () => {
  const s = withoutTriggers(engine.createGame(config()))
  const before = s.decks.main[0].length
  const r = reduce(s, { type: 'DRAW', player: 'p1', at: 1000 })
  expect(r.state.players.p1.hand).toHaveLength(6)
  expect(r.state.decks.main[0]).toHaveLength(before - 1)
  expect(r.state.turn.drawnFrom).toEqual([0])
  expect(r.events.map((e) => e.type)).toEqual(['drawn'])
})

// The draw is a public fact — everyone at the table sees a card taken. Its
// IDENTITY is not, and that is redacted per viewer (`redactFor`) rather than
// hidden by dropping the event. Pinned here because an animation on every peer
// now depends on this event arriving at all.
it('announces the draw to the table and carries the card for the drawer', () => {
  const s = withoutTriggers(engine.createGame(config()))
  const r = reduce(s, { type: 'DRAW', player: 'p1', at: 1000 })
  const drawn = r.events[0]
  expect(drawn.visibleTo).toBeUndefined()
  expect(drawn.type === 'drawn' && drawn.card).toBeDefined()
})

it('rejects a second draw in the same turn', () => {
  const s = withoutTriggers(engine.createGame(config()))
  const once = reduce(s, { type: 'DRAW', player: 'p1', at: 1000 })
  const twice = reduce(once.state, { type: 'DRAW', player: 'p1', at: 1001 })
  expect(twice.state).toBe(once.state)
  expect(twice.events).toHaveLength(1)
  expect(twice.events[0].type).toBe('rejected')
})

it('rejects a draw from a player whose turn it is not', () => {
  const s = withoutTriggers(engine.createGame(config()))
  const r = reduce(s, { type: 'DRAW', player: 'p2', at: 1000 })
  expect(r.state).toBe(s)
  expect(r.events[0].type).toBe('rejected')
})

it('rejects PUSH before the mandatory draw', () => {
  const s = engine.createGame(config())
  const r = reduce(s, { type: 'PUSH', player: 'p1', at: 1000 })
  expect(r.state).toBe(s)
  expect(r.events[0].type).toBe('rejected')
})

it('ends the turn on PUSH after drawing and advances the seat', () => {
  const s = withoutTriggers(engine.createGame(config()))
  const drawn = reduce(s, { type: 'DRAW', player: 'p1', at: 1000 })
  const r = reduce(drawn.state, { type: 'PUSH', player: 'p1', at: 1001 })
  expect(r.state.turn).toEqual({
    player: 'p2',
    index: 1,
    drawnFrom: [],
    releasesPlayed: 0,
    // The seat change hands the next player a fresh inactivity clock.
    openedAt: 1001,
    deadline: 1001 + 30_000,
  })
  expect(r.events.map((e) => e.type)).toEqual(['turnEnded', 'turnStarted'])
})

it('holds the turn open on a hand-limit overflow instead of advancing', () => {
  const s = withoutTriggers(engine.createGame(config({ ...BASE, handLimit: 'memory' })))
  const drawn = reduce(s, { type: 'DRAW', player: 'p1', at: 1000 })
  // Six cards against a limit of five.
  const r = reduce(drawn.state, { type: 'PUSH', player: 'p1', at: 1001 })
  expect(r.state.turn.player).toBe('p1')
  expect(r.state.pending).toEqual({ kind: 'handLimit', player: 'p1', excess: 1 })
})

it('advances the turn once the overflow is discarded', () => {
  const s = withoutTriggers(engine.createGame(config({ ...BASE, handLimit: 'memory' })))
  const drawn = reduce(s, { type: 'DRAW', player: 'p1', at: 1000 })
  const held = reduce(drawn.state, { type: 'PUSH', player: 'p1', at: 1001 })
  const victim = held.state.players.p1.hand[0].uid
  const r = reduce(held.state, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'handLimit', cards: [victim] },
    at: 1002,
  })
  expect(r.state.pending).toBeNull()
  expect(r.state.players.p1.hand).toHaveLength(5)
  expect(r.state.decks.discard.at(-1)?.uid).toBe(victim)
  expect(r.state.turn.player).toBe('p2')
})

it('rejects a hand-limit discard of the wrong size', () => {
  const s = withoutTriggers(engine.createGame(config({ ...BASE, handLimit: 'memory' })))
  const drawn = reduce(s, { type: 'DRAW', player: 'p1', at: 1000 })
  const held = reduce(drawn.state, { type: 'PUSH', player: 'p1', at: 1001 })
  const r = reduce(held.state, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'handLimit', cards: [] },
    at: 1002,
  })
  expect(r.state).toBe(held.state)
  expect(r.events[0].type).toBe('rejected')
})

it('numbers events monotonically across reductions', () => {
  const s = withoutTriggers(engine.createGame(config()))
  // createGame reserves one event id per seated player for the deal (3
  // here), so reduce's own numbering picks up right after that reservation.
  const start = s.eventSeq
  const a = reduce(s, { type: 'DRAW', player: 'p1', at: 1000 })
  const b = reduce(a.state, { type: 'PUSH', player: 'p1', at: 1001 })
  expect(a.events.map((e) => e.id)).toEqual([start + 1])
  expect(b.events.map((e) => e.id)).toEqual([start + 2, start + 3])
  expect(b.state.eventSeq).toBe(start + 3)
})

it('rejects an unknown action without throwing', () => {
  const s = engine.createGame(config())
  const bogus = { type: 'NOPE', player: 'p1', at: 1 } as unknown as Action
  expect(() => reduce(s, bogus)).not.toThrow()
  expect(reduce(s, bogus).state).toBe(s)
})

// The TS Action type does not survive JSON deserialization, so a peer's message
// may be any shape at all. `reduce` must stay total against every one of these
// without ever descending into a handler that assumes a well-formed payload.
describe('stays total against a malformed action', () => {
  it('rejects a RESOLVE with no choice field, without throwing', () => {
    const s = engine.createGame(config())
    const bogus = { type: 'RESOLVE', player: 'p1', at: 1 } as unknown as Action
    expect(() => reduce(s, bogus)).not.toThrow()
    const r = reduce(s, bogus)
    expect(r.state).toBe(s)
    expect(r.events.map((e) => e.type)).toEqual(['rejected'])
  })

  it('rejects a RESOLVE with choice: null, without throwing', () => {
    const s = engine.createGame(config())
    const bogus = { type: 'RESOLVE', player: 'p1', choice: null, at: 1 } as unknown as Action
    expect(() => reduce(s, bogus)).not.toThrow()
    const r = reduce(s, bogus)
    expect(r.state).toBe(s)
    expect(r.events.map((e) => e.type)).toEqual(['rejected'])
  })

  it('rejects a handLimit choice missing its cards array, without throwing', () => {
    const s = withoutTriggers(engine.createGame(config({ ...BASE, handLimit: 'memory' })))
    const drawn = reduce(s, { type: 'DRAW', player: 'p1', at: 1000 })
    const held = reduce(drawn.state, { type: 'PUSH', player: 'p1', at: 1001 })
    const bogus = {
      type: 'RESOLVE',
      player: 'p1',
      choice: { kind: 'handLimit' },
      at: 1002,
    } as unknown as Action
    expect(() => reduce(held.state, bogus)).not.toThrow()
    const r = reduce(held.state, bogus)
    expect(r.state).toBe(held.state)
    expect(r.events.map((e) => e.type)).toEqual(['rejected'])
  })

  it('rejects a handLimit choice whose cards is not an array, without throwing', () => {
    const s = withoutTriggers(engine.createGame(config({ ...BASE, handLimit: 'memory' })))
    const drawn = reduce(s, { type: 'DRAW', player: 'p1', at: 1000 })
    const held = reduce(drawn.state, { type: 'PUSH', player: 'p1', at: 1001 })
    // `null` has no `.length`, so this is the payload that actually forces the
    // `Array.isArray` guard: a string like 'not-an-array' would coincidentally
    // fail the length check below without ever exercising the guard.
    const bogus = {
      type: 'RESOLVE',
      player: 'p1',
      choice: { kind: 'handLimit', cards: null },
      at: 1002,
    } as unknown as Action
    expect(() => reduce(held.state, bogus)).not.toThrow()
    const r = reduce(held.state, bogus)
    expect(r.state).toBe(held.state)
    expect(r.events.map((e) => e.type)).toEqual(['rejected'])
  })

  it('rejects an action that is not an object at all, without throwing', () => {
    const s = engine.createGame(config())
    expect(() => reduce(s, null as unknown as Action)).not.toThrow()
    const rNull = reduce(s, null as unknown as Action)
    expect(rNull.state).toBe(s)
    expect(rNull.events.map((e) => e.type)).toEqual(['rejected'])

    expect(() => reduce(s, 'nope' as unknown as Action)).not.toThrow()
    const rString = reduce(s, 'nope' as unknown as Action)
    expect(rString.state).toBe(s)
    expect(rString.events.map((e) => e.type)).toEqual(['rejected'])
  })
})

it('offers every living opponent as a hand-attack target', () => {
  const s = withoutTriggers(engine.createGame(config()))
  const bug = { uid: 'attack-bug#0', id: 'attack-bug' }
  const armed = {
    ...s,
    players: { ...s.players, p1: { ...s.players.p1, hand: [bug] } },
  }
  expect(engine.legalTargets(armed, 'p1', bug.uid)).toEqual([
    { kind: 'player', player: 'p2' },
    { kind: 'player', player: 'p3' },
  ])
})
