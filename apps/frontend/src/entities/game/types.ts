import type { PeerInfo } from '~/network'

// PLACEHOLDER for the game-rules engine (separate spec). Typed shape only,
// no rule logic this phase. The network layer carries the per-turn snapshot as
// an opaque object; the engine spec refines this into concrete state.
export interface GameState {
  gameId: string
  players: PeerInfo[]
  currentTurn: string | null
}
