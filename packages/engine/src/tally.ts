import type { Event } from './events'
import type { PlayerId } from './state'

// What the results screen counts, per seat. Every field is a plain occurrence
// count over the event log — see foldTally for the event each one reads.
export interface PlayerTally {
  attack: number
  defense: number
  ddos: number
  ai: number
  err503: number
  cherryPick: number
  attackedInto: number
}

export type Tallies = Record<PlayerId, PlayerTally>

export const emptyTally = (): PlayerTally => ({
  attack: 0,
  defense: 0,
  ddos: 0,
  ai: 0,
  err503: 0,
  cherryPick: 0,
  attackedInto: 0,
})

export function seedTally(seating: PlayerId[]): Tallies {
  const out: Tallies = {}
  for (const id of seating) out[id] = emptyTally()
  return out
}

// The whole tally, in one place, reading nothing but the log. Counting inside
// the rules code instead would scatter seven counters across five modules, and
// every future rules change would be a chance for one of them to quietly stop
// counting. Here the rule is single and checkable: if the event was emitted, it
// was counted.
//
// Three of the seven are defaults over copy that does not pin an event — see
// "Open questions" in the design. Each is one line to change.
export function foldTally(prev: Tallies, events: Event[]): Tallies {
  const next: Tallies = { ...prev }
  let counted = false

  const bump = (player: PlayerId, key: keyof PlayerTally) => {
    counted = true
    const current = next[player] ?? emptyTally()
    next[player] = { ...current, [key]: current[key] + 1 }
  }

  for (const e of events) {
    switch (e.type) {
      // Release attacks and hand attacks emit the same event (fake/handAttacks.ts),
      // so both scopes count with no special case. `requested` is the
      // request-a-card mechanic, not an attack card, and is not counted.
      case 'attacked':
        bump(e.attacker, 'attack')
        if (e.card === 'attack-ddos') bump(e.attacker, 'ddos')
        break
      case 'defended':
        bump(e.player, 'defense')
        break
      case 'aiRevealed':
        bump(e.player, 'ai')
        break
      // `revealed` also fires for the AI card ai-error-503 off the events deck
      // (fake/triggers.ts). Default: the draw-deck trigger only.
      case 'revealed':
        if (e.card === 'trigger-error-503') bump(e.player, 'err503')
        break
      // Default: times played, not cards pulled. The `to: 'deck'` half of a
      // cherry-pick is visibleTo the player alone, so counting it would put a
      // number on the screen no other peer could ever verify.
      case 'takenFromDiscard':
        if (e.to === 'hand') bump(e.player, 'cherryPick')
        break
      // Default: attacks that landed, not attacks aimed.
      case 'tookHit':
        bump(e.player, 'attackedInto')
        break
      default:
        break
    }
  }

  // Identity is preserved when nothing counted, so a reduction that touched no
  // metric leaves `state.tally` the very object it was handed.
  return counted ? next : prev
}
