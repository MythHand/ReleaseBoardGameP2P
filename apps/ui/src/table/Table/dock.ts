import type { TurnDockState } from '@/table/TurnDock/TurnDock'
import type { TableState } from './types'

export interface DockView {
  state: TurnDockState
  danger: boolean
  // Absent when the state carries no deadline. A number here always means time
  // genuinely left, so `0` reads as expired rather than as "no clock" — the two
  // are different things and a single number cannot say both.
  seconds?: number
  progress: number
  activePlayer?: string
}

// Both ends of a deadline span, so the ring's sweep is exact rather than
// assumed — no WINDOW_MS constant exists on purpose (a hardcoded duration
// would make a visible countdown wrong the moment the engine's timings
// change). Either bound missing (an untimed pending) reads as a flat ring.
function clock(
  openedAt: number | undefined,
  deadline: number | undefined,
  now: number,
): { seconds?: number; progress: number } {
  if (openedAt === undefined || deadline === undefined) return { progress: 0 }
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000))
  const span = deadline - openedAt
  const progress = span > 0 ? Math.min(1, Math.max(0, (deadline - now) / span)) : 0
  return { seconds, progress }
}

// Whether any deadline is running for this viewer — the states where
// `deriveDock` draws a counting ring, and so the only states where a
// consumer's clock has to tick. Exported because a consumer that ticks on a
// different rule than the one the ring is drawn from will freeze the
// countdown for whatever state the two disagree about; there is one rule and
// this is it — each branch mirrors the matching `deriveDock` branch below.
export function isCounting(state: TableState, selfId: string): boolean {
  // A release's own price is not a state of the table (#101) — see `deriveDock`
  // below. It is one action inside a turn, so it falls through to the turn's
  // own clock rather than answering here, exactly as the ring it mirrors does.
  if (state.pending && state.pending.kind !== 'discardForRelease') {
    return 'deadline' in state.pending
  }
  // Mirrors the window branch below exactly: the window's OWNER gets the hold
  // ring with a live clock whoever they are — elimination only silences a
  // would-be responder, whose branch is the guarded one.
  if (state.window) return state.window.player === selfId || !state.you.eliminated
  return state.turn === selfId && state.turnClock != null
}

// `now` is supplied by the caller — the kit never reads the clock itself.
//
// One decision table, ordered by what the engine would actually accept from
// this viewer: a key is only ever offered where the action behind it is legal
// RIGHT NOW. Every branch below that shows no key exists because the engine
// rejects everything the dock could offer there — a live-looking key whose
// clicks vanish in silent rejections is exactly the defect this table ended.
export function deriveDock(state: TableState, selfId: string, now: number): DockView {
  const yours = state.turn === selfId
  const activePlayer = state.opponents.find((o) => o.id === state.turn)?.name
  const pending = state.pending

  // `discardForRelease` is excluded from BOTH pending branches below (#101).
  // A release's own price is one action inside a turn, not a state of the
  // table: the phase has not changed and the turn is still its owner's, so the
  // dock keeps the turn's own phase, accent and clock — the actor falls to the
  // `yours` branch at the bottom, everyone else to `waiting`, which is exactly
  // what each of them saw a moment earlier. The engine only ever opens this
  // pending on its owner's own turn (`playableFor` checks turn ownership), and
  // no window can be open alongside it (same check), so those two branches are
  // where it always lands.
  //
  // It keeps a live key rather than the "no key while the engine would refuse"
  // rule below, because the action behind that key IS legal: the first press
  // takes the staged release back (`cancelRelease`), the next one draws or
  // pushes. That is the same rule the table already runs — while an unpaid
  // release stands, anything other than paying takes it back.
  //
  // A pending owed by you outranks everything — the engine is waiting on your
  // decision. The choice itself lives on the table or in the PendingPrompt;
  // the dock narrates the phase and counts its clock down.
  if (pending && pending.kind !== 'discardForRelease' && pending.player === selfId) {
    const timed = 'deadline' in pending ? pending : undefined
    return {
      state: 'reaction',
      danger: pending.kind === 'defend' || pending.kind === 'neutralize503',
      ...clock(timed?.openedAt, timed?.deadline, now),
      activePlayer,
    }
  }

  // Someone else's pending blocks every action of yours — DRAW, PLAY, PUSH,
  // even PASS all reject while any decision is open — so the dock holds and
  // names whose decision the table is waiting on, with the live clock when
  // that decision carries one (a defend does; the rest read as a flat ring).
  if (pending && pending.kind !== 'discardForRelease') {
    const timed = 'deadline' in pending ? pending : undefined
    return {
      state: 'hold',
      danger: false,
      ...clock(timed?.openedAt, timed?.deadline, now),
      activePlayer: state.opponents.find((o) => o.id === pending.player)?.name,
    }
  }

  if (state.window) {
    const { openedAt, deadline } = state.window
    // Your own release under the window: nothing here is yours to press — you
    // cannot attack it, pass on it, or end the turn under it — so the window's
    // countdown IS the content. No activePlayer: it is your own turn, and the
    // caption slot says what the wait is about instead.
    if (state.window.player === selfId) {
      return { state: 'hold', danger: false, ...clock(openedAt, deadline, now) }
    }
    // Every living responder may PASS (and UNPASS), holding attack cards or
    // not — the "everyone passed, close early" rule is only reachable when the
    // card-less can concur too. Gating this on canAttackWith is what used to
    // make every window run its full clock.
    if (!state.you.eliminated) {
      return { state: 'reaction', danger: false, ...clock(openedAt, deadline, now), activePlayer }
    }
  }

  if (yours) {
    // The turn's own inactivity clock. Absent (a flat ring) before the keeper
    // starts the first turn's clock — a `0` here would read as expired.
    return {
      state: state.hasDrawn ? 'push' : 'draw',
      danger: false,
      ...clock(state.turnClock?.openedAt, state.turnClock?.deadline, now),
      activePlayer,
    }
  }

  return { state: 'waiting', danger: false, progress: 0, activePlayer }
}
