import type { Event } from './events'
import type { PlayerId } from './state'

// What the results screen counts, per seat. Every field is a plain occurrence
// count over the event log — see foldTally for the event each one reads.
export interface PlayerTally {
  attack: number
  defense: number
  ddos: number
  ai: number
  // Both 503s — the draw-deck trigger and the AI card of the same name.
  err503: number
  cherryPick: number
  // Attacks MADE against this seat, landed or not, plus a 503 out of the deck.
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
// The three metrics whose copy did not pin an event were settled by the design
// side in PR #122 and are no longer open: `cherryPick` counts plays, and both
// `attackedInto` and `err503` are recorded at their case below.
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
        // Every attack MADE against a player, not only the ones that got
        // through: a Bug thrown at me is one attack against me whether I
        // defended it or not, and whether it landed is what the defence column
        // already says. `attacked` carries its target, so no new event is owed.
        bump(e.target, 'attackedInto')
        break
      case 'defended':
        bump(e.player, 'defense')
        break
      case 'aiRevealed':
        bump(e.player, 'ai')
        break
      // Both 503s: the draw-deck trigger and the AI card off the events deck
      // (fake/triggers.ts) are the same thing to the player who turned one up.
      // A 503 also counts as an attack against that player — the game attacked
      // them, which from their side is the same event the case above records.
      //
      // So one draw of an AI card that turns up a 503 raises three counters:
      // `ai` (an AI card came out of the deck), `err503` (it was a 503), and
      // `attackedInto` (the game attacked that player). Three different true
      // facts about one moment, and the overlap is intended.
      case 'revealed':
        if (e.card === 'trigger-error-503' || e.card === 'ai-error-503') {
          bump(e.player, 'err503')
          bump(e.player, 'attackedInto')
        }
        break
      // Times played, not cards pulled: this counts the card that came to hand,
      // which is also the public half — the `to: 'deck'` half is visibleTo the
      // player alone, so counting it would put a number on the screen no other
      // peer could ever verify.
      case 'takenFromDiscard':
        if (e.to === 'hand') bump(e.player, 'cherryPick')
        break
      default:
        break
    }
  }

  // Identity is preserved when nothing counted, so a reduction that touched no
  // metric leaves `state.tally` the very object it was handed.
  return counted ? next : prev
}
