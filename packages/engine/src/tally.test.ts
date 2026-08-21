import type { Event } from './events'
import { emptyTally, foldTally, seedTally } from './tally'

// Events carry an `id`; nothing in the fold reads it, so one counter keeps the
// fixtures short without pretending the ids mean anything.
//
// `Event` is a discriminated union, so a plain `Omit<Event, 'id'>` collapses to
// the union's common members only, and excess-property checking rejects every
// fixture literal below. A distributive omit (applied member-by-member) keeps
// each branch's own fields intact — same idiom as apps/frontend/src/network/types.ts.
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

let seq = 0
const ev = (e: DistributiveOmit<Event, 'id'>): Event => {
  seq += 1
  return { ...e, id: seq } as Event
}

const base = () => seedTally(['p1', 'p2'])

it('seeds every seat at zero', () => {
  expect(seedTally(['p1', 'p2'])).toEqual({ p1: emptyTally(), p2: emptyTally() })
})

it('counts an attack against its attacker, whatever it was thrown at', () => {
  const out = foldTally(base(), [
    ev({ type: 'attacked', attacker: 'p1', card: 'attack-bug', sudo: false, target: 'p2' }),
    ev({ type: 'attacked', attacker: 'p1', card: 'attack-ddos', sudo: false, target: 'p2' }),
  ])
  expect(out.p1.attack).toBe(2)
  expect(out.p2.attack).toBe(0)
})

it('counts DDoS as both an attack and a DDoS', () => {
  const out = foldTally(base(), [
    ev({ type: 'attacked', attacker: 'p1', card: 'attack-ddos', sudo: false, target: 'p2' }),
  ])
  expect(out.p1).toMatchObject({ attack: 1, ddos: 1 })
})

it('counts a defence against the defender', () => {
  const out = foldTally(base(), [
    ev({ type: 'defended', player: 'p2', card: 'defense-hotfix', effect: 'cancel' }),
  ])
  expect(out.p2.defense).toBe(1)
})

it('counts an AI reveal against the seat that drew it', () => {
  const out = foldTally(base(), [
    ev({ type: 'aiRevealed', player: 'p1', aiCard: 'ai-inside', eventCard: 'ai-inside' }),
  ])
  expect(out.p1.ai).toBe(1)
})

it('counts both 503s — the draw-deck trigger and the AI card of the same name', () => {
  // They are the same thing to the player who turned one up, whichever deck it
  // came off (design decision, PR #122).
  const out = foldTally(base(), [
    ev({ type: 'revealed', player: 'p1', card: 'trigger-error-503' }),
    ev({ type: 'revealed', player: 'p1', card: 'ai-error-503' }),
  ])
  expect(out.p1.err503).toBe(2)
})

it('counts a 503 as an attack against the player who turned it up', () => {
  // The game attacked them, which from their side is the same fact `attacked`
  // records for a player-thrown card.
  const out = foldTally(base(), [ev({ type: 'revealed', player: 'p1', card: 'trigger-error-503' })])
  expect(out.p1).toMatchObject({ err503: 1, attackedInto: 1 })
})

it('raises three counters for one AI draw that turns up a 503', () => {
  // Three different true facts about one moment: an AI card came out of the
  // deck, it was a 503, and the game attacked that player. The overlap is
  // intended, not double-counting.
  const out = foldTally(base(), [
    ev({ type: 'aiRevealed', player: 'p1', aiCard: 'ai-error-503', eventCard: 'ai-error-503' }),
    ev({ type: 'revealed', player: 'p1', card: 'ai-error-503' }),
  ])
  expect(out.p1).toMatchObject({ ai: 1, err503: 1, attackedInto: 1 })
})

it('does not count an ordinary reveal as a 503 or an attack', () => {
  const out = foldTally(base(), [ev({ type: 'revealed', player: 'p1', card: 'attack-bug' })])
  expect(out.p1).toMatchObject({ err503: 0, attackedInto: 0 })
})

it('counts a cherry-pick once per play, not once per card pulled', () => {
  // One Git Cherry-pick emits two events: the card taken to hand (public) and
  // the card slid onto the deck (private to the player). Counting both would
  // double every pull, and counting the private one would make the number
  // unverifiable from any other peer's log.
  const out = foldTally(base(), [
    ev({ type: 'takenFromDiscard', player: 'p1', card: 'attack-bug', to: 'hand' }),
    ev({ type: 'takenFromDiscard', player: 'p1', card: 'defense-hotfix', to: 'deck' }),
  ])
  expect(out.p1.cherryPick).toBe(1)
})

it('counts an attack against the seat it was aimed at, landed or not', () => {
  // A Bug thrown at me is one attack against me whether I defended it or not —
  // whether it got through is what the defence column already says (design
  // decision, PR #122). `tookHit` is no longer what this metric reads.
  const out = foldTally(base(), [
    ev({ type: 'attacked', attacker: 'p1', card: 'attack-bug', sudo: false, target: 'p2' }),
    ev({ type: 'defended', player: 'p2', card: 'defense-hotfix', effect: 'cancel' }),
  ])
  expect(out.p2).toMatchObject({ attackedInto: 1, defense: 1 })
})

it('does not count a landing as a second attack', () => {
  // `tookHit` follows an `attacked` that was already counted; reading both
  // would double every attack that got through.
  const out = foldTally(base(), [
    ev({ type: 'attacked', attacker: 'p1', card: 'attack-bug', sudo: false, target: 'p2' }),
    ev({ type: 'tookHit', player: 'p2' }),
  ])
  expect(out.p2.attackedInto).toBe(1)
})

it('ignores events no metric asks about', () => {
  const before = base()
  const out = foldTally(before, [
    ev({ type: 'passed', player: 'p1' }),
    ev({ type: 'turnEnded', player: 'p1' }),
  ])
  expect(out).toBe(before)
})

it('does not mutate the tally it was handed', () => {
  const before = base()
  const snapshot = structuredClone(before)
  foldTally(before, [
    ev({ type: 'attacked', attacker: 'p1', card: 'attack-bug', sudo: false, target: 'p2' }),
  ])
  expect(before).toEqual(snapshot)
})

it('accumulates across successive folds', () => {
  const hit = () =>
    ev({ type: 'attacked', attacker: 'p1', card: 'attack-bug', sudo: false, target: 'p2' })
  const one = foldTally(base(), [hit()])
  const two = foldTally(one, [hit()])
  expect(two.p2.attackedInto).toBe(2)
})

it('counts a seat the seed never named', () => {
  // Defensive rather than reachable: seating is fixed at createGame. If a future
  // engine ever emits for an unseeded id, the fold must not throw on undefined.
  const out = foldTally({}, [
    ev({ type: 'attacked', attacker: 'p1', card: 'attack-bug', sudo: false, target: 'p9' }),
  ])
  expect(out.p9.attackedInto).toBe(1)
})
