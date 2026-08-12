import { describe, expect, it } from 'vitest'
import type { GameConfig } from '../engine'
import type { CardInstance, GameState, Setup } from '../state'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from './index'
import { reduce } from './reduce'

const engine = createFakeEngine()

const BASE: Setup = {
  handLimit: 'base',
  releases: 'base',
  releaseCond: 'easy',
  ai: 'base',
  gitBranch: 'base',
}

const config: GameConfig = {
  gameId: 'g1',
  seed: 4242,
  players: [
    { id: 'p1', name: 'you' },
    { id: 'p2', name: 'kernel_panic' },
  ],
  setup: BASE,
  deck: FAKE_DECK,
  events: FAKE_EVENTS,
}

const BRANCH: CardInstance = { uid: 'operation-git-branch#0', id: 'operation-git-branch' }
const MERGE: CardInstance = { uid: 'operation-git-merge#0', id: 'operation-git-merge' }
const SUDO: CardInstance = { uid: 'support-sudo#0', id: 'support-sudo' }

// Numbered filler so a split can be read off by position rather than by luck.
const pile = (tag: string, n: number): CardInstance[] =>
  Array.from({ length: n }, (_, i) => ({ uid: `attack-bug#${tag}${i}`, id: 'attack-bug' }))

function table(hand: CardInstance[], main: CardInstance[][], discard: CardInstance[] = []) {
  const base = engine.createGame(config)
  const state: GameState = {
    ...base,
    // Already drawn, so the operation is the only thing this turn does.
    turn: { ...base.turn, player: 'p1', drawnFrom: [0] },
    players: { ...base.players, p1: { ...base.players.p1, hand } },
    decks: { ...base.decks, main, discard },
  }
  return state
}

const sizes = (s: GameState) => s.decks.main.map((p) => p.length)

describe('Git Branch splits a pile (#61 slice B)', () => {
  it('cuts the chosen pile in half, in place', () => {
    const state = table([BRANCH], [pile('a', 4), pile('b', 6)])

    const r = reduce(state, {
      type: 'PLAY',
      player: 'p1',
      card: BRANCH.uid,
      target: { kind: 'pile', pile: 1 },
      at: 1000,
    })

    // The split pile becomes two, and the untouched pile keeps its place.
    expect(sizes(r.state)).toEqual([4, 3, 3])
  })

  it('gives the larger half to the first side when the pile is odd', () => {
    const state = table([BRANCH], [pile('a', 7)])
    const r = reduce(state, { type: 'PLAY', player: 'p1', card: BRANCH.uid, at: 1000 })
    expect(sizes(r.state)).toEqual([4, 3])
  })

  it('needs no target when there is only one pile to split', () => {
    const state = table([BRANCH], [pile('a', 4)])
    const r = reduce(state, { type: 'PLAY', player: 'p1', card: BRANCH.uid, at: 1000 })
    expect(sizes(r.state)).toEqual([2, 2])
  })

  it('does nothing to a single-card pile, and is still spent', () => {
    // Answer 4: "фактически ничего не произойдёт, карта гит бренч просто уходит
    // в сброс". A legal play with no effect — not a rejection.
    const state = table([BRANCH], [pile('a', 1)])

    const r = reduce(state, { type: 'PLAY', player: 'p1', card: BRANCH.uid, at: 1000 })

    expect(sizes(r.state)).toEqual([1])
    expect(r.state.players.p1.hand).toHaveLength(0)
    expect(r.state.decks.discard.map((c) => c.uid)).toContain(BRANCH.uid)
    expect(r.events.some((e) => e.type === 'rejected')).toBe(false)
  })

  it('conserves every card it moves', () => {
    const state = table([BRANCH], [pile('a', 9)])
    const before = state.decks.main.flat().map((c) => c.uid)
    const r = reduce(state, { type: 'PLAY', player: 'p1', card: BRANCH.uid, at: 1000 })
    expect(r.state.decks.main.flat().map((c) => c.uid)).toEqual(before)
  })

  it('under sudo also flips the discard in as a further pile, unshuffled', () => {
    // Answer 5: the split and the flip are independent. One pile plus a discard
    // becomes three piles and an empty discard. "не перемешивайте карты".
    const dumped = pile('d', 5)
    const state = table([BRANCH, SUDO], [pile('a', 4)], dumped)

    const r = reduce(state, {
      type: 'PLAY',
      player: 'p1',
      card: BRANCH.uid,
      combo: SUDO.uid,
      at: 1000,
    })

    expect(sizes(r.state)).toEqual([2, 2, 5])
    expect(r.state.decks.discard.filter((c) => c.uid !== BRANCH.uid && c.uid !== SUDO.uid)).toEqual(
      [],
    )
    expect(r.state.decks.main[2].map((c) => c.uid)).toEqual(dumped.map((c) => c.uid))
  })
})

describe('Git Merge collapses every pile', () => {
  it('makes one pile of them all', () => {
    const state = table([MERGE], [pile('a', 4), pile('b', 3), pile('c', 2)])
    const r = reduce(state, { type: 'PLAY', player: 'p1', card: MERGE.uid, at: 1000 })
    expect(sizes(r.state)).toEqual([9])
  })

  it('shuffles rather than concatenating in order', () => {
    const state = table([MERGE], [pile('a', 12), pile('b', 12)])
    const before = state.decks.main.flat().map((c) => c.uid)
    const r = reduce(state, { type: 'PLAY', player: 'p1', card: MERGE.uid, at: 1000 })

    const after = r.state.decks.main[0].map((c) => c.uid)
    expect([...after].sort()).toEqual([...before].sort())
    expect(after).not.toEqual(before)
  })

  it('under sudo takes the discard with it', () => {
    const state = table([MERGE, SUDO], [pile('a', 4)], pile('d', 6))
    const r = reduce(state, {
      type: 'PLAY',
      player: 'p1',
      card: MERGE.uid,
      combo: SUDO.uid,
      at: 1000,
    })

    // Four in the pile, six from the discard; the spent cards land after.
    expect(r.state.decks.main).toHaveLength(1)
    expect(r.state.decks.main[0]).toHaveLength(10)
    expect(r.state.decks.discard.map((c) => c.uid).sort()).toEqual([MERGE.uid, SUDO.uid].sort())
  })
})

describe('a pile emptied by a draw (#61 slice B, answer 7)', () => {
  it('is gone once the draw that emptied it finishes', () => {
    const state = table([], [pile('a', 1), pile('b', 1), pile('c', 3)])
    const undrawn: GameState = { ...state, turn: { ...state.turn, drawnFrom: [] } }

    const r = reduce(undrawn, { type: 'DRAW', player: 'p1', at: 1000 })

    // Base took one from each; the two singletons are spent and drop out.
    expect(sizes(r.state)).toEqual([2])
  })

  it('keeps the last pile even when it empties, so the discard can refill it', () => {
    const state = table([], [pile('a', 1)], pile('d', 4))
    const undrawn: GameState = { ...state, turn: { ...state.turn, drawnFrom: [] } }

    const r = reduce(undrawn, { type: 'DRAW', player: 'p1', at: 1000 })

    expect(r.state.decks.main).toHaveLength(1)
  })
})
