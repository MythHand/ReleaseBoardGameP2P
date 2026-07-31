import type { TurnDockState } from '@/table/TurnDock/TurnDock'
import type { TableState } from './types'

export interface DockView {
  state: TurnDockState
  danger: boolean
  seconds: number
  progress: number
  activePlayer?: string
}

// `now` is supplied by the caller — the kit never reads the clock itself.
// Unused until task 9 wires in the deadline (`state.window`); kept in the
// signature now so that later task doesn't have to change call sites.
export function deriveDock(state: TableState, selfId: string, _now: number): DockView {
  const yours = state.turn === selfId
  const activePlayer = state.opponents.find((o) => o.id === state.turn)?.name
  return {
    state: yours ? (state.hasDrawn ? 'push' : 'draw') : 'waiting',
    danger: false,
    seconds: 0,
    progress: 0,
    activePlayer,
  }
}
