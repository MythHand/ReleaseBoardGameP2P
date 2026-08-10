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

// `now` is supplied by the caller — the kit never reads the clock itself.
export function deriveDock(state: TableState, selfId: string, now: number): DockView {
  const yours = state.turn === selfId
  const activePlayer = state.opponents.find((o) => o.id === state.turn)?.name

  // A pending owed by you outranks a window you could merely join — the
  // engine is waiting on your decision, which always takes priority over an
  // opportunity you may or may not take.
  const mine = state.pending?.player === selfId
  if (mine && state.pending) {
    const timed = 'deadline' in state.pending ? state.pending : undefined
    return {
      state: 'reaction',
      danger: state.pending.kind === 'defend' || state.pending.kind === 'neutralize503',
      ...clock(timed?.openedAt, timed?.deadline, now),
      activePlayer,
    }
  }

  if (state.window && state.window.canAttackWith.length > 0) {
    const { openedAt, deadline } = state.window
    return { state: 'reaction', danger: false, ...clock(openedAt, deadline, now), activePlayer }
  }

  return {
    state: yours ? (state.hasDrawn ? 'push' : 'draw') : 'waiting',
    danger: false,
    progress: 0,
    activePlayer,
  }
}
