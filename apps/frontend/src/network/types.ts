import type { Action, Event, GameState, PlayerId, PlayerView } from '@release/engine'

// A plain Omit over a union collapses it to its common members, so it has to
// distribute. `player` and `at` are stripped because the keeper decides both:
// a peer may not act as another seat, nor claim what time it is.
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

// WINDOW_EXPIRED is excluded, not stripped: it carries no player identity and
// is fired by the keeper's own deadline timer, never submitted by a peer.
export type Intent = DistributiveOmit<Exclude<Action, { type: 'WINDOW_EXPIRED' }>, 'player' | 'at'>

// Opaque key→value map for game mode settings (handLimit, releases, etc.).
// Defined here so network/ doesn't import from @release/ui.
export type Setup = Record<string, string>

export type Role = 'host' | 'player' | 'guest'

export interface PeerInfo {
  id: string
  name: string
  role: Role
  ready: boolean
}

// Discriminated union of every protocol message ({ type, payload }).
export type Message =
  // --- Lobby ---
  | { type: 'JOIN_REQUEST'; payload: { name: string } }
  | { type: 'PEER_LIST'; payload: { peers: PeerInfo[]; yourRole: 'player' | 'guest' } }
  | { type: 'PEER_JOINED'; payload: { id: string; name: string; role: Role; ready: boolean } }
  | { type: 'PLAYER_READY'; payload: Record<string, never> }
  | { type: 'LOBBY_CONFIG_UPDATED'; payload: { maxPlayers?: number; setup?: Setup } }
  | { type: 'LOBBY_DISBANDED'; payload: Record<string, never> }
  | { type: 'PLAYER_KICKED'; payload: { peerId: string; reason?: string } }
  | { type: 'TRANSFER_HOST'; payload: { newHostId: string } }
  | { type: 'HOST_TRANSFERRED'; payload: { from: string; to: string } }
  // --- Game ---
  | { type: 'GAME_STARTED'; payload: { gameId: string; keeperId: PlayerId } }
  | { type: 'INTENT'; payload: { intent: Intent } }
  // Private, per recipient — one projection plus that viewer's events. Never broadcast.
  | { type: 'SYNC'; payload: { view: PlayerView; events: Event[] } }
  // The only message carrying GameState, and only to a handover successor.
  | { type: 'KEEPER_STATE'; payload: { state: GameState } }
  // null is the death notice: the keeper is gone and the game cannot continue.
  | { type: 'KEEPER_CHANGED'; payload: { keeperId: PlayerId | null } }

export type MessageType = Message['type']

export type WireMessage = Message & { from: string; seq: number }
