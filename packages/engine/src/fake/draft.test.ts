import { describe, expect, it } from 'vitest'
import type { Action } from '../actions'
import type { CardInstance, GameState, Pending } from '../state'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from './index'
import { reduce } from './reduce'

// DRAFT — the answer as it stands on the player's screen, kept on the open
// decision for the moment its time runs out.

const engine = createFakeEngine()
const bug = (tag: string): CardInstance => ({ uid: `attack-bug#${tag}`, id: 'attack-bug' })
const clock = { openedAt: 0, deadline: 40_000 }

function table(pending: Pending, held: CardInstance[] = []): GameState {
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
  return { ...base, players: { ...base.players, p1: { ...base.players.p1, hand: held } }, pending }
}

const limit: Pending = { kind: 'handLimit', player: 'p1', excess: 2, ...clock }
const hand = [bug('a'), bug('b'), bug('c')]
const laidOut = (cards: string[], player = 'p1'): Action => ({
  type: 'DRAFT',
  player,
  draft: { kind: 'handLimit', cards },
  at: 9000,
})

const rebase: Pending = {
  kind: 'reorderTop',
  player: 'p1',
  piles: [{ pile: 0, cards: [bug('a'), bug('b'), bug('c')] }],
  source: 'operation-git-rebase',
  raisedAt: 1,
  ...clock,
}
const ordered = (cards: string[]): Action => ({
  type: 'DRAFT',
  player: 'p1',
  draft: { kind: 'reorderTop', order: [{ pile: 0, cards }] },
  at: 9000,
})

const upgrade: Pending = {
  kind: 'systemUpgrade',
  actor: 'p1',
  owed: [],
  thrown: [
    { player: 'p2', card: bug('a') },
    { player: 'p2', card: bug('b') },
  ],
  sudo: true,
  phase: 'picking',
  source: 'operation-system-upgrade',
  ...clock,
}
const marked = (card: string, player = 'p1'): Action => ({
  type: 'DRAFT',
  player,
  draft: { kind: 'upgradeTake', card },
  at: 9000,
})

const trigger: CardInstance = { uid: 'trigger-ai#t', id: 'trigger-ai' }
const pick = (picks: 1 | 2): Pending => ({
  kind: 'pickFromDiscard',
  player: 'p1',
  options: [bug('a'), bug('b'), trigger],
  picks,
  source: 'operation-git-cherry-pick',
  raisedAt: 1,
  ...clock,
})
const picked = (draft: { card?: string; toDeck?: string }, player = 'p1'): Action => ({
  type: 'DRAFT',
  player,
  draft: { kind: 'pickFromDiscard', ...draft },
  at: 9000,
})

describe('a draft', () => {
  it('keeps the cards marked out of the discard, each role on its own', () => {
    expect(
      reduce(table(pick(2)), picked({ card: 'attack-bug#a', toDeck: 'trigger-ai#t' })).state
        .pending,
    ).toEqual({ ...pick(2), draft: { card: 'attack-bug#a', toDeck: 'trigger-ai#t' } })
    // a pick made in part keeps the half that was made
    expect(reduce(table(pick(2)), picked({ toDeck: 'trigger-ai#t' })).state.pending).toEqual({
      ...pick(2),
      draft: { toDeck: 'trigger-ai#t' },
    })
  })

  it('keeps the card the System Upgrade actor has marked to take', () => {
    expect(reduce(table(upgrade), marked('attack-bug#b')).state.pending).toEqual({
      ...upgrade,
      draft: 'attack-bug#b',
    })
  })

  it('keeps the cards laid out against the hand limit, with no event and no clock moved', () => {
    const s = table(limit, hand)
    const r = reduce(s, laidOut(['attack-bug#b']))
    expect(r.events).toEqual([])
    expect(r.state.pending).toEqual({ ...limit, draft: ['attack-bug#b'] })
    expect(r.state.turn).toEqual(s.turn)
  })

  it('keeps the Rebase order on the screen', () => {
    const order = ['attack-bug#c', 'attack-bug#a', 'attack-bug#b']
    expect(reduce(table(rebase), ordered(order)).state.pending).toEqual({
      ...rebase,
      draft: [{ pile: 0, cards: order }],
    })
  })

  it('that does not fit the open decision is not kept, and never refused', () => {
    const s = table(limit, hand)
    for (const action of [
      laidOut(['attack-bug#zz']), // not in the hand
      laidOut(['attack-bug#a', 'attack-bug#b', 'attack-bug#c']), // more than is owed
      laidOut(['attack-bug#a', 'attack-bug#a']), // the same card twice
      laidOut(['attack-bug#a'], 'p2'), // not their decision
    ]) {
      const r = reduce(s, action)
      expect(r.state).toBe(s)
      expect(r.events).toEqual([])
    }
    const r = table(rebase)
    expect(reduce(r, ordered(['attack-bug#a'])).state).toBe(r) // not the whole offer
    const u = table(upgrade)
    expect(reduce(u, marked('attack-bug#zz')).state).toBe(u) // not thrown this time
    expect(reduce(u, marked('attack-bug#a', 'p2')).state).toBe(u) // not the actor
    const d = table({ ...upgrade, phase: 'discarding' })
    expect(reduce(d, marked('attack-bug#a')).state).toBe(d) // nothing to take yet
    const p = table(pick(2))
    for (const action of [
      picked({ card: 'trigger-ai#t' }), // a trigger never goes to a hand
      picked({ card: 'attack-bug#zz' }), // not on offer
      picked({ card: 'attack-bug#a', toDeck: 'attack-bug#a' }), // one card, both places
      picked({ card: 'attack-bug#a' }, 'p2'), // not their decision
    ]) {
      expect(reduce(p, action).state).toBe(p)
    }
    const one = table(pick(1))
    expect(reduce(one, picked({ toDeck: 'attack-bug#b' })).state).toBe(one) // no deck without Sudo
  })
})
