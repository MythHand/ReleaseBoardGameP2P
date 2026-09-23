import { expect, it } from 'vitest'
import { createScenario, engine, OPERATION_SCENARIOS, SCENARIOS } from './scenarios'

// EVERY PAGE IS THE SAME GAME, and this is what says so out loud: one setup, one
// table shape, every preset built. A preset builds by PLAYING its way into
// position through the real engine, so one that stops building throws — and
// without this it throws on the screen, in front of whoever opened that tab,
// rather than here (owner, 22.09).
it.each(SCENARIOS)('builds %s on the same table as every other page', (scenario) => {
  const state = createScenario(scenario, 'debug-all')
  // three seats, always: everything that needs a third player — a relayed
  // batch, an audience, a roster a pending is owed by — is reachable from
  // every page or from none
  expect(state.seating).toEqual(['you', 'p2', 'p3'])
  // and the game's own base mode, so a release costs a card wherever it is played
  expect(state.setup.releaseCond).toBe('base')
})

it.each(OPERATION_SCENARIOS)('starts and plays %s through the engine', (scenario) => {
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
