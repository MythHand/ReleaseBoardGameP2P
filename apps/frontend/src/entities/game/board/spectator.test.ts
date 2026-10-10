import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from '@release/engine/fake'
import { toBoardOver } from './toBoardOver'
import { type HistoryLabels, toBoardState } from './toBoardState'

it.each([2, 4, 6])('projects all %i public seats without a local identity', (count) => {
  const engine = createFakeEngine()
  const state = engine.createGame({
    gameId: 'public',
    seed: 14,
    setup: {},
    deck: FAKE_DECK,
    events: FAKE_EVENTS,
    players: Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `Player ${i}` })),
  })
  const view = engine.spectate(state)
  const board = toBoardState(view, engine.setupEvents(state), {} as HistoryLabels)
  expect(board.you).toBeNull()
  expect(board.selfId).toBeNull()
  expect(board.opponents.map((seat) => seat.id)).toEqual(state.seating)
  expect(board.playable).toEqual([])
  expect(board.frozen).toEqual([])
  expect(toBoardOver({ ...view, over: { winner: 'p1', condition: 'release' } })).toEqual({
    winnerId: 'p1',
    condition: 'release',
  })
})
