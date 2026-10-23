import type { GameState, Pending } from '../state'

interface Timing {
  openedAt?: number
  deadline?: number
  awaitingPresentation?: true
}

function defer<T extends Timing>(before: T | null, after: T, sameDecision: boolean): T {
  if (after.openedAt === undefined || after.deadline === undefined) return after
  const changed =
    !sameDecision || before?.openedAt !== after.openedAt || before?.deadline !== after.deadline
  if (!changed && !before?.awaitingPresentation) return after
  return after.awaitingPresentation ? after : { ...after, awaitingPresentation: true }
}

function activate<T extends Timing>(clock: T, at: number): T {
  if (!clock.awaitingPresentation || clock.openedAt === undefined || clock.deadline === undefined)
    return clock
  const { awaitingPresentation: _, ...rest } = clock
  return { ...rest, openedAt: at, deadline: at + clock.deadline - clock.openedAt } as T
}

// The same kind owed by the same seat. A System Upgrade names a roster rather
// than a seat, and each of its phases is a decision of its own.
function isSameDecision(before: Pending | null, after: Pending): boolean {
  if (before?.kind !== after.kind) return false
  if (before.kind === 'systemUpgrade' && after.kind === 'systemUpgrade') {
    return before.phase === after.phase
  }
  return 'player' in before && 'player' in after && before.player === after.player
}

// Only new or normally renewed allowances wait for presentation. An unrelated
// state change must not replenish an already active reaction window.
export function deferNewClocks(before: GameState, after: GameState): GameState {
  if (before === after) return after
  const turn = defer(
    before.turn,
    after.turn,
    before.turn.player === after.turn.player && before.turn.index === after.turn.index,
  )
  const window = after.window
    ? defer(
        before.window,
        after.window,
        before.window?.target.card === after.window.target.card &&
          before.window?.round === after.window.round &&
          before.window?.held === after.window.held,
      )
    : null
  const oldPending = before.pending
  const nextPending = after.pending
  const pending =
    nextPending && 'openedAt' in nextPending
      ? defer(
          oldPending && 'openedAt' in oldPending ? oldPending : null,
          nextPending,
          isSameDecision(oldPending, nextPending),
        )
      : nextPending
  return turn === after.turn && window === after.window && pending === after.pending
    ? after
    : { ...after, turn, window, pending }
}

export function activatePresentedClocks(state: GameState, at: number): GameState {
  const turn = activate(state.turn, at)
  const window = state.window ? activate(state.window, at) : null
  const pending =
    state.pending && 'openedAt' in state.pending ? activate(state.pending, at) : state.pending
  return turn === state.turn && window === state.window && pending === state.pending
    ? state
    : { ...state, turn, window, pending }
}
