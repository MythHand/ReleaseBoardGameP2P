import type { GameConfig } from '../engine'
import type { CardInstance, GameState, Setup } from '../state'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from './index'
import { reduce } from './reduce'
import { WINDOW_NEXT_MS } from './window'

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

const FE: CardInstance = { uid: 'release-frontend#0', id: 'release-frontend' }
const BUG: CardInstance = { uid: 'attack-bug#0', id: 'attack-bug' }
const SEC: CardInstance = { uid: 'attack-security-bug#0', id: 'attack-security-bug' }
const SUDO: CardInstance = { uid: 'support-sudo#0', id: 'support-sudo' }
const HOTFIX: CardInstance = { uid: 'defense-hotfix#0', id: 'defense-hotfix' }
const NOTABUG: CardInstance = { uid: 'defense-not-a-bug#0', id: 'defense-not-a-bug' }
const ROLLBACK: CardInstance = { uid: 'defense-rollback#0', id: 'defense-rollback' }
const WOMM: CardInstance = {
  uid: 'defense-works-on-my-machine#0',
  id: 'defense-works-on-my-machine',
}

// p1 releases Frontend; p1 then holds `defence`, p2 holds `attack`.
const staged = (attack: CardInstance[], defence: CardInstance[]): GameState => {
  const s = engine.createGame(config())
  const primed: GameState = {
    ...s,
    players: {
      ...s.players,
      p1: { ...s.players.p1, hand: [FE, ...defence] },
      p2: { ...s.players.p2, hand: attack },
    },
  }
  return reduce(primed, { type: 'PLAY', player: 'p1', card: FE.uid, at: 1000 }).state
}

it('turns an attack into a defence decision for the release owner', () => {
  const r = reduce(staged([BUG], [HOTFIX]), {
    type: 'ATTACK',
    player: 'p2',
    card: BUG.uid,
    at: 1001,
  })
  expect(r.state.pending).toMatchObject({
    kind: 'defend',
    player: 'p1',
    attacker: 'p2',
    attack: BUG.uid,
    sudo: false,
    canDefendWith: [HOTFIX.uid],
  })
  expect(r.events.map((e) => e.type)).toEqual(['attacked'])
})

it('destroys the release when the owner takes the hit', () => {
  const attacked = reduce(staged([BUG], []), {
    type: 'ATTACK',
    player: 'p2',
    card: BUG.uid,
    at: 1001,
  })
  const r = reduce(attacked.state, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'defend', card: null },
    at: 1002,
  })
  expect(r.state.players.p1.release.frontend).toBeUndefined()
  expect(r.state.window).toBeNull()
  expect(r.state.decks.discard.map((c) => c.uid)).toContain(FE.uid)
  expect(r.events.map((e) => e.type)).toEqual(['tookHit', 'releaseDestroyed', 'windowClosed'])
})

it('reopens the window a round later when the attack is cancelled', () => {
  const attacked = reduce(staged([BUG], [HOTFIX]), {
    type: 'ATTACK',
    player: 'p2',
    card: BUG.uid,
    at: 1001,
  })
  const r = reduce(attacked.state, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'defend', card: HOTFIX.uid },
    at: 1002,
  })
  expect(r.state.players.p1.release.frontend?.card).toEqual(FE)
  expect(r.state.window).toMatchObject({ round: 2, deadline: 1002 + WINDOW_NEXT_MS, passed: [] })
  expect(r.state.decks.discard.map((c) => c.uid)).toEqual([BUG.uid, HOTFIX.uid])
})

it('denies a Cancel defence against a sudo attack but allows a Unicorn', () => {
  const withSudo = staged([BUG, SUDO], [HOTFIX, NOTABUG])
  const attacked = reduce(withSudo, {
    type: 'ATTACK',
    player: 'p2',
    card: BUG.uid,
    combo: SUDO.uid,
    at: 1001,
  })
  expect(attacked.state.pending).toMatchObject({ sudo: true, canDefendWith: [NOTABUG.uid] })

  const refused = reduce(attacked.state, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'defend', card: HOTFIX.uid },
    at: 1002,
  })
  expect(refused.state).toBe(attacked.state)
  expect(refused.events[0].type).toBe('rejected')

  const held = reduce(attacked.state, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'defend', card: NOTABUG.uid },
    at: 1002,
  })
  expect(held.state.players.p1.release.frontend?.card).toEqual(FE)
})

it('returns the attack to the attacker’s hand on Rollback', () => {
  const attacked = reduce(staged([BUG], [ROLLBACK]), {
    type: 'ATTACK',
    player: 'p2',
    card: BUG.uid,
    at: 1001,
  })
  const r = reduce(attacked.state, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'defend', card: ROLLBACK.uid },
    at: 1002,
  })
  expect(r.state.players.p2.hand.map((c) => c.uid)).toEqual([BUG.uid])
  expect(r.state.decks.discard.map((c) => c.uid)).toEqual([ROLLBACK.uid])
})

it('gives the attack to the defender on sudo Rollback', () => {
  const attacked = reduce(staged([BUG], [ROLLBACK, SUDO]), {
    type: 'ATTACK',
    player: 'p2',
    card: BUG.uid,
    at: 1001,
  })
  const r = reduce(attacked.state, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'defend', card: ROLLBACK.uid, combo: SUDO.uid },
    at: 1002,
  })
  expect(r.state.players.p1.hand.map((c) => c.uid)).toContain(BUG.uid)
})

it('reflects the effect onto the attacker with Works on my Machine', () => {
  const s = staged([BUG], [WOMM])
  const withAttackerRelease: GameState = {
    ...s,
    players: {
      ...s.players,
      p2: {
        ...s.players.p2,
        release: { backend: { card: { uid: 'release-backend#0', id: 'release-backend' } } },
      },
    },
  }
  const attacked = reduce(withAttackerRelease, {
    type: 'ATTACK',
    player: 'p2',
    card: BUG.uid,
    at: 1001,
  })
  const r = reduce(attacked.state, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'defend', card: WOMM.uid },
    at: 1002,
  })
  expect(r.state.players.p1.release.frontend?.card).toEqual(FE)
  expect(r.state.players.p2.release.backend).toBeUndefined()
  expect(r.events.some((e) => e.type === 'defended' && e.effect === 'reflect')).toBe(true)
})

it('steals the release into the attacker’s zone with Security Bug', () => {
  const attacked = reduce(staged([SEC], []), {
    type: 'ATTACK',
    player: 'p2',
    card: SEC.uid,
    at: 1001,
  })
  const r = reduce(attacked.state, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'defend', card: null },
    at: 1002,
  })
  expect(r.state.players.p1.release.frontend).toBeUndefined()
  expect(r.state.players.p2.release.frontend?.card).toEqual(FE)
  expect(r.events.some((e) => e.type === 'releaseStolen')).toBe(true)
})

it('rejects an attack from someone who cannot respond', () => {
  const s = staged([BUG], [])
  expect(reduce(s, { type: 'ATTACK', player: 'p1', card: BUG.uid, at: 1001 }).events[0].type).toBe(
    'rejected',
  )
})

it('projects the defence prompt only to the player who owes it', () => {
  const attacked = reduce(staged([BUG], [HOTFIX]), {
    type: 'ATTACK',
    player: 'p2',
    card: BUG.uid,
    at: 1001,
  }).state
  expect(engine.project(attacked, 'p1').pending).toMatchObject({
    kind: 'defend',
    options: [HOTFIX.uid],
    attackCard: 'attack-bug',
  })
  // p2 learns a decision is outstanding but never sees p1's options.
  const other = engine.project(attacked, 'p2').pending
  expect(other?.kind).toBe('defend')
  expect(other && 'options' in other && other.options).toEqual([])
})
