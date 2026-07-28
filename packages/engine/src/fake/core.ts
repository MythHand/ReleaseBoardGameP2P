import type { Action } from '../actions'
import type { Reduction } from '../engine'
import type { Event } from '../events'
import type { GameState, PlayerId, PlayerState } from '../state'

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
