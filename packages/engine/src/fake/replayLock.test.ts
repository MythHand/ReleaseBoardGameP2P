import { describe, expect, it } from 'vitest'
import type { GameConfig } from '../engine'
import type { CardInstance, GameState, Setup } from '../state'
import { setHand } from './core'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from './index'
import { reduce } from './reduce'
import { canAttackWith } from './window'

const engine = createFakeEngine()

const BASE: Setup = {
  handLimit: 'base',
  releases: 'base',
  releaseCond: 'easy',
  ai: 'base',
  gitBranch: 'base',
}

const config: GameConfig = {
  gameId: 'g1',
  seed: 4242,
  players: [
    { id: 'p1', name: 'you' },
    { id: 'p2', name: 'kernel_panic' },
  ],
  setup: BASE,
  deck: FAKE_DECK,
  events: FAKE_EVENTS,
}

const DB: CardInstance = { uid: 'release-database#0', id: 'release-database' }
const BUG: CardInstance = { uid: 'attack-bug#0', id: 'attack-bug' }
const ROLLBACK: CardInstance = { uid: 'defense-rollback#0', id: 'defense-rollback' }

// p2 ships a release; p1 throws Bug into the window it opens; p2 answers with
// Rollback, which hands the Bug back. That return is the whole subject: the
// rules let the attacker have the card back but not use it again this turn.
function bugRolledBack(extraP1: CardInstance[] = []) {
  const base = engine.createGame(config)
  const start: GameState = {
    ...base,
    turn: { ...base.turn, player: 'p2', hasDrawn: true },
    players: {
      ...base.players,
      p1: { ...base.players.p1, hand: [BUG, ...extraP1] },
      p2: { ...base.players.p2, hand: [DB, ROLLBACK] },
    },
  }
  const released = reduce(start, { type: 'PLAY', player: 'p2', card: DB.uid, at: 1000 })
  const thrown = reduce(released.state, {
    type: 'ATTACK',
    player: 'p1',
    card: BUG.uid,
    at: 1100,
  })
  return reduce(thrown.state, {
    type: 'RESOLVE',
    player: 'p2',
    choice: { kind: 'defend', card: ROLLBACK.uid },
    at: 1200,
  })
}

describe("Rollback's replay lock (#68)", () => {
  it('hands the attack back but bars it from the reopened window', () => {
    // The window reopens at round + 1 straight after a Rollback, so without a
    // lock the attacker simply throws the same card again — one Bug drains
    // every Rollback the defender holds. "он не может сыграть её повторно до
    // своего следующего хода".
    const r = bugRolledBack()

    expect(r.state.players.p1.hand.map((c) => c.uid)).toContain(BUG.uid)
    expect(r.state.window).toBeTruthy()
    expect(canAttackWith(r.state, 'p1')).not.toContain(BUG.uid)
  })

  it('rejects the re-throw itself, not just the offer', () => {
    const r = bugRolledBack()
    const again = reduce(r.state, { type: 'ATTACK', player: 'p1', card: BUG.uid, at: 1300 })
    expect(again.events.some((e) => e.type === 'rejected')).toBe(true)
  })

  it('bars playing it from hand as well', () => {
    const r = bugRolledBack()
    expect(engine.project(r.state, 'p1').self.playable).not.toContain(BUG.uid)
  })

  it('frees it again on the attacker’s own next turn, not the one after', () => {
    // The lock lifts as their next turn *begins* — "до своего следующего хода"
    // means playable on it. A DDoS freeze reads differently ("не может быть
    // разыграна в следующем ходу") and costs the whole turn, which is why the
    // two cannot share one thaw.
    const rolled = bugRolledBack()
    const closed = reduce(rolled.state, {
      type: 'WINDOW_EXPIRED',
      at: (rolled.state.window?.deadline ?? 2000) + 1,
    })
    // p2 finishes the turn they were taking; p1's own turn starts.
    const pushed = reduce(closed.state, { type: 'PUSH', player: 'p2', at: 3000 })

    expect(pushed.state.turn.player).toBe('p1')
    expect(engine.project(pushed.state, 'p1').self.playable).toContain(BUG.uid)
  })

  it('leaves a sudo Rollback alone, which keeps the card rather than returning it', () => {
    // With sudo the defender keeps the attack. Nothing was handed back, so
    // there is no replay to bar — and locking the new owner would be inventing
    // a rule the card does not carry.
    const base = engine.createGame(config)
    const sudo: CardInstance = { uid: 'support-sudo#0', id: 'support-sudo' }
    const start: GameState = {
      ...base,
      turn: { ...base.turn, player: 'p2', hasDrawn: true },
      players: {
        ...base.players,
        p1: { ...base.players.p1, hand: [BUG] },
        p2: { ...base.players.p2, hand: [DB, ROLLBACK, sudo] },
      },
    }
    const released = reduce(start, { type: 'PLAY', player: 'p2', card: DB.uid, at: 1000 })
    const thrown = reduce(released.state, {
      type: 'ATTACK',
      player: 'p1',
      card: BUG.uid,
      at: 1100,
    })
    const defended = reduce(thrown.state, {
      type: 'RESOLVE',
      player: 'p2',
      choice: { kind: 'defend', card: ROLLBACK.uid, combo: sudo.uid },
      at: 1200,
    })

    expect(defended.state.players.p2.hand.map((x) => x.uid)).toContain(BUG.uid)
    expect(defended.state.players.p2.replayLocked).toEqual([])
  })
})

describe('a lock follows its card out of the hand (#80)', () => {
  it('drops a frozen uid when the card is no longer held', () => {
    // `frozen` is projected. A uid left behind after the card moved on hands
    // its former owner the identity of a card now in someone else's hand —
    // the projection leaking exactly what it exists to hide.
    const base = engine.createGame(config)
    const kept: CardInstance = { uid: 'attack-bug#keep', id: 'attack-bug' }
    const gone: CardInstance = { uid: 'release-frontend#gone', id: 'release-frontend' }
    const withLocks: GameState = {
      ...base,
      players: {
        ...base.players,
        p1: {
          ...base.players.p1,
          hand: [kept, gone],
          frozen: [gone.uid],
          replayLocked: [kept.uid],
        },
      },
    }

    // The card leaves the hand — stolen, given, played, it makes no difference.
    const after = setHand(withLocks, 'p1', [kept])

    expect(after.players.p1.frozen).toEqual([])
    // The card still held keeps its lock.
    expect(after.players.p1.replayLocked).toEqual([kept.uid])
  })
})
