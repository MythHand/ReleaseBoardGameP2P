import { describe, expect, it } from 'vitest'
import type { GameConfig } from '../engine'
import { type CardInstance, cardsPresent, type GameState, type Setup } from '../state'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from './index'
import { reduce } from './reduce'

const engine = createFakeEngine()

const EASY: Setup = {
  handLimit: 'base',
  releases: 'base',
  releaseCond: 'easy',
  ai: 'base',
  gitBranch: 'base',
  startingDecks: 'one',
}
const HARD: Setup = { ...EASY, releaseCond: 'hard' }

const config = (setup: Setup): GameConfig => ({
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
const BUG: CardInstance = { uid: 'attack-bug#0', id: 'attack-bug' }
const SPARE: CardInstance = { uid: 'protection-debugger#0', id: 'protection-debugger' }
const REBASE: CardInstance = { uid: 'operation-git-rebase#0', id: 'operation-git-rebase' }
const CHERRY: CardInstance = { uid: 'operation-git-cherry-pick#0', id: 'operation-git-cherry-pick' }
const SEC: CardInstance = { uid: 'attack-security-bug#0', id: 'attack-security-bug' }
const SUDO: CardInstance = { uid: 'support-sudo#0', id: 'support-sudo' }
const WORKS: CardInstance = {
  uid: 'defense-works-on-my-machine#0',
  id: 'defense-works-on-my-machine',
}
const FILLER: CardInstance = { uid: 'attack-bug#f0', id: 'attack-bug' }

function table(hand: CardInstance[], p2Hand: CardInstance[] = [], setup: Setup = EASY): GameState {
  const base = engine.createGame(config(setup))
  return {
    ...base,
    turn: { ...base.turn, player: 'p1', drawnFrom: [0] },
    players: {
      ...base.players,
      p1: { ...base.players.p1, hand },
      p2: { ...base.players.p2, hand: p2Hand },
    },
  }
}

const abandon = (state: GameState, player = 'p1', at = 2000) =>
  reduce(state, { type: 'ABANDON', player, at })

const uids = (cards: CardInstance[]) => cards.map((c) => c.uid)

describe('ABANDON', () => {
  it('abandon returns a staged release to hand', () => {
    const staged = reduce(table([FE, SPARE], [], HARD), {
      type: 'PLAY',
      player: 'p1',
      card: FE.uid,
      at: 1000,
    })
    expect(staged.state.pending).toMatchObject({ kind: 'discardForRelease' })
    const r = abandon(staged.state)
    expect(r.state.pending).toBeNull()
    expect(uids(r.state.players.p1.hand)).toContain(FE.uid)
    expect(r.events).toMatchObject([{ type: 'takenBack', player: 'p1', cards: [FE.id] }])
    expect(cardsPresent(r.state).sort()).toEqual(cardsPresent(staged.state).sort())
  })

  it('abandon returns Git Rebase and its Sudo from the discard', () => {
    const start = table([REBASE, SUDO])
    const played = reduce(start, {
      type: 'PLAY',
      player: 'p1',
      card: REBASE.uid,
      combo: SUDO.uid,
      at: 1000,
    })
    expect(played.state.pending).toMatchObject({
      kind: 'reorderTop',
      spent: [REBASE.uid, SUDO.uid],
    })
    const r = abandon(played.state)
    expect(r.state.pending).toBeNull()
    expect(uids(r.state.players.p1.hand).sort()).toEqual([REBASE.uid, SUDO.uid].sort())
    expect(uids(r.state.decks.discard)).not.toContain(REBASE.uid)
    expect(uids(r.state.decks.discard)).not.toContain(SUDO.uid)
    expect(r.state.decks.main).toEqual(start.decks.main)
    expect(r.events).toMatchObject([{ type: 'takenBack', player: 'p1' }])
    expect(cardsPresent(r.state).sort()).toEqual(cardsPresent(start).sort())
  })

  it('abandon returns Cherry-pick without taking anything', () => {
    const start: GameState = {
      ...table([CHERRY]),
    }
    const withDiscard: GameState = {
      ...start,
      decks: { ...start.decks, discard: [FILLER] },
    }
    const played = reduce(withDiscard, {
      type: 'PLAY',
      player: 'p1',
      card: CHERRY.uid,
      at: 1000,
    })
    expect(played.state.pending).toMatchObject({ kind: 'pickFromDiscard' })
    const r = abandon(played.state)
    expect(r.state.pending).toBeNull()
    expect(uids(r.state.players.p1.hand)).toEqual([CHERRY.uid])
    expect(r.state.decks.discard).toHaveLength(withDiscard.decks.discard.length)
    expect(cardsPresent(r.state).sort()).toEqual(cardsPresent(withDiscard).sort())
  })

  function bugStealPending() {
    const attacked = reduce(table([BUG, SPARE], [FILLER]), {
      type: 'PLAY',
      player: 'p1',
      card: BUG.uid,
      target: { kind: 'player', player: 'p2' },
      at: 1000,
    })
    const taken = reduce(attacked.state, {
      type: 'RESOLVE',
      player: 'p2',
      choice: { kind: 'defend', card: null },
      at: 1001,
    })
    return taken.state
  }

  it('abandon returns a Bug hand attack to the attacker', () => {
    const pending = bugStealPending()
    expect(pending.pending).toMatchObject({ kind: 'stealCard', player: 'p1' })
    const r = abandon(pending)
    expect(r.state.pending).toBeNull()
    expect(uids(r.state.players.p1.hand)).toContain(BUG.uid)
    expect(r.state.players.p2.hand).toEqual(pending.players.p2.hand)
    expect(r.events).toMatchObject([{ type: 'takenBack', player: 'p1', cards: [BUG.id] }])
    expect(cardsPresent(r.state).sort()).toEqual(cardsPresent(pending).sort())
  })

  it('abandon of a reflected attack returns the defender cover and spends the attack', () => {
    const attacked = reduce(table([BUG, SPARE], [WORKS]), {
      type: 'PLAY',
      player: 'p1',
      card: BUG.uid,
      target: { kind: 'player', player: 'p2' },
      at: 1000,
    })
    const reflected = reduce(attacked.state, {
      type: 'RESOLVE',
      player: 'p2',
      choice: { kind: 'defend', card: WORKS.uid },
      at: 1001,
    })
    expect(reflected.state.pending).toMatchObject({ kind: 'stealCard', player: 'p2' })
    const r = abandon(reflected.state, 'p2')
    expect(r.state.pending).toBeNull()
    expect(uids(r.state.players.p2.hand)).toEqual([WORKS.uid])
    expect(uids(r.state.decks.discard)).toContain(BUG.uid)
    expect(uids(r.state.players.p1.hand)).not.toContain(BUG.uid)
    expect(cardsPresent(r.state).sort()).toEqual(cardsPresent(reflected.state).sort())
  })

  it('abandon of a Security Bug request returns the attack and its Sudo to the attacker', () => {
    const attacked = reduce(table([SEC, SUDO, SPARE], [FILLER]), {
      type: 'PLAY',
      player: 'p1',
      card: SEC.uid,
      combo: SUDO.uid,
      target: { kind: 'player', player: 'p2' },
      at: 1000,
    })
    const requested = reduce(attacked.state, {
      type: 'RESOLVE',
      player: 'p2',
      choice: { kind: 'defend', card: null },
      at: 1001,
    })
    expect(requested.state.pending).toMatchObject({ kind: 'requestCard', player: 'p1' })
    const r = abandon(requested.state)
    expect(r.state.pending).toBeNull()
    expect(uids(r.state.players.p1.hand).sort()).toEqual([SEC.uid, SUDO.uid, SPARE.uid].sort())
    expect(r.state.players.p2.hand).toEqual(requested.state.players.p2.hand)
    expect(r.events).toMatchObject([{ type: 'takenBack', player: 'p1', cards: [SEC.id, SUDO.id] }])
    expect(cardsPresent(r.state).sort()).toEqual(cardsPresent(requested.state).sort())
  })

  it('abandon is rejected for a pending owed by someone else', () => {
    const pending = bugStealPending()
    const r = abandon(pending, 'p2')
    expect(r.state).toBe(pending)
    expect(r.events.some((e) => e.type === 'rejected')).toBe(true)
  })

  it('abandon is rejected for ai-inside pickFromDiscard', () => {
    const base = table([])
    const state: GameState = {
      ...base,
      pending: {
        kind: 'pickFromDiscard',
        player: 'p1',
        options: [FE],
        picks: 1,
        source: 'ai-inside',
        raisedAt: 1,
      },
    }
    const r = abandon(state)
    expect(r.state).toBe(state)
    expect(r.events.some((e) => e.type === 'rejected')).toBe(true)
  })

  it('abandon of a pending saved without spent clears it and returns nothing', () => {
    const base = table([])
    const state: GameState = {
      ...base,
      decks: { ...base.decks, discard: [CHERRY] },
      pending: {
        kind: 'pickFromDiscard',
        player: 'p1',
        options: [FE],
        picks: 1,
        source: 'operation-git-cherry-pick',
        raisedAt: 1,
      },
    }
    const r = abandon(state)
    expect(r.state.pending).toBeNull()
    expect(r.state.players.p1.hand).toEqual([])
    expect(uids(r.state.decks.discard)).toEqual([CHERRY.uid])
  })
})
