import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from '@release/engine/fake'
import { accumulateSync } from './syncSnapshot'

it('retains the newest presentation and all batches before Board mounts, including rejection-only updates', () => {
  const engine = createFakeEngine()
  const state = engine.createGame({
    gameId: 'g',
    seed: 17,
    players: [
      { id: 'a', name: 'a' },
      { id: 'b', name: 'b' },
    ],
    setup: {},
    deck: FAKE_DECK,
    events: FAKE_EVENTS,
  })
  const view = engine.project(state, 'a')
  const events = engine.setupEvents(state)
  const first = { gameId: 'g', incarnation: 'i', revision: 1 }
  const second = { ...first, revision: 2 }
  const one = accumulateSync(null, { view, events: events.slice(0, 1), presentation: first })
  const two = accumulateSync(one, { view, events: events.slice(1), presentation: second })
  const clocks = accumulateSync(two, { view, events: [] })
  expect(clocks.events).toEqual(events)
  expect(clocks.presentation).toEqual(second)
})
