import { describe, expect, it } from 'vitest'
import type { GameConfig } from '../engine'
import type { CardInstance, GameState, Setup } from '../state'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from './index'
import { reduce } from './reduce'

const engine = createFakeEngine()

const BASE: Setup = {
  handLimit: 'base',
  releases: 'base',
  releaseCond: 'easy',
  ai: 'base',
  gitBranch: 'base',
}

const config = (setup: Setup = BASE): GameConfig => ({
  gameId: 'g1',
  seed: 4242,
  players: [
    { id: 'p1', name: 'you' },
    { id: 'p2', name: 'kernel_panic' },
  ],
  setup,
  deck: FAKE_DECK,
  events: FAKE_EVENTS,
})

const FE: CardInstance = { uid: 'release-frontend#0', id: 'release-frontend' }
const BE: CardInstance = { uid: 'release-backend#0', id: 'release-backend' }
const DB: CardInstance = { uid: 'release-database#0', id: 'release-database' }
const CR: CardInstance = { uid: 'support-code-review#0', id: 'support-code-review' }
const BUG: CardInstance = { uid: 'attack-bug#0', id: 'attack-bug' }

// p1 one release short of the win, holding whatever the test needs to finish it.
function onePlayFromWinning(hand: CardInstance[], p2Hand: CardInstance[] = []): GameState {
  const s = engine.createGame(config())
  return {
    ...s,
    players: {
      ...s.players,
      p1: {
        ...s.players.p1,
        hand,
        release: { frontend: { card: FE }, backend: { card: BE } },
      },
      p2: { ...s.players.p2, hand: p2Hand },
    },
  }
}

describe('the release that would win', () => {
  it('opens a reaction window instead of ending the game where it lands', () => {
    // The win is conditional on repelling attacks, and every fresh release
    // grants an instant-attack right with no exception for the third. Ending
    // the game on placement deletes the moment the win condition is about.
    const state = onePlayFromWinning([DB], [BUG])
    const r = reduce(state, { type: 'PLAY', player: 'p1', card: DB.uid, at: 1000 })

    expect(r.state.over).toBeNull()
    expect(r.state.window).toBeTruthy()
    expect(r.events.map((e) => e.type)).toEqual(['released', 'windowOpened'])
  })

  it('wins once that window closes with the release still standing', () => {
    const state = onePlayFromWinning([DB], [BUG])
    const played = reduce(state, { type: 'PLAY', player: 'p1', card: DB.uid, at: 1000 })
    const deadline = played.state.window?.deadline ?? 0

    const closed = reduce(played.state, { type: 'WINDOW_EXPIRED', at: deadline })

    expect(closed.state.over).toEqual({ winner: 'p1', condition: 'release' })
    expect(closed.events.map((e) => e.type)).toContain('gameOver')
  })

  it('does not win if the window takes the release away', () => {
    // Bugging the third release is the whole point of the window existing.
    const state = onePlayFromWinning([DB], [BUG])
    const played = reduce(state, { type: 'PLAY', player: 'p1', card: DB.uid, at: 1000 })
    const attacked = reduce(played.state, {
      type: 'ATTACK',
      player: 'p2',
      card: BUG.uid,
      at: 1100,
    })

    // p1 holds no defence, so the attack resolves and the slot empties.
    const resolved = attacked.state.pending
      ? reduce(attacked.state, {
          type: 'RESOLVE',
          player: 'p1',
          choice: { kind: 'defend', card: null },
          at: 1200,
        })
      : attacked
    expect(resolved.state.players.p1.release.database).toBeFalsy()
    expect(resolved.state.over).toBeNull()
  })

  it('still wins immediately under Code Review, which no window can touch', () => {
    // A protected release is unattackable, so there is no window to wait for
    // and nothing that could take it back off the board.
    const state = onePlayFromWinning([DB, CR], [BUG])
    const r = reduce(state, {
      type: 'PLAY',
      player: 'p1',
      card: DB.uid,
      combo: CR.uid,
      at: 1000,
    })

    expect(r.state.window).toBeNull()
    expect(r.state.over).toEqual({ winner: 'p1', condition: 'release' })
  })

  it('still wins when there is nobody left who could react', () => {
    // `openWindow` declines to open with no living responder. Waiting for a
    // window that never opens would hang the game one release short of its end.
    const base = onePlayFromWinning([DB])
    const alone: GameState = { ...base, eliminated: ['p2'] }

    const r = reduce(alone, { type: 'PLAY', player: 'p1', card: DB.uid, at: 1000 })

    expect(r.state.window).toBeNull()
    expect(r.state.over).toEqual({ winner: 'p1', condition: 'release' })
  })
})

describe('a zone completed by something other than a play', () => {
  it('wins when the third release is placed by an AI Release event', () => {
    // `resolveAiEvent` places the card straight into the zone, never going
    // through `placeRelease`, so this completed a winning zone and the game
    // carried on. Driven the way triggers.test.ts drives every AI event: stack
    // a trigger-ai on top of the pile and shrink the events deck to one entry,
    // so which event fires is deterministic, then draw it.
    const base = onePlayFromWinning([])
    const ai: CardInstance = { uid: 'trigger-ai#ai0', id: 'trigger-ai' }
    const release: CardInstance = { uid: 'ai-release-database#e0', id: 'ai-release-database' }
    const staged: GameState = {
      ...base,
      turn: { ...base.turn, player: 'p1', drawnFrom: [] },
      decks: {
        ...base.decks,
        main: [[ai, ...base.decks.main[0]], ...base.decks.main.slice(1)],
        events: [release],
      },
    }

    const r = reduce(staged, { type: 'DRAW', player: 'p1', at: 1000 })
    expect(r.state.players.p1.release.database).toBeTruthy()

    // An AI-placed release is attackable too (#73), so like a shipped one it
    // faces its window first and the win is settled when that window closes.
    expect(r.state.over).toBeNull()
    const settled = reduce(r.state, {
      type: 'WINDOW_EXPIRED',
      at: r.state.window?.deadline ?? 2000,
    })
    expect(settled.state.over).toEqual({ winner: 'p1', condition: 'release' })
  })

  it('wins when the third release arrives by Security Bug steal', () => {
    // `checkWin` only ever ran from `placeRelease`, so a stolen third release
    // sat in a winning zone and the game carried on until someone happened to
    // play a release, at which point the win surfaced retroactively.
    //
    // Security Bug is thrown into the window a fresh release opens, not played
    // at a release target — so p2 ships the third slot and p1 takes it away.
    const s = engine.createGame(config())
    const steal: CardInstance = { uid: 'attack-security-bug#0', id: 'attack-security-bug' }
    const state: GameState = {
      ...s,
      turn: { ...s.turn, player: 'p2', drawnFrom: [0] },
      players: {
        ...s.players,
        p1: {
          ...s.players.p1,
          hand: [steal],
          release: { frontend: { card: FE }, backend: { card: BE } },
        },
        p2: { ...s.players.p2, hand: [DB], release: {} },
      },
    }

    const played = reduce(state, { type: 'PLAY', player: 'p2', card: DB.uid, at: 1000 })
    expect(played.state.window).toBeTruthy()

    const thrown = reduce(played.state, {
      type: 'ATTACK',
      player: 'p1',
      card: steal.uid,
      at: 1100,
    })
    // p2 holds no defence, so the steal resolves and the window closes with it.
    const resolved = thrown.state.pending
      ? reduce(thrown.state, {
          type: 'RESOLVE',
          player: 'p2',
          choice: { kind: 'defend', card: null },
          at: 1200,
        })
      : thrown

    expect(resolved.state.players.p1.release.database).toBeTruthy()
    expect(resolved.state.over).toEqual({ winner: 'p1', condition: 'release' })
  })
})
