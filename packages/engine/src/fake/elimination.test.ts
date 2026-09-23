import type { CardInstance, GameState } from '../state'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from './index'

const engine = createFakeEngine()
const card = (id: string, uid = id): CardInstance => ({ id, uid })

function game(ai = false, canAnswer = false, count = 3): GameState {
  const state = engine.createGame({
    gameId: 'elimination',
    seed: 42,
    players: Array.from({ length: count }, (_, i) => ({ id: `p${i + 1}`, name: `p${i + 1}` })),
    setup: { gitBranch: 'base' },
    deck: FAKE_DECK,
    events: FAKE_EVENTS,
  })
  return {
    ...state,
    players: {
      ...state.players,
      p1: {
        ...state.players.p1,
        hand: canAnswer ? [card('protection-debugger')] : [],
        release: {},
      },
    },
    decks: {
      ...state.decks,
      main: [
        [card(ai ? 'trigger-ai' : 'trigger-error-503'), card('attack-bug')],
        [card('defense-hotfix')],
      ],
      events: [card('ai-error-503')],
    },
  }
}

it.each([false, true])('passes the eliminated drawer’s turn to the next player (AI: %s)', (ai) => {
  const before = game(ai)
  const result = engine.reduce(before, { type: 'DRAW', player: 'p1', at: 1000 })
  expect(result.state.eliminated).toEqual(['p1'])
  expect(result.state.over).toBeNull()
  expect(result.state.turn).toMatchObject({
    player: 'p2',
    index: before.turn.index + 1,
    drawnFrom: [],
    openedAt: 1000,
  })
  expect(result.state.drawing).toBeNull()
  expect(result.state.decks.main[1]).toEqual(before.decks.main[1])
  expect(result.events.slice(-2)).toMatchObject([
    { type: 'turnEnded', player: 'p1' },
    { type: 'turnStarted', player: 'p2' },
  ])
})

it.each([false, true])('passes the turn after declining a 503 (AI: %s)', (ai) => {
  const drawn = engine.reduce(game(ai, true), { type: 'DRAW', player: 'p1', at: 1000 })
  expect(drawn.state.pending?.kind).toBe('neutralize503')
  const result = engine.reduce(drawn.state, { type: 'PASS', player: 'p1', at: 2000 })
  expect(result.state.eliminated).toEqual(['p1'])
  expect(result.state.turn.player).toBe('p2')
  expect(result.state.pending).toBeNull()
  expect(result.state.drawing).toBeNull()
})

it('projects the eliminated player’s own status even without event history', () => {
  const result = engine.reduce(game(), { type: 'DRAW', player: 'p1', at: 1000 })
  expect(engine.project(result.state, 'p1').self).toMatchObject({
    eliminated: true,
    hand: [],
    playable: [],
  })
  expect(engine.project(result.state, 'p2').self).toMatchObject({ eliminated: false })
})

it('ends the match instead of starting another turn when only one player survives', () => {
  const state = { ...game(), eliminated: ['p2'] }
  const result = engine.reduce(state, { type: 'DRAW', player: 'p1', at: 1000 })
  expect(result.state.over).toEqual({ winner: 'p3', condition: 'lastStanding' })
  expect(result.events.some((e) => e.type === 'turnStarted')).toBe(false)
})

it('skips previously eliminated seats when passing the fatal draw’s turn', () => {
  const state = { ...game(false, false, 4), eliminated: ['p2'] }
  const result = engine.reduce(state, { type: 'DRAW', player: 'p1', at: 1000 })
  expect(result.state.over).toBeNull()
  expect(result.state.turn.player).toBe('p3')
})
