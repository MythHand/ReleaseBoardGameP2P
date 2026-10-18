import { describe, expect, it } from 'vitest'
import type { Action } from '../actions'
import { rulesFor } from '../cards'
import type { GameConfig } from '../engine'
import { type CardInstance, type GameState, seatOwing } from '../state'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS, passiveAction } from './index'
import { reduce } from './reduce'

const engine = createFakeEngine()

const config = (seed = 4242): GameConfig => ({
  gameId: 'g1',
  seed,
  players: [
    { id: 'p1', name: 'you' },
    { id: 'p2', name: 'kernel_panic' },
    { id: 'p3', name: 'segfault' },
  ],
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

const card = (id: string, n = '0'): CardInstance => ({ uid: `${id}#${n}`, id })
const must = (action: Action | null): Action => {
  if (!action) throw new Error('expected an action')
  return action
}
const withHand = (state: GameState, hand: CardInstance[]): GameState => ({
  ...state,
  players: { ...state.players, p1: { ...state.players.p1, hand } },
})

describe('passiveAction', () => {
  it.each([4242, 17])('never proposes PLAY or ATTACK (seed %i)', (seed) => {
    let state = engine.createGame(config(seed))
    for (let n = 0; n < 400 && !state.over; n += 1) {
      const owing = seatOwing(state.pending)
      const window = state.window
      const responders = window
        ? Object.keys(state.players).filter(
            (id) => id !== window.target.player && !state.eliminated.includes(id),
          )
        : []
      const seats = owing
        ? [owing]
        : window
          ? [...responders, window.target.player]
          : [state.turn.player]
      let action: Action | null = null
      for (const seat of seats) {
        action = passiveAction(engine, state, seat, 1000 + n * 100)
        if (action) break
      }
      if (!action) {
        // The window's owner has nothing to propose; the keeper's tick expires it.
        if (window) {
          state = engine.reduce(state, { type: 'WINDOW_EXPIRED', at: window.deadline }).state
          continue
        }
        expect.fail(`no seat had anything to do at step ${n}`)
      }
      expect(['PLAY', 'ATTACK']).not.toContain(action.type)
      const r = engine.reduce(state, action)
      expect(
        r.events.filter((e) => e.type === 'rejected'),
        `rejected ${JSON.stringify(action)}`,
      ).toEqual([])
      state = r.state
    }
  })

  it('draws then pushes on its own turn', () => {
    const state = engine.createGame(config())
    const draw = passiveAction(engine, state, 'p1', 1000)
    expect(draw).toMatchObject({ type: 'DRAW', player: 'p1' })
    const after = engine.reduce(state, must(draw))
    if (after.state.pending || after.state.window) return
    expect(passiveAction(engine, after.state, 'p1', 1100)).toMatchObject({ type: 'PUSH' })
  })

  it('offers nothing to a seat that owes nothing', () => {
    expect(passiveAction(engine, engine.createGame(config()), 'p2', 1000)).toBeNull()
  })

  it('declines a 503 while holding a Debugger', () => {
    const base = withHand(engine.createGame(config()), [card('protection-debugger')])
    const state: GameState = {
      ...base,
      pending: {
        kind: 'neutralize503',
        player: 'p1',
        card: card('trigger-error-503'),
        methods: ['debugger'],
      },
    }
    const action = passiveAction(engine, state, 'p1', 2000)
    expect(action).toEqual({ type: 'PASS', player: 'p1', at: 2000 })
    expect(engine.reduce(state, must(action)).state.eliminated).toContain('p1')
  })

  it('answers monitoring for ai-error-503', () => {
    const base = engine.createGame(config())
    const state: GameState = {
      ...base,
      pending: {
        kind: 'neutralize503',
        player: 'p1',
        card: null,
        methods: ['debugger', 'monitoring'],
        source: 'ai-error-503',
      },
    }
    expect(passiveAction(engine, state, 'p1', 2000)).toMatchObject({
      type: 'RESOLVE',
      choice: { kind: 'neutralize503', method: 'monitoring' },
    })
  })

  it('hand limit discards exactly excess, deterministically', () => {
    const hand = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((n) => card('attack-bug', n))
    const base = withHand(engine.createGame(config()), hand)
    const state: GameState = { ...base, pending: { kind: 'handLimit', player: 'p1', excess: 2 } }
    const first = passiveAction(engine, state, 'p1', 2000)
    const second = passiveAction(engine, state, 'p1', 2000)
    expect(first).toEqual(second)
    if (first?.type !== 'RESOLVE' || first.choice.kind !== 'handLimit') expect.fail('wrong answer')
    expect(first.choice.cards).toHaveLength(2)
    expect(engine.reduce(state, first).events.filter((e) => e.type === 'rejected')).toEqual([])
  })

  it('ai-inside takes a release', () => {
    const base = engine.createGame(config())
    const options = [
      card('trigger-error-503', 't'),
      card('attack-bug', 'b'),
      card('release-backend', 'r'),
    ]
    const state: GameState = {
      ...base,
      decks: { ...base.decks, discard: options },
      pending: {
        kind: 'pickFromDiscard',
        player: 'p1',
        options,
        picks: 1,
        source: 'ai-inside',
        raisedAt: 1,
      },
    }
    const action = passiveAction(engine, state, 'p1', 2000)
    if (action?.type !== 'RESOLVE' || action.choice.kind !== 'pickFromDiscard') {
      expect.fail('wrong answer')
    }
    const picked = action.choice.card
    const chosen = options.find((o) => o.uid === picked)
    expect(rulesFor(chosen?.id ?? '')?.kind).not.toBe('trigger')
    expect(engine.reduce(state, action).events.filter((e) => e.type === 'rejected')).toEqual([])
  })

  it('abandons a played card’s decision', () => {
    const base = engine.createGame(config())
    const state: GameState = {
      ...base,
      pending: { kind: 'discardForRelease', player: 'p1', release: 'release-frontend#0' } as never,
    }
    expect(passiveAction(engine, state, 'p1', 2000)).toEqual({
      type: 'ABANDON',
      player: 'p1',
      at: 2000,
    })
  })

  it('good-vibe chain with a 503 eliminates and stops the draw', () => {
    const Ai = card('trigger-ai', 'gvc')
    const base = engine.createGame(config())
    const staged: GameState = {
      ...base,
      turn: { ...base.turn, player: 'p1', drawnFrom: [] },
      players: {
        ...base.players,
        p1: { ...base.players.p1, hand: [card('protection-debugger', 'dbg')] },
      },
      decks: {
        ...base.decks,
        main: [
          [Ai, card('trigger-error-503', 't1'), card('attack-bug', 'x'), ...base.decks.main[0]],
          ...base.decks.main.slice(1),
        ],
        events: [card('ai-good-vibe-coding', 'e0')],
      },
    }
    const drawn = reduce(staged, { type: 'DRAW', player: 'p1', at: 1000 })
    expect(drawn.state.pending).toMatchObject({ kind: 'neutralize503', player: 'p1' })
    const action = passiveAction(engine, drawn.state, 'p1', 1100)
    expect(action).toMatchObject({ type: 'PASS' })
    const after = engine.reduce(drawn.state, must(action)).state
    expect(after.eliminated).toContain('p1')
    expect(after.drawing).toBeFalsy()
    expect(after.turn.player).not.toBe('p1')
    expect(after.eliminated).not.toContain(after.turn.player)
  })
})
