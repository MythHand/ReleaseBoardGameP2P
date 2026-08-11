import { expect, it } from 'vitest'
import type { DeckEntry, GameConfig } from '../engine'
import { FAKE_DECK, FAKE_EVENTS } from './index'
import { createGame, setupEvents } from './setup'

const config = (players: number): GameConfig => ({
  gameId: 'g1',
  seed: 42,
  players: Array.from({ length: players }, (_, n) => ({ id: `p${n + 1}`, name: `P${n + 1}` })),
  setup: {
    handLimit: 'base',
    releases: 'base',
    releaseCond: 'base',
    ai: 'base',
    gitBranch: 'base',
  },
  deck: FAKE_DECK,
  events: FAKE_EVENTS,
})

it('emits one dealt event per player, in seating order', () => {
  const state = createGame(config(3))
  const events = setupEvents(state)
  expect(events.map((e) => e.type)).toEqual(['dealt', 'dealt', 'dealt'])
  expect(events.map((e) => (e.type === 'dealt' ? e.player : null))).toEqual(state.seating)
})

it('counts the hand it actually dealt', () => {
  const state = createGame(config(3))
  for (const e of setupEvents(state)) {
    if (e.type !== 'dealt') continue
    expect(e.count).toBe(state.players[e.player].hand.length)
  }
})

it('names the Debugger as dealt face up — it is public by the rules', () => {
  const state = createGame(config(3))
  for (const e of setupEvents(state)) {
    if (e.type !== 'dealt') continue
    const hand = state.players[e.player].hand
    const debuggers = hand.filter((c) => c.id === 'protection-debugger').map((c) => c.id)
    // Only the reserved opening Debugger is open, and it is hand[0] (setup.ts).
    expect(e.open ?? []).toEqual(hand[0]?.id === 'protection-debugger' ? [debuggers[0]] : [])
  }
})

it('is public — no dealt event is addressed to a subset of the table', () => {
  const state = createGame(config(3))
  // A count is not a secret; identities of closed cards never appear here.
  for (const e of setupEvents(state)) expect(e.visibleTo).toBeUndefined()
})

it('gives every event a distinct id', () => {
  const state = createGame(config(4))
  const ids = setupEvents(state).map((e) => e.id)
  expect(new Set(ids).size).toBe(ids.length)
})

// A deck deliberately short of Debuggers — only 2, against 3 players. In
// createGame's reservation loop (setup.ts), the collection is capped at
// `config.players.length` but can never collect more Debuggers than the
// deck actually contains, so it scans the entire shuffled deck and comes
// away with exactly 2 reserved, regardless of seed or shuffle order. Those
// two are handed to config.players[0] and config.players[1] as hand[0];
// config.players[2] gets no reservation (`debuggers[2]` is undefined) and,
// since no Debugger is left over in the unreserved remainder either, its
// hand[0] genuinely cannot be one. This exercises the real "deck ran short"
// branch the other Debugger test never reaches (FAKE_DECK carries 8 against
// at most 4 players there).
const SCARCE_DECK: DeckEntry[] = [
  { id: 'protection-debugger', qty: 2 },
  { id: 'attack-bug', qty: 10 },
  { id: 'support-sudo', qty: 10 },
  { id: 'defense-hotfix', qty: 10 },
]

it('leaves a seat closed when the deck ran short of Debuggers to reserve', () => {
  const state = createGame({ ...config(3), deck: SCARCE_DECK })
  const events = setupEvents(state)
  expect(events).toHaveLength(3)

  // The two seats the reservation reached: open names exactly the Debugger,
  // asserted as a literal — not re-derived from hand[0], which would let a
  // hardcoded "open = the Debugger" implementation pass vacuously.
  expect(events[0]).toMatchObject({ type: 'dealt', player: 'p1', open: ['protection-debugger'] })
  expect(events[1]).toMatchObject({ type: 'dealt', player: 'p2', open: ['protection-debugger'] })

  // The seat the reservation could not reach: open is undefined, not [].
  expect(events[2]).toMatchObject({ type: 'dealt', player: 'p3' })
  expect((events[2] as { open?: unknown }).open).toBeUndefined()
})
