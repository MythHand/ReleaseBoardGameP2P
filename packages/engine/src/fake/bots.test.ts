import type { GameConfig } from '../engine'
import { botAction, runUntilIdle } from './bots'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from './index'

const engine = createFakeEngine()

const config = (): GameConfig => ({
  gameId: 'g1',
  seed: 4242,
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

it('offers nothing to a seat with no outstanding action', () => {
  const s = engine.createGame(config())
  expect(botAction(engine, s, 'p2', 1000)).toBeNull()
})

it('only ever proposes an action the engine accepts', () => {
  let state = engine.createGame(config())
  for (let n = 0; n < 400 && !state.over; n += 1) {
    const seat = state.pending?.player ?? state.turn.player
    const action = botAction(engine, state, seat, 1000 + n * 100)
    if (!action) break
    const r = engine.reduce(state, action)
    expect(
      r.events.filter((e) => e.type === 'rejected'),
      `rejected ${JSON.stringify(action)}`,
    ).toEqual([])
    state = r.state
  }
})

it('drives the table back to the human without hanging', () => {
  const s = engine.createGame(config())
  const advanced = runUntilIdle(engine, { ...s, turn: { ...s.turn, player: 'p2' } }, 'p1', 1000)
  expect(advanced.turn.player === 'p1' || advanced.over !== null).toBe(true)
})

it('reaches a finished game when every seat is driven', () => {
  let state = engine.createGame(config())
  for (let n = 0; n < 2000 && !state.over; n += 1) {
    const seat = state.pending?.player ?? state.turn.player
    const action = botAction(engine, state, seat, 1000 + n * 100)
    if (!action) break
    state = engine.reduce(state, action).state
  }
  expect(state.over).not.toBeNull()
})
