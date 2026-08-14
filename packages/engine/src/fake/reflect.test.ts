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
// The attacker's own Database, distinct from the one the defender ships.
const DB2 = c('release-database', 'p1')
const CR = c('support-code-review')

// p1 attacks p2's fresh release; p2 answers with Works on my Machine. The
// reflection is the subject, so p1's own zone is what each test arranges.
//
// p2 always ships a DATABASE release, so `database` is the attacked type — and
// under the ruling below that is the only slot in p1's zone a reflection can
// ever reach. The other slots are arranged to prove it never wanders.
function reflected(attack: CardInstance, attackerZone: GameState['players'][string]['release']) {
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
    choice: { kind: 'defend', card: WOMM.uid },
    at: 1200,
  })
}

// The ruling these pin (rules owner, on #92): the harder reading — the defender
// picking a slot in the attacker's zone, and a reflected Security Bug sometimes
// taking a release — is superseded. The mirror reading is the one the card
// supports without an added rule.
//
//   1. the attack is cancelled, always, sudo or not;
//   2. its effect returns AT THE TYPE IT WAS AIMED — the attacker's release of
//      exactly the type that was attacked. It lands only if the attacker holds
//      that type and it is not under Code Review; finding nothing is not the
//      same as not firing.
describe('Works on my Machine returns the attack as it was aimed (#74)', () => {
  it('falls on the attacker’s release of the attacked type', () => {
    // p2's DATABASE was attacked, so p1's database is what the mirror reaches.
    const r = reflected(c('attack-bug'), { database: { card: DB2 } })
    expect(r.state.players.p1.release.database).toBeFalsy()
  })

  it('never wanders to another type, however tempting the attacker’s zone', () => {
    // p1 holds Frontend and Backend but no Database, and Database is what was
    // attacked. Under the old reading the defender could have taken either of
    // these; under the mirror the reflection simply finds nothing.
    const r = reflected(c('attack-bug'), { frontend: { card: FE }, backend: { card: BE } })
    expect(r.state.players.p1.release.frontend).toBeTruthy()
    expect(r.state.players.p1.release.backend).toBeTruthy()
  })

  it('does not reach that release when Code Review protects it', () => {
    // resolution.md §4: a release carrying Code Review is taken only by DDoS —
    // "даже с sudo". A reflected Bug is still a Bug. Confirmed by the ruling.
    const r = reflected(c('attack-bug'), { database: { card: DB2, codeReview: CR } })
    expect(r.state.players.p1.release.database).toBeTruthy()
    expect(r.state.players.p1.release.database?.codeReview).toBeTruthy()
  })

  it('is still spent and answered when the reflection finds nothing', () => {
    // Both effects fired; the second one had no target. The attack is cancelled
    // either way, so the table moves on rather than waiting on anybody.
    const r = reflected(c('attack-bug'), {})
    expect(r.state.pending).toBeNull()
  })

  it('a reflected Security Bug can never take — it always discards', () => {
    // The reflected "take into your zone" aims at the DEFENDER's slot of the
    // attacked type, and that slot is always occupied: by the very release
    // being defended, which never left because the attack was cancelled. So it
    // goes down takeRelease's occupied-slot path, every time.
    const r = reflected(c('attack-security-bug'), { database: { card: DB2 } })

    expect(r.state.players.p1.release.database).toBeFalsy()
    // Not taken: p2 still holds the release they shipped, not the attacker's.
    expect(r.state.players.p2.release.database?.card.uid).not.toBe(DB2.uid)
    expect(r.state.decks.discard.map((x) => x.uid)).toContain(DB2.uid)
  })

  it('leaves the defended release standing — the attack was cancelled', () => {
    // The first effect, and the reason the Security Bug case above can never
    // find an empty slot to take into.
    const r = reflected(c('attack-bug'), { database: { card: DB2 } })
    expect(r.state.players.p2.release.database).toBeTruthy()
  })
})
