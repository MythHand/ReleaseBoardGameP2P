import type { Event, PlayerView } from '@release/engine'
import { expect, it } from 'vitest'
import { planDeal } from './planDeal'

const dealt = (player: string, count: number, open?: string[]): Event =>
  ({ id: 1, type: 'dealt', player, count, ...(open ? { open } : {}) }) as Event

const view = (): PlayerView =>
  ({
    self: {
      id: 'p1',
      name: 'One',
      hand: [
        { uid: 'protection-debugger#0', id: 'protection-debugger' },
        { uid: 'attack-bug#1', id: 'attack-bug' },
        { uid: 'attack-ddos#0', id: 'attack-ddos' },
        { uid: 'defense-hotfix#0', id: 'defense-hotfix' },
        { uid: 'support-sudo#2', id: 'support-sudo' },
      ],
      release: {},
      playable: [],
      frozen: [],
    },
    opponents: [
      { id: 'p2', name: 'Two', handCount: 5, release: {}, eliminated: false },
      { id: 'p3', name: 'Three', handCount: 5, release: {}, eliminated: false },
    ],
    decks: { piles: [89], events: 21, discardCount: 0 },
    turn: { player: 'p1', index: 0, hasDrawn: false },
    window: null,
    pending: null,
    setup: {},
    over: null,
  }) as unknown as PlayerView

const feed = (): Event[] => [
  dealt('p1', 5, ['protection-debugger']),
  dealt('p2', 5, ['protection-debugger']),
  dealt('p3', 5, ['protection-debugger']),
]

it('counts the pile back up to what it was before the deal', () => {
  const plan = planDeal(view(), feed())
  // 89 left + 15 dealt
  expect(plan?.deckBefore).toBe(104)
})

it('deals round by round, the player first in every round', () => {
  const plan = planDeal(view(), feed())
  const order = plan?.flights.slice(0, 6).map((f) => (f.to.kind === 'self' ? 'self' : f.to.player))
  expect(order).toEqual(['self', 'p2', 'p3', 'self', 'p2', 'p3'])
})

it('opens the first round and closes the four that follow', () => {
  const plan = planDeal(view(), feed())
  const first = plan?.flights.filter((f) => f.round === 0) ?? []
  const rest = plan?.flights.filter((f) => f.round > 0) ?? []
  expect(first.every((f) => f.faceUp)).toBe(true)
  expect(rest.every((f) => !f.faceUp)).toBe(true)
})

it('names an opponent card only when it was dealt face up', () => {
  const plan = planDeal(view(), feed())
  const opp = plan?.flights.filter((f) => f.to.kind === 'seat') ?? []
  expect(opp.filter((f) => f.round === 0).every((f) => f.card === 'protection-debugger')).toBe(true)
  expect(opp.filter((f) => f.round > 0).every((f) => f.card === null)).toBe(true)
})

it('deals into the fan in the projection order, so the fan never re-sorts', () => {
  const v = view()
  const plan = planDeal(v, feed())
  expect(plan?.hand.map((h) => h.uid)).toEqual(v.self.hand.map((c) => c.uid))
  const mine = plan?.flights.filter((f) => f.to.kind === 'self') ?? []
  expect(mine.map((f) => (f.to.kind === 'self' ? f.to.index : -1))).toEqual([0, 1, 2, 3, 4])
})

it('deals a closed first round when the deck had no Debugger for this seat', () => {
  const v = view()
  v.self.hand[0] = { uid: 'attack-bug#2', id: 'attack-bug' }
  const plan = planDeal(v, [dealt('p1', 5), dealt('p2', 5), dealt('p3', 5)])
  expect(plan?.flights.every((f) => !f.faceUp)).toBe(true)
})

it('handles an uneven deal without inventing flights', () => {
  const v = view()
  v.opponents[1].handCount = 3
  const plan = planDeal(v, [
    dealt('p1', 5, ['protection-debugger']),
    dealt('p2', 5),
    dealt('p3', 3),
  ])
  expect(plan?.flights.filter((f) => f.to.kind === 'seat' && f.to.player === 'p3')).toHaveLength(3)
})

it('is null when the feed carries no deal', () => {
  expect(planDeal(view(), [])).toBeNull()
})

// The pile the intro counts down from must land exactly on the pile the
// projection already holds: the intro shows `deckBefore` and takes one off per
// flight, then the live count takes over. One flight too many or too few and the
// number visibly jumps at the handover.
//
// Written after a false alarm worth recording: the board showed 89 mid-deal and
// that was read as wrong against a 94-card deck — but the deck had grown to 99
// cards in the meantime, and 89 was exactly right. The arithmetic is worth
// pinning precisely because it cannot be checked by eye against a total that
// moves.
it('counts down to exactly the pile the projection reports', () => {
  const v = view()
  const plan = planDeal(v, feed())
  if (!plan) throw new Error('expected a plan for an opening projection')
  const live = v.decks.piles.reduce((sum, n) => sum + n, 0)
  expect(plan.deckBefore - plan.flights.length).toBe(live)
})

it('counts down to the live pile on an uneven deal too', () => {
  const v = view()
  v.opponents[1].handCount = 3
  const plan = planDeal(v, [
    dealt('p1', 5, ['protection-debugger']),
    dealt('p2', 5),
    dealt('p3', 3),
  ])
  if (!plan) throw new Error('expected a plan for an opening projection')
  const live = v.decks.piles.reduce((sum, n) => sum + n, 0)
  // 13 dealt, 13 flights: a seat dealt fewer cards must not leave the counter
  // short, and must not invent a flight to make the sum work either.
  expect(plan.flights).toHaveLength(13)
  expect(plan.deckBefore - plan.flights.length).toBe(live)
})
