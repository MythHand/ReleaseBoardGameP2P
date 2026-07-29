import type { GameConfig } from '../engine'
import type { CardInstance, GameState, Setup } from '../state'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from './index'
import { reduce } from './reduce'

const engine = createFakeEngine()

const EASY: Setup = {
  handLimit: 'base',
  releases: 'base',
  releaseCond: 'easy',
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
  setup: EASY,
  deck: FAKE_DECK,
  events: FAKE_EVENTS,
})

const BUG: CardInstance = { uid: 'attack-bug#0', id: 'attack-bug' }
const SEC: CardInstance = { uid: 'attack-security-bug#0', id: 'attack-security-bug' }
const DDOS: CardInstance = { uid: 'attack-ddos#0', id: 'attack-ddos' }
const MON: CardInstance = { uid: 'protection-monitoring#0', id: 'protection-monitoring' }
const FE: CardInstance = { uid: 'release-frontend#0', id: 'release-frontend' }
const CR: CardInstance = { uid: 'support-code-review#0', id: 'support-code-review' }
const HOTFIX: CardInstance = { uid: 'defense-hotfix#0', id: 'defense-hotfix' }

const table = (p1: CardInstance[], p2: CardInstance[]): GameState => {
  const s = engine.createGame(config())
  return {
    ...s,
    players: {
      ...s.players,
      p1: { ...s.players.p1, hand: p1 },
      p2: { ...s.players.p2, hand: p2 },
    },
  }
}

it('opens a hand-scoped defence when Bug targets a player', () => {
  const r = reduce(table([BUG], [HOTFIX]), {
    type: 'PLAY',
    player: 'p1',
    card: BUG.uid,
    target: { kind: 'player', player: 'p2' },
    at: 1000,
  })
  expect(r.state.pending).toMatchObject({ kind: 'defend', player: 'p2', scope: 'hand' })
  expect(r.state.window).toBeNull()
})

it('steals one card when the hand attack is taken', () => {
  const victim: CardInstance = { uid: 'support-sudo#0', id: 'support-sudo' }
  const attacked = reduce(table([BUG], [victim]), {
    type: 'PLAY',
    player: 'p1',
    card: BUG.uid,
    target: { kind: 'player', player: 'p2' },
    at: 1000,
  })
  const r = reduce(attacked.state, {
    type: 'RESOLVE',
    player: 'p2',
    choice: { kind: 'defend', card: null },
    at: 1001,
  })
  expect(r.state.players.p2.hand).toEqual([])
  expect(r.state.players.p1.hand.map((c) => c.uid)).toEqual([victim.uid])
  // The identity of a stolen card is private to the two parties.
  const transfer = r.events.find((e) => e.type === 'handTransfer')
  expect(transfer?.visibleTo?.sort()).toEqual(['p1', 'p2'])
})

it('leaves the hand intact when the attack is cancelled', () => {
  // A spare card beyond the defence itself: if a cancelled attack still stole,
  // this is the card that would go missing — a single-card hand would empty
  // out either way and hide that failure.
  const spare: CardInstance = { uid: 'support-sudo#0', id: 'support-sudo' }
  const attacked = reduce(table([BUG], [HOTFIX, spare]), {
    type: 'PLAY',
    player: 'p1',
    card: BUG.uid,
    target: { kind: 'player', player: 'p2' },
    at: 1000,
  })
  const r = reduce(attacked.state, {
    type: 'RESOLVE',
    player: 'p2',
    choice: { kind: 'defend', card: HOTFIX.uid },
    at: 1001,
  })
  expect(r.state.players.p2.hand).toEqual([spare])
  expect(r.state.players.p1.hand).toEqual([])
  expect(r.state.window).toBeNull()
})

it('asks Security Bug for a card type, and misses when it is absent', () => {
  const attacked = reduce(table([SEC], []), {
    type: 'PLAY',
    player: 'p1',
    card: SEC.uid,
    target: { kind: 'player', player: 'p2' },
    at: 1000,
  })
  const taken = reduce(attacked.state, {
    type: 'RESOLVE',
    player: 'p2',
    choice: { kind: 'defend', card: null },
    at: 1001,
  })
  expect(taken.state.pending).toMatchObject({ kind: 'requestCard', player: 'p1', target: 'p2' })

  const r = reduce(taken.state, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'requestCard', card: 'support-sudo' },
    at: 1002,
  })
  expect(r.state.pending).toBeNull()
  expect(r.events.some((e) => e.type === 'requested' && e.hit === false)).toBe(true)
})

it('destroys a Monitoring with DDoS', () => {
  const s = table([DDOS], [])
  const guarded: GameState = {
    ...s,
    players: { ...s.players, p2: { ...s.players.p2, release: { monitoring: MON } } },
  }
  const r = reduce(guarded, {
    type: 'PLAY',
    player: 'p1',
    card: DDOS.uid,
    target: { kind: 'monitoring', player: 'p2' },
    at: 1000,
  })
  expect(r.state.players.p2.release.monitoring).toBeUndefined()
  expect(r.state.decks.discard.map((c) => c.uid)).toContain(MON.uid)
})

it('returns a protected release to hand and freezes it', () => {
  const s = table([DDOS], [])
  const guarded: GameState = {
    ...s,
    players: {
      ...s.players,
      p2: { ...s.players.p2, release: { frontend: { card: FE, codeReview: CR } } },
    },
  }
  const r = reduce(guarded, {
    type: 'PLAY',
    player: 'p1',
    card: DDOS.uid,
    target: { kind: 'release', player: 'p2', slot: 'frontend' },
    at: 1000,
  })
  expect(r.state.players.p2.release.frontend).toBeUndefined()
  expect(r.state.players.p2.hand.map((c) => c.uid)).toEqual([FE.uid])
  expect(r.state.players.p2.frozen).toEqual([FE.uid])
  // Code Review is discarded rather than returned with it.
  expect(r.state.decks.discard.map((c) => c.uid)).toContain(CR.uid)
})

it('thaws a frozen card when its owner’s next turn ends', () => {
  const s = table([], [])
  const frozen: GameState = {
    ...s,
    players: { ...s.players, p1: { ...s.players.p1, frozen: [FE.uid], hand: [FE] } },
    turn: { player: 'p1', index: 0, hasDrawn: true, releasesPlayed: 0 },
  }
  const r = reduce(frozen, { type: 'PUSH', player: 'p1', at: 1000 })
  expect(r.state.players.p1.frozen).toEqual([])
})
