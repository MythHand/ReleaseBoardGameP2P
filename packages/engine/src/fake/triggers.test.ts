import type { GameConfig } from '../engine'
import type { CardInstance, GameState, Setup } from '../state'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from './index'
import { reduce } from './reduce'

const engine = createFakeEngine()

const BASE: Setup = {
  handLimit: 'base',
  releases: 'base',
  releaseCond: 'base',
  ai: 'base',
  gitBranch: 'base',
}

const config = (): GameConfig => ({
  gameId: 'g1',
  seed: 4242,
  players: [
    { id: 'p1', name: 'you' },
    { id: 'p2', name: 'kernel_panic' },
  ],
  setup: BASE,
  deck: FAKE_DECK,
  events: FAKE_EVENTS,
})

const E503: CardInstance = { uid: 'trigger-error-503#0', id: 'trigger-error-503' }
const DBG: CardInstance = { uid: 'protection-debugger#0', id: 'protection-debugger' }
const MON: CardInstance = { uid: 'protection-monitoring#0', id: 'protection-monitoring' }
const FE: CardInstance = { uid: 'release-frontend#0', id: 'release-frontend' }

// Stack `top` as the next card p1 will draw.
const withTop = (top: CardInstance, hand: CardInstance[] = []): GameState => {
  const s = engine.createGame(config())
  return {
    ...s,
    players: { ...s.players, p1: { ...s.players.p1, hand } },
    decks: { ...s.decks, main: [[top, ...s.decks.main[0]]] },
  }
}

it('reveals Error 503 to everyone and demands neutralization', () => {
  const r = reduce(withTop(E503, [DBG]), { type: 'DRAW', player: 'p1', at: 1000 })
  const revealed = r.events.find((e) => e.type === 'revealed')
  expect(revealed).toBeDefined()
  expect(revealed?.visibleTo).toBeUndefined()
  expect(r.state.pending).toEqual({ kind: 'neutralize503', player: 'p1', methods: ['debugger'] })
})

it('spends a Debugger to neutralize', () => {
  const drawn = reduce(withTop(E503, [DBG]), { type: 'DRAW', player: 'p1', at: 1000 })
  const r = reduce(drawn.state, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'neutralize503', method: 'debugger' },
    at: 1001,
  })
  expect(r.state.pending).toBeNull()
  expect(r.state.players.p1.hand).toEqual([])
  expect(r.state.decks.discard.map((c) => c.uid)).toEqual(
    expect.arrayContaining([DBG.uid, E503.uid]),
  )
})

it('lets Monitoring absorb it and survive', () => {
  const s = withTop(E503, [])
  const guarded: GameState = {
    ...s,
    players: { ...s.players, p1: { ...s.players.p1, release: { monitoring: MON } } },
  }
  const drawn = reduce(guarded, { type: 'DRAW', player: 'p1', at: 1000 })
  expect(drawn.state.pending).toMatchObject({ methods: ['monitoring'] })
  const r = reduce(drawn.state, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'neutralize503', method: 'monitoring' },
    at: 1001,
  })
  expect(r.state.players.p1.release.monitoring).toEqual(MON)
  expect(r.state.decks.discard.map((c) => c.uid)).toContain(E503.uid)
})

it('sacrifices a release when that is the only way out', () => {
  const s = withTop(E503, [])
  const holding: GameState = {
    ...s,
    players: { ...s.players, p1: { ...s.players.p1, release: { frontend: { card: FE } } } },
  }
  const drawn = reduce(holding, { type: 'DRAW', player: 'p1', at: 1000 })
  expect(drawn.state.pending).toMatchObject({ methods: ['sacrifice'] })
  const r = reduce(drawn.state, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'neutralize503', method: 'sacrifice', card: FE.uid },
    at: 1001,
  })
  expect(r.state.players.p1.release.frontend).toBeUndefined()
  expect(r.state.eliminated).toEqual([])
})

it('eliminates a player with no way to neutralize, ending the game', () => {
  const r = reduce(withTop(E503, []), { type: 'DRAW', player: 'p1', at: 1000 })
  expect(r.state.pending).toBeNull()
  expect(r.state.eliminated).toEqual(['p1'])
  expect(r.state.over).toEqual({ winner: 'p2', condition: 'lastStanding' })
  expect(r.events.map((e) => e.type)).toEqual(
    expect.arrayContaining(['revealed', 'eliminated', 'gameOver']),
  )
})

it('reveals an AI trigger together with the event it pulls', () => {
  const ai: CardInstance = { uid: 'trigger-ai#0', id: 'trigger-ai' }
  const r = reduce(withTop(ai, []), { type: 'DRAW', player: 'p1', at: 1000 })
  const revealed = r.events.find((e) => e.type === 'aiRevealed')
  expect(revealed).toBeDefined()
  expect(revealed?.visibleTo).toBeUndefined()
  // The trigger goes to the discard; the event card returns to its own deck.
  expect(r.state.decks.discard.map((c) => c.uid)).toContain(ai.uid)
  expect(r.state.decks.events).toHaveLength(FAKE_EVENTS.reduce((n, e) => n + e.qty, 0))
})
