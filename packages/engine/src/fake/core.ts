import type { Action, Target } from '../actions'
import { rulesFor } from '../cards'
import type { Reduction } from '../engine'
import type { Event } from '../events'
import type { CardId, CardUid, GameState, PlayerId, PlayerState } from '../state'

// Omit over a union collapses to the shared keys, so distribute it first —
// otherwise an event input loses every variant-specific field.
type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never
export type EventInput = DistributiveOmit<Event, 'id' | 'parent'>

// Allocates event ids from the state's counter and records the causal parent, so
// the frontend can build MoveHistory's tree without inferring grouping.
export function createLog(start: number) {
  let seq = start
  const events: Event[] = []
  return {
    events,
    add(input: EventInput, parent?: number): number {
      seq += 1
      events.push({ ...input, id: seq, ...(parent === undefined ? {} : { parent }) } as Event)
      return seq
    },
    get seq() {
      return seq
    },
  }
}

export type Log = ReturnType<typeof createLog>

export function reject(state: GameState, action: Action, reason: string): Reduction {
  const log = createLog(state.eventSeq)
  log.add({ type: 'rejected', action, reason })
  // The state reference is deliberately unchanged — callers assert on identity.
  return { state, events: log.events }
}

export const setHand = (state: GameState, id: PlayerId, hand: PlayerState['hand']): GameState => ({
  ...state,
  players: { ...state.players, [id]: { ...state.players[id], hand } },
})

// The TS Action type does not survive JSON deserialization, so an action from a
// remote peer may be any shape at all. Validating once at the entry point means
// every handler can destructure freely, and no later handler can reopen the hole.
export function isWellFormedAction(action: unknown): action is Action {
  if (typeof action !== 'object' || action === null) return false
  const a = action as { type?: unknown; choice?: unknown }
  if (typeof a.type !== 'string') return false
  if (a.type !== 'RESOLVE') return true
  return (
    typeof a.choice === 'object' &&
    a.choice !== null &&
    typeof (a.choice as { kind?: unknown }).kind === 'string'
  )
}

// A stalled defence blocks everyone, so it carries a deadline like the window.
export const DEFEND_MS = 15_000

// Cancel-type defences fail against a sudo attack; Unicorn-type never do.
// Lives here rather than in attacks.ts or handAttacks.ts, both of which need it
// and would otherwise import each other — see this module's own note above
// about being the place that prevents an import cycle.
export function defencesFor(state: GameState, player: PlayerId, sudo: boolean): CardUid[] {
  return state.players[player].hand
    .filter((c) => {
      const kind = rulesFor(c.id)?.kind
      return kind === 'unicorn' || (kind === 'cancel' && !sudo)
    })
    .map((c) => c.uid)
}

// Where an attack card can land right now. Shared by reduce.ts's `legalTargets`,
// project.ts's `playableFor` (as a non-empty check) and release.ts's `onPlay`
// (to validate a chosen target) — those three would otherwise need to import
// from one another to share this, and at least one direction always cycles.
export function attackTargets(state: GameState, actor: PlayerId, cardId: CardId): Target[] {
  const others = state.seating.filter((id) => id !== actor && !state.eliminated.includes(id))

  // DDoS does not touch a bare release or a hand: it destroys a Monitoring or
  // returns a release (protected or not) to its owner's hand.
  if (cardId === 'attack-ddos') {
    const targets: Target[] = []
    for (const id of others) {
      if (state.players[id].release.monitoring) targets.push({ kind: 'monitoring', player: id })
      for (const slot of ['frontend', 'backend', 'database'] as const) {
        if (state.players[id].release[slot]) targets.push({ kind: 'release', player: id, slot })
      }
    }
    return targets
  }

  // The other attacks, played on your own turn, take from a hand.
  return others.map((id) => ({ kind: 'player', player: id }) as Target)
}
