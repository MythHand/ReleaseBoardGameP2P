import { describe, expect, it } from 'vitest'
import type { GameConfig } from '../engine'
import type { CardInstance, GameState, Setup } from '../state'
import { drawObligationMet } from './core'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from './index'
import { reduce } from './reduce'

const engine = createFakeEngine()

const setupWith = (gitBranch: string): Setup => ({
  handLimit: 'base',
  releases: 'base',
  releaseCond: 'easy',
  ai: 'base',
  gitBranch,
})

const config = (gitBranch: string): GameConfig => ({
  gameId: 'g1',
  seed: 4242,
  players: [
    { id: 'p1', name: 'you' },
    { id: 'p2', name: 'kernel_panic' },
  ],
  setup: setupWith(gitBranch),
  deck: FAKE_DECK,
  events: FAKE_EVENTS,
})

const c = (id: string, n: string): CardInstance => ({ uid: `${id}#${n}`, id })

// Three piles with known tops. Git Branch is what splits a deck in play, and it
// is slice B — until then the only way to reach a multi-pile table is to build
// one, which is also the only way this slice can be tested.
function threePiles(gitBranch: string, tops: CardInstance[][]): GameState {
  const base = engine.createGame(config(gitBranch))
  return {
    ...base,
    turn: { ...base.turn, player: 'p1' },
    players: { ...base.players, p1: { ...base.players.p1, hand: [] } },
    decks: { ...base.decks, main: tops },
  }
}

const A = c('attack-bug', 'a')
const B = c('attack-ddos', 'b')
const C = c('defence-hotfix', 'c')

describe('Base draws from every pile (#61 slice A)', () => {
  it('takes one card off each pile in one action', () => {
    // "Базовый добор подразумевает всегда по одной верхней карты из всех колод
    // добора." Three piles is three cards, from one press of one control.
    const state = threePiles('base', [[A], [B], [C]])

    const r = reduce(state, { type: 'DRAW', player: 'p1', at: 1000 })

    expect(r.state.players.p1.hand.map((x) => x.uid).sort()).toEqual([A.uid, B.uid, C.uid].sort())
    expect(r.state.decks.main.every((p) => p.length === 0)).toBe(true)
  })

  it('leaves the turn undrawable again once every pile is done', () => {
    const state = threePiles('base', [[A], [B], [C]])
    const drawn = reduce(state, { type: 'DRAW', player: 'p1', at: 1000 })
    const again = reduce(drawn.state, { type: 'DRAW', player: 'p1', at: 1100 })
    expect(again.events.some((e) => e.type === 'rejected')).toBe(true)
  })

  it('refuses PUSH until the obligation is met, and allows it after', () => {
    const state = threePiles('base', [[A], [B], [C]])
    const early = reduce(state, { type: 'PUSH', player: 'p1', at: 1000 })
    expect(early.events.some((e) => e.type === 'rejected')).toBe(true)

    const drawn = reduce(state, { type: 'DRAW', player: 'p1', at: 1000 })
    const pushed = reduce(drawn.state, { type: 'PUSH', player: 'p1', at: 1100 })
    expect(pushed.state.turn.player).toBe('p2')
  })

  it('pauses on a trigger and keeps owing the piles behind it', () => {
    // Answer 2: a drawn Error 503 pauses the sequence until it is answered,
    // then the sequence resumes. The third pile is still owed while p1 decides.
    const state = threePiles('base', [[A], [c('trigger-error-503', 't')], [C]])
    const withDebugger: GameState = {
      ...state,
      players: {
        ...state.players,
        p1: { ...state.players.p1, hand: [c('protection-debugger', 'd')] },
      },
    }

    const r = reduce(withDebugger, { type: 'DRAW', player: 'p1', at: 1000 })
    expect(r.state.pending).toMatchObject({ kind: 'neutralize503', player: 'p1' })
    expect(r.state.drawing).toMatchObject({ player: 'p1', piles: [2] })

    const answered = reduce(r.state, {
      type: 'RESOLVE',
      player: 'p1',
      choice: { kind: 'neutralize503', method: 'debugger' },
      at: 1100,
    })

    expect(answered.state.drawing).toBeNull()
    expect(answered.state.players.p1.hand.map((x) => x.uid)).toContain(C.uid)
  })

  it('skips a pile that is already empty rather than owing it forever', () => {
    const state = threePiles('base', [[A], [], [C]])
    const r = reduce(state, { type: 'DRAW', player: 'p1', at: 1000 })

    expect(r.state.players.p1.hand.map((x) => x.uid).sort()).toEqual([A.uid, C.uid].sort())
    const pushed = reduce(r.state, { type: 'PUSH', player: 'p1', at: 1100 })
    expect(pushed.state.turn.player).toBe('p2')
  })
})

describe('Strategic draws from one pile of the player’s choosing', () => {
  it('takes a single card from the pile the action names', () => {
    // "Стратегический вариант подразумевает выбор из какой именно колоды
    // добора берется карта."
    const state = threePiles('strategic', [[A], [B], [C]])

    const r = reduce(state, { type: 'DRAW', player: 'p1', pile: 1, at: 1000 })

    expect(r.state.players.p1.hand.map((x) => x.uid)).toEqual([B.uid])
    expect(r.state.decks.main[0]).toHaveLength(1)
    expect(r.state.decks.main[2]).toHaveLength(1)
  })

  it('satisfies the whole obligation with that one card', () => {
    const state = threePiles('strategic', [[A], [B], [C]])
    const drawn = reduce(state, { type: 'DRAW', player: 'p1', pile: 1, at: 1000 })
    const pushed = reduce(drawn.state, { type: 'PUSH', player: 'p1', at: 1100 })
    expect(pushed.state.turn.player).toBe('p2')
  })
})

describe('a single-pile table is unchanged', () => {
  it('draws one card and lets the turn end, exactly as before', () => {
    const state = threePiles('base', [[A, B, C]])
    const r = reduce(state, { type: 'DRAW', player: 'p1', at: 1000 })

    expect(r.state.players.p1.hand.map((x) => x.uid)).toEqual([A.uid])
    const pushed = reduce(r.state, { type: 'PUSH', player: 'p1', at: 1100 })
    expect(pushed.state.turn.player).toBe('p2')
  })
})

describe('the obligation itself', () => {
  // Asserted directly, not through a DRAW. Under Base one action covers every
  // pile, so a partially-drawn turn is unreachable today and no reducer-level
  // test can tell a strict rule from a lax one — the mutation that makes Base
  // satisfied by any single pile passes every test above. Slice B is what makes
  // the state reachable, by letting Git Branch add a pile mid-turn; pinning the
  // rule here means slice B inherits it stated rather than assumed.
  const partly = (gitBranch: string, drawnFrom: number[]): GameState => {
    const s = threePiles(gitBranch, [[A], [B], [C]])
    return { ...s, turn: { ...s.turn, drawnFrom } }
  }

  it('is unmet under Base while any stocked pile is still undrawn', () => {
    expect(drawObligationMet(partly('base', [0]))).toBe(false)
    expect(drawObligationMet(partly('base', [0, 1]))).toBe(false)
    expect(drawObligationMet(partly('base', [0, 1, 2]))).toBe(true)
  })

  it('is met under Strategic on the first card, whichever pile it came from', () => {
    expect(drawObligationMet(partly('strategic', []))).toBe(false)
    expect(drawObligationMet(partly('strategic', [1]))).toBe(true)
  })

  it('does not owe an empty pile', () => {
    const s = threePiles('base', [[A], [], [C]])
    expect(drawObligationMet({ ...s, turn: { ...s.turn, drawnFrom: [0, 2] } })).toBe(true)
  })
})
