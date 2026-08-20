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

it('counts only the Error 503 trigger, not the AI card of the same name', () => {
  const out = foldTally(base(), [
    ev({ type: 'revealed', player: 'p1', card: 'trigger-error-503' }),
    ev({ type: 'revealed', player: 'p1', card: 'ai-error-503' }),
  ])
  expect(out.p1.err503).toBe(1)
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

it('counts a landed attack against the seat that took it', () => {
  const out = foldTally(base(), [ev({ type: 'tookHit', player: 'p2' })])
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
  const one = foldTally(base(), [ev({ type: 'tookHit', player: 'p2' })])
  const two = foldTally(one, [ev({ type: 'tookHit', player: 'p2' })])
  expect(two.p2.attackedInto).toBe(2)
})

it('counts a seat the seed never named', () => {
  // Defensive rather than reachable: seating is fixed at createGame. If a future
  // engine ever emits for an unseeded id, the fold must not throw on undefined.
  const out = foldTally({}, [ev({ type: 'tookHit', player: 'p9' })])
  expect(out.p9.attackedInto).toBe(1)
})
