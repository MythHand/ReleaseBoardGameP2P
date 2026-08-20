import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from './index'

const config = (seed: number) => ({
  gameId: 'tally',
  seed,
  players: [
    { id: 'p1', name: 'one' },
    { id: 'p2', name: 'two' },
    { id: 'p3', name: 'three' },
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

it('starts every seat at zero', () => {
  const state = createFakeEngine().createGame(config(4242))
  expect(Object.keys(state.tally).sort()).toEqual(['p1', 'p2', 'p3'])
  for (const id of state.seating) {
    expect(state.tally[id]).toEqual({
      attack: 0,
      defense: 0,
      ddos: 0,
      ai: 0,
      err503: 0,
      cherryPick: 0,
      attackedInto: 0,
    })
  }
})

it('leaves the tally alone when an action is rejected', () => {
  const engine = createFakeEngine()
  const state = engine.createGame(config(4242))
  // p2 is not on turn, so this is rejected and the identical state comes back.
  const after = engine.reduce(state, { type: 'DRAW', player: 'p2', at: 1000 })
  expect(after.state.tally).toBe(state.tally)
})

it('withholds the tally from the projection until the match ends', () => {
  const engine = createFakeEngine()
  const state = engine.createGame(config(4242))
  expect(state.over).toBeNull()
  expect(engine.project(state, 'p1').tally).toBeNull()
})

it('hands over the tally for every seat once the match ends', () => {
  const engine = createFakeEngine()
  // A hand-built ending: `over` is what gates the projection, so set it rather
  // than fuzzing thousands of steps to reach a natural win.
  const state = {
    ...engine.createGame(config(4242)),
    over: { winner: 'p1' as const, condition: 'release' as const },
  }
  const view = engine.project(state, 'p1')
  expect(view.tally).not.toBeNull()
  expect(Object.keys(view.tally ?? {}).sort()).toEqual(['p1', 'p2', 'p3'])
})

it('does not hand the caller the tally objects held in state', () => {
  const engine = createFakeEngine()
  const state = {
    ...engine.createGame(config(4242)),
    over: { winner: 'p1' as const, condition: 'release' as const },
  }
  const view = engine.project(state, 'p1')
  expect(view.tally?.p1).not.toBe(state.tally.p1)
  expect(view.tally?.p1).toEqual(state.tally.p1)
})
