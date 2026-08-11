import type { Action, Target } from '../actions'
import { rulesFor } from '../cards'
import type { Reduction } from '../engine'
import type { Event } from '../events'
import type {
  CardId,
  CardInstance,
  CardUid,
  GameState,
  PlayerId,
  PlayerState,
  ReleaseSlot,
  Setup,
} from '../state'

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

// Both locks name cards in a hand, so a card that leaves the hand takes its
// lock with it (#80). Left behind, a stale uid is not merely untidy: `frozen`
// is projected, so it hands its former owner the identity of a card now sitting
// in someone else's hand — a leak of exactly the kind the projection exists to
// prevent. Pruning here rather than at each mover means no future path that
// moves a card can forget.
export const setHand = (state: GameState, id: PlayerId, hand: PlayerState['hand']): GameState => {
  const held = new Set(hand.map((c) => c.uid))
  const me = state.players[id]
  return {
    ...state,
    players: {
      ...state.players,
      [id]: {
        ...me,
        hand,
        frozen: me.frozen.filter((uid) => held.has(uid)),
        replayLocked: me.replayLocked.filter((uid) => held.has(uid)),
      },
    },
  }
}

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

const HAND_LIMITS: Record<string, number> = { '8bit': 8, memory: 5 }

export function handLimitFor(setup: Setup): number {
  return HAND_LIMITS[setup.handLimit] ?? Number.POSITIVE_INFINITY
}

export function nextSeat(state: GameState, from: PlayerId): PlayerId {
  const n = state.seating.length
  const start = state.seating.indexOf(from)
  for (let step = 1; step <= n; step += 1) {
    const candidate = state.seating[(start + step) % n]
    if (!state.eliminated.includes(candidate)) return candidate
  }
  // The caller checks the last-standing condition before rotating, so this is
  // unreachable in practice; returning `from` keeps reduce total.
  return from
}

const SLOTS: readonly ReleaseSlot[] = ['frontend', 'backend', 'database']

// Three different release types in one zone ends the game. Every mutation that
// can complete a zone has to ask — placement is only the most obvious one, and
// when it was the only caller a zone completed by theft or by an AI event won
// nothing until someone later happened to play a release.
//
// Lives here rather than in release.ts because window.ts is where a contested
// release is finally settled, and release.ts already imports window.ts.
//
// Idempotent: a game that is already over keeps the winner it had, so callers
// can ask freely without racing to log `gameOver` twice.
export function checkWin(state: GameState, log: Log): GameState {
  if (state.over) return { ...state, eventSeq: log.seq }
  for (const id of state.seating) {
    if (state.eliminated.includes(id)) continue
    if (SLOTS.every((slot) => state.players[id].release[slot])) {
      log.add({ type: 'gameOver', winner: id, condition: 'release' })
      return { ...state, over: { winner: id, condition: 'release' }, eventSeq: log.seq }
    }
  }
  return { ...state, eventSeq: log.seq }
}

// A phantom stands in for an AI event card that has already gone back to the AI
// deck: `ai-monitoring` and `ai-release-*` mint a fresh instance to hold the
// board while the real card leaves. One physical card, two representations, on
// purpose — but only for as long as the phantom is on the board.
//
// So a phantom that leaves the board evaporates rather than being banked. Let
// one into the discard and it stops being a representation and becomes a second
// physical card, which #61's sudo Git Branch then shuffles into a draw pile.
export const isPhantom = (card: CardInstance): boolean => card.uid.startsWith('ai-event-')

// The one way a card enters the discard, so the phantom rule cannot be missed
// by a caller that banks cards its own way.
export const bankToDiscard = (state: GameState, cards: CardInstance[]): GameState => ({
  ...state,
  decks: {
    ...state.decks,
    discard: [...state.decks.discard, ...cards.filter((c) => !isPhantom(c))],
  },
})

// Ends the turn, or holds it open when the hand is over the mode's limit.
//
// Lives here (rather than in reduce.ts, its natural home) because triggers.ts's
// `ai-hallucination` event also ends the turn immediately, and reduce.ts
// already needs to import triggers.ts for `fireTrigger`/`onNeutralize` —
// keeping `endTurn` in reduce.ts would make that a cycle.
export function endTurn(state: GameState, log: Log): GameState {
  const me = state.turn.player
  const limit = handLimitFor(state.setup)
  const excess = state.players[me].hand.length - limit
  if (excess > 0) {
    return { ...state, pending: { kind: 'handLimit', player: me, excess }, eventSeq: log.seq }
  }
  log.add({ type: 'turnEnded', player: me })
  const next = nextSeat(state, me)
  log.add({ type: 'turnStarted', player: next, index: state.turn.index + 1 })
  // A DDoS freeze lasts exactly one round: it lifts as its victim's next turn ends.
  const thawed = { ...state.players[me], frozen: [] }
  // A replay lock lifts as its holder's next turn *begins*, which is here —
  // the same moment, seen from the other seat.
  const unlocked = { ...state.players[next], replayLocked: [] }
  return {
    ...state,
    players: { ...state.players, [me]: thawed, [next]: unlocked },
    turn: { player: next, index: state.turn.index + 1, hasDrawn: false, releasesPlayed: 0 },
    pending: null,
    eventSeq: log.seq,
  }
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
