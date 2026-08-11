import type { PlayerView } from '@release/engine'

// Whether this projection is a game nobody has played yet. The intro plays on
// fresh entry only, and freshness is decided from the state itself rather than
// from bookkeeping: a reconnect mid-game must drop straight to the live board.
//
// Accepted edge: a refresh in the first seconds of turn 1, before anyone has
// acted, still looks like an opening and replays the deal. That is preferred to
// storing "already seen" somewhere it can go stale.
export function isOpening(view: PlayerView): boolean {
  if (view.over) return false
  if (view.turn.index !== 0 || view.turn.hasDrawn) return false
  if (view.decks.discardCount > 0) return false
  if (view.pending || view.window) return false
  const released = (r: PlayerView['self']['release']) => Object.keys(r).length > 0
  if (released(view.self.release)) return false
  return view.opponents.every((o) => !o.eliminated && !released(o.release))
}
