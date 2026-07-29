import type { GameConfig } from '../engine'
import type { CardInstance, GameState, Setup } from '../state'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from './index'
import { playableFor } from './project'
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

// --- Review findings: discarded events on every trigger-caused discard ---

it('discards the revealed Error 503 itself with a public trigger-reason event', () => {
  const r = reduce(withTop(E503, [DBG]), { type: 'DRAW', player: 'p1', at: 1000 })
  expect(r.events).toContainEqual(
    expect.objectContaining({
      type: 'discarded',
      player: 'p1',
      card: 'trigger-error-503',
      reason: 'trigger',
    }),
  )
})

it('discards the revealed AI trigger itself with a public trigger-reason event', () => {
  const ai: CardInstance = { uid: 'trigger-ai#0', id: 'trigger-ai' }
  const r = reduce(withTop(ai, []), { type: 'DRAW', player: 'p1', at: 1000 })
  expect(r.events).toContainEqual(
    expect.objectContaining({
      type: 'discarded',
      player: 'p1',
      card: 'trigger-ai',
      reason: 'trigger',
    }),
  )
})

it('discards a spent Debugger with a neutralized-reason event', () => {
  const drawn = reduce(withTop(E503, [DBG]), { type: 'DRAW', player: 'p1', at: 1000 })
  const r = reduce(drawn.state, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'neutralize503', method: 'debugger' },
    at: 1001,
  })
  expect(r.events).toContainEqual(
    expect.objectContaining({
      type: 'discarded',
      player: 'p1',
      card: 'protection-debugger',
      reason: 'neutralized',
    }),
  )
})

it('discards a sacrificed release with a neutralized-reason event', () => {
  const s = withTop(E503, [])
  const holding: GameState = {
    ...s,
    players: { ...s.players, p1: { ...s.players.p1, release: { frontend: { card: FE } } } },
  }
  const drawn = reduce(holding, { type: 'DRAW', player: 'p1', at: 1000 })
  const r = reduce(drawn.state, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'neutralize503', method: 'sacrifice', card: FE.uid },
    at: 1001,
  })
  expect(r.events).toContainEqual(
    expect.objectContaining({
      type: 'discarded',
      player: 'p1',
      card: 'release-frontend',
      reason: 'neutralized',
    }),
  )
})

it("discards an eliminated player's hand with per-card events", () => {
  const bug: CardInstance = { uid: 'attack-bug#0', id: 'attack-bug' }
  const r = reduce(withTop(E503, [bug]), { type: 'DRAW', player: 'p1', at: 1000 })
  expect(r.state.eliminated).toEqual(['p1'])
  expect(r.events).toContainEqual(
    expect.objectContaining({
      type: 'discarded',
      player: 'p1',
      card: 'attack-bug',
      reason: 'effect',
    }),
  )
})

// --- Review finding: an ai-release-* placement must remain a plain, playable
// release once it is bounced back to hand — not stuck as an unplayable 'ai'
// card. Exercised end to end: AI event places it, DDoS returns it to hand and
// freezes it for one round, the freeze lifts when the owner's own turn ends,
// and only then is it playable again. ---

it('keeps an AI-placed release playable after a DDoS bounce and thaw', () => {
  const events: GameConfig['events'] = [{ id: 'ai-release-frontend', qty: 1 }]
  const cfg: GameConfig = {
    gameId: 'g2',
    seed: 4242,
    players: [
      { id: 'p1', name: 'you' },
      { id: 'p2', name: 'kernel_panic' },
    ],
    setup: BASE,
    deck: FAKE_DECK,
    events,
  }
  const base = engine.createGame(cfg)
  const ai: CardInstance = { uid: 'trigger-ai#0', id: 'trigger-ai' }
  const s: GameState = {
    ...base,
    players: {
      ...base.players,
      p1: { ...base.players.p1, hand: [] },
    },
    decks: { ...base.decks, main: [[ai, ...base.decks.main[0]]] },
  }

  // p1 draws the AI trigger; the single-entry event deck deterministically
  // pulls ai-release-frontend regardless of the rng cursor.
  const drawn = reduce(s, { type: 'DRAW', player: 'p1', at: 1000 })
  expect(drawn.state.players.p1.release.frontend?.card.id).toBe('release-frontend')
  const placedUid = drawn.state.players.p1.release.frontend?.card.uid as string

  // End p1's turn.
  const p1Pushed = reduce(drawn.state, { type: 'PUSH', player: 'p1', at: 1001 })
  expect(p1Pushed.state.turn.player).toBe('p2')

  // p2 DDoS's the placed release: it bounces to p1's hand and freezes.
  const ddos: CardInstance = { uid: 'attack-ddos#0', id: 'attack-ddos' }
  const p2Armed: GameState = {
    ...p1Pushed.state,
    players: { ...p1Pushed.state.players, p2: { ...p1Pushed.state.players.p2, hand: [ddos] } },
  }
  const bounced = reduce(p2Armed, {
    type: 'PLAY',
    player: 'p2',
    card: ddos.uid,
    target: { kind: 'release', player: 'p1', slot: 'frontend' },
    at: 1002,
  })
  expect(bounced.state.players.p1.release.frontend).toBeUndefined()
  expect(bounced.state.players.p1.hand.map((c) => c.uid)).toContain(placedUid)
  expect(bounced.state.players.p1.frozen).toContain(placedUid)

  // p2 ends their turn (skip drawing — hasDrawn is set directly, as `withTop`-
  // style helpers elsewhere in this file already construct state directly).
  const p2Done: GameState = { ...bounced.state, turn: { ...bounced.state.turn, hasDrawn: true } }
  const toP1 = reduce(p2Done, { type: 'PUSH', player: 'p2', at: 1003 })
  expect(toP1.state.turn.player).toBe('p1')
  expect(toP1.state.players.p1.frozen).toContain(placedUid)

  // p1's turn while still frozen: not playable yet.
  expect(playableFor(toP1.state, 'p1')).not.toContain(placedUid)

  // p1 ends this turn — the freeze lifts as their own turn ends.
  const p1Done: GameState = { ...toP1.state, turn: { ...toP1.state.turn, hasDrawn: true } }
  const toP2 = reduce(p1Done, { type: 'PUSH', player: 'p1', at: 1004 })
  expect(toP2.state.players.p1.frozen).toEqual([])

  // Back to p2, then back to p1: now it must be playable.
  const p2Done2: GameState = { ...toP2.state, turn: { ...toP2.state.turn, hasDrawn: true } }
  const backToP1 = reduce(p2Done2, { type: 'PUSH', player: 'p2', at: 1005 })
  expect(backToP1.state.turn.player).toBe('p1')
  expect(playableFor(backToP1.state, 'p1')).toContain(placedUid)
})
