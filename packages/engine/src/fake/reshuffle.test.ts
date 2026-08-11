import { describe, expect, it } from 'vitest'
import type { CardInstance, GameState } from '../state'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from './index'
import { reduce } from './reduce'

const engine = createFakeEngine()

// The draw is mandatory and `onPush` rejects until it happens, so an empty pile
// with no way to refill is not a missing nicety — it is a game that can never
// reach its end. The deck is finite and cards flow steadily to the discard, so
// this state is where an ordinary game finishes, not an edge case.
function exhausted(discard: string[]): GameState {
  const base = engine.createGame({
    gameId: 'g',
    seed: 3,
    players: [
      { id: 'p1', name: 'Ann' },
      { id: 'p2', name: 'Bo' },
    ],
    setup: {},
    deck: FAKE_DECK,
    events: FAKE_EVENTS,
  })
  const pile: CardInstance[] = []
  return {
    ...base,
    turn: { ...base.turn, player: 'p1', drawnFrom: [] },
    decks: {
      ...base.decks,
      main: [pile],
      discard: discard.map((id, i) => ({ uid: `${id}#d${i}`, id })),
    },
  }
}

// Nothing a trigger fires on, so the draw is a plain take into hand and the
// assertions stay about the refill rather than about an AI event.
const PLAIN = ['attack-bug', 'attack-ddos', 'protection-debugger', 'defence-hotfix']

describe('the last pile running out', () => {
  it('takes the discard, shuffles it, and makes it the new draw pile', () => {
    const state = exhausted(PLAIN)
    const before = state.decks.discard.length

    const { state: next } = reduce(state, { type: 'DRAW', player: 'p1', at: 1000 })

    // One pile again, holding everything the discard held minus the card just
    // drawn, and a discard emptied into it.
    expect(next.decks.main).toHaveLength(1)
    expect(next.decks.main[0]).toHaveLength(before - 1)
    expect(next.decks.discard).toHaveLength(0)
    expect(next.turn.drawnFrom).toEqual([0])
    expect(next.players.p1.hand).toHaveLength(state.players.p1.hand.length + 1)
  })

  it('conserves every card across the refill', () => {
    const state = exhausted(PLAIN)
    const uids = (s: GameState) =>
      [
        ...s.decks.main.flat(),
        ...s.decks.discard,
        ...Object.values(s.players).flatMap((p) => p.hand),
      ]
        .map((c) => c.uid)
        .sort()

    const { state: next } = reduce(state, { type: 'DRAW', player: 'p1', at: 1000 })

    // A refill that invents or drops a card would still produce a playable
    // game, which is exactly why it needs asserting rather than eyeballing.
    expect(uids(next)).toEqual(uids(state))
  })

  it('shuffles rather than handing the discard back in the order it went in', () => {
    // A 40-card discard makes an accidental identity ordering vanishingly
    // unlikely, so this fails loudly if the refill forgets to shuffle.
    const many = Array.from({ length: 40 }, (_, i) => PLAIN[i % PLAIN.length] as string)
    const state = exhausted(many)

    const { state: next } = reduce(state, { type: 'DRAW', player: 'p1', at: 1000 })

    const kept = state.decks.discard.map((c) => c.uid)
    // The drawn card came off the top of the refilled pile, so putting it back
    // in front reconstructs the shuffle's own order. Sorted copies — `sort`
    // mutates, and comparing the mutated arrays would assert nothing.
    const got = [...next.players.p1.hand.slice(-1), ...next.decks.main[0]].map((c) => c.uid)
    expect([...got].sort()).toEqual([...kept].sort())
    expect(got).not.toEqual(kept)
  })

  it('advances the rng cursor, so the next shuffle is not the same shuffle', () => {
    const state = exhausted(PLAIN)
    const { state: next } = reduce(state, { type: 'DRAW', player: 'p1', at: 1000 })
    expect(next.rngCursor).toBeGreaterThan(state.rngCursor)
  })

  it('records the refill, so the table can see where the deck came from', () => {
    const state = exhausted(PLAIN)
    const { events } = reduce(state, { type: 'DRAW', player: 'p1', at: 1000 })
    const reshuffled = events.find((e) => e.type === 'deckReshuffled')
    expect(reshuffled).toBeTruthy()
    expect(reshuffled).toMatchObject({ cards: PLAIN.length })
  })

  it('still rejects when the discard is empty too, rather than looping', () => {
    // Every card is in a hand or a release zone. There is nothing to recycle,
    // and the refill must not paper over that with an empty pile.
    const state = exhausted([])
    const { state: next, events } = reduce(state, { type: 'DRAW', player: 'p1', at: 1000 })
    expect(next).toBe(state)
    expect(events.some((e) => e.type === 'rejected')).toBe(true)
  })
})
