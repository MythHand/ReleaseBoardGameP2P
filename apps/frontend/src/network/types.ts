import type { Action, Event, GameState, PlayerId, PlayerView, Setup } from '@release/engine'

// A plain Omit over a union collapses it to its common members, so it has to
// distribute. `player` and `at` are stripped because the keeper decides both:
// a peer may not act as another seat, nor claim what time it is.
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

// WINDOW_EXPIRED and CLOCK_STARTED are excluded, not stripped: they carry no
// player identity and are fired by the keeper's own clock, never by a peer.
export type Intent = DistributiveOmit<
  Exclude<Action, { type: 'WINDOW_EXPIRED' } | { type: 'CLOCK_STARTED' }>,
  'player' | 'at'
>

// Opaque key→value map for game mode settings (handLimit, releases, etc.).
// The engine's own, re-exported rather than redeclared: the lobby's setup is
// handed straight to `createGame`, so a second same-named type inside
// `network/` could only ever drift away from the one that has to match.
export type { Setup }

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
  // The host leaving the lobby for the board, so every peer follows. Lobby-scoped
  // on purpose: it carries no keeper, because the lobby has no PlayerId to name
  // one with — peers are identified by PeerJS id here, and seats are assigned by
  // the engine's setup. GAME_STARTED below is the sync layer's handshake and
  // stays reserved for it.
  | { type: 'GAME_STARTING'; payload: { gameId: string } }
  // --- Game ---
  | { type: 'GAME_STARTED'; payload: { gameId: string; keeperId: PlayerId } }
  // A seat has finished its opening animation and is ready for the game to
  // move. Addressed to the keeper, which holds the table until every seat has
  // said this (or the cap expires) — see session/startGate.ts.
  | { type: 'INTRO_READY'; payload: { gameId: string } }
  | { type: 'INTENT'; payload: { intent: Intent } }
  // Private, per recipient — one projection plus that viewer's events. Never broadcast.
  | { type: 'SYNC'; payload: { view: PlayerView; events: Event[] } }
  // The only message carrying GameState, and only to a handover successor.
  | { type: 'KEEPER_STATE'; payload: { state: GameState } }
  // null is the death notice: the keeper is gone and the game cannot continue.
  | { type: 'KEEPER_CHANGED'; payload: { keeperId: PlayerId | null } }

export type MessageType = Message['type']

export type WireMessage = Message & { from: string; seq: number }
