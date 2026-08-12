import { describe, expect, it } from 'vitest'
import type { GameConfig } from '../engine'
import type { CardInstance, GameState, ReleaseSlot, Setup } from '../state'
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

const config: GameConfig = {
  gameId: 'g1',
  seed: 4242,
  players: [
    { id: 'p1', name: 'attacker' },
    { id: 'p2', name: 'defender' },
  ],
  setup: BASE,
  deck: FAKE_DECK,
  events: FAKE_EVENTS,
}

const c = (id: string, n = '0'): CardInstance => ({ uid: `${id}#${n}`, id })
const WOMM = c('defense-works-on-my-machine')
const FE = c('release-frontend')
const BE = c('release-backend')
const DB = c('release-database')
const CR = c('support-code-review')

// p1 attacks p2's fresh release; p2 answers with Works on my Machine. The
// reflection is the subject, so p1's own zone is what each test arranges.
function reflected(
  attack: CardInstance,
  attackerZone: GameState['players'][string]['release'],
  reflectSlot?: ReleaseSlot,
) {
  const base = engine.createGame(config)
  const start: GameState = {
    ...base,
    turn: { ...base.turn, player: 'p2', drawnFrom: [0] },
    players: {
      ...base.players,
      p1: { ...base.players.p1, hand: [attack], release: attackerZone },
      p2: { ...base.players.p2, hand: [DB, WOMM], release: {} },
    },
  }
  // p2 ships a release, p1 throws the attack into the window it opens.
  const released = reduce(start, { type: 'PLAY', player: 'p2', card: DB.uid, at: 1000 })
  const thrown = reduce(released.state, {
    type: 'ATTACK',
    player: 'p1',
    card: attack.uid,
    at: 1100,
  })
  return reduce(thrown.state, {
    type: 'RESOLVE',
    player: 'p2',
    choice: { kind: 'defend', card: WOMM.uid, ...(reflectSlot ? { reflectSlot } : {}) },
    at: 1200,
  })
}

describe('Works on my Machine reflects the attack, not a different one (#74)', () => {
  it('lets the defender choose which of the attacker’s releases falls', () => {
    // "Выбор цели в зоне атакующего делает защищавшийся". The engine used to
    // take the first occupied slot in array order, which quietly made Frontend
    // the most dangerous release to own.
    const r = reflected(
      c('attack-bug'),
      { frontend: { card: FE }, backend: { card: BE } },
      'backend',
    )

    expect(r.state.players.p1.release.backend).toBeFalsy()
    expect(r.state.players.p1.release.frontend).toBeTruthy()
  })

  it('does not reach a release the attacker protected with Code Review', () => {
    // resolution.md §4: a release carrying Code Review is taken only by DDoS —
    // "даже с sudo". A reflected Bug is still a Bug.
    const r = reflected(c('attack-bug'), { frontend: { card: FE, codeReview: CR } }, 'frontend')

    expect(r.state.players.p1.release.frontend).toBeTruthy()
    expect(r.state.players.p1.release.frontend?.codeReview).toBeTruthy()
  })

  it('falls on nothing when every release the attacker holds is protected', () => {
    const r = reflected(c('attack-bug'), { frontend: { card: FE, codeReview: CR } })
    expect(r.state.players.p1.release.frontend).toBeTruthy()
    // The attack is still answered and spent — the reflection simply lands nowhere.
    expect(r.state.pending).toBeNull()
  })

  it('a reflected Security Bug is taken, not destroyed', () => {
    // "забирает его в свою зону релиза" — the effect reflected is the card's
    // own, and Security Bug's effect is to take.
    const r = reflected(c('attack-security-bug'), { frontend: { card: FE } }, 'frontend')

    expect(r.state.players.p1.release.frontend).toBeFalsy()
    expect(r.state.players.p2.release.frontend?.card.uid).toBe(FE.uid)
  })

  it('discards the taken release when the defender already holds that type', () => {
    // "если релиз того же типа у него уже стоит — выбранный уходит в сброс".
    const base = engine.createGame(config)
    const mine = c('release-frontend', 'mine')
    const start: GameState = {
      ...base,
      turn: { ...base.turn, player: 'p2', drawnFrom: [0] },
      players: {
        ...base.players,
        p1: {
          ...base.players.p1,
          hand: [c('attack-security-bug')],
          release: { frontend: { card: FE } },
        },
        p2: { ...base.players.p2, hand: [DB, WOMM], release: { frontend: { card: mine } } },
      },
    }
    const released = reduce(start, { type: 'PLAY', player: 'p2', card: DB.uid, at: 1000 })
    const thrown = reduce(released.state, {
      type: 'ATTACK',
      player: 'p1',
      card: 'attack-security-bug#0',
      at: 1100,
    })
    const r = reduce(thrown.state, {
      type: 'RESOLVE',
      player: 'p2',
      choice: { kind: 'defend', card: WOMM.uid, reflectSlot: 'frontend' },
      at: 1200,
    })

    expect(r.state.players.p1.release.frontend).toBeFalsy()
    // The defender keeps their own; the stolen one goes to the discard.
    expect(r.state.players.p2.release.frontend?.card.uid).toBe(mine.uid)
    expect(r.state.decks.discard.map((x) => x.uid)).toContain(FE.uid)
  })

  it('still reflects onto the one legal slot when the defender names none', () => {
    // Nothing to choose between, so an absent choice is not a refusal.
    const r = reflected(c('attack-bug'), { backend: { card: BE } })
    expect(r.state.players.p1.release.backend).toBeFalsy()
  })
})
