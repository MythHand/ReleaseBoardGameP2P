import { expect, it } from 'vitest'
import { createScenario, engine, SCENARIOS } from './scenarios'

it.each(SCENARIOS)('starts and plays %s through the engine', (scenario) => {
  const state = createScenario(scenario, 'debug-one')
  const operation = state.players.you.hand[0]
  const result = engine.reduce(state, {
    type: 'PLAY',
    player: 'you',
    card: operation.uid,
    combo: scenario.endsWith('Sudo') ? state.players.you.hand[1].uid : undefined,
    at: 1_000,
  })
  expect(result.events.some((event) => event.type === 'rejected')).toBe(false)
  expect(result.events.length).toBeGreaterThan(0)
  expect(result.state.players.you.hand.some((card) => card.uid === operation.uid)).toBe(false)
  const expected = scenario.endsWith('Fizzle')
    ? null
    : scenario.startsWith('cherry')
      ? 'pickFromDiscard'
      : scenario.startsWith('rebase')
        ? 'reorderTop'
        : 'systemUpgrade'
  expect(result.state.pending?.kind ?? null).toBe(expected)
})

it('restarts with a fresh identity and the same deterministic card order', () => {
  const first = createScenario('cherry', 'debug-one')
  const next = createScenario('cherry', 'debug-two')
  first.players.you.hand.reverse()
  const original = createScenario('cherry', 'debug-one')
  expect(next.gameId).not.toBe(first.gameId)
  expect(next.players.you.hand).toEqual(original.players.you.hand)
  expect(next.players.you.hand).not.toEqual(first.players.you.hand)
})
