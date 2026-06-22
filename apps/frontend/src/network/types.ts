// The networking layer is decoupled from game rules: card identities are
// opaque strings, and the per-turn snapshot is an opaque JSON object. The
// game-engine spec refines these.
export type CardId = string
export type GameStateSnapshot = Record<string, unknown>

export type Role = 'host' | 'player' | 'guest'

export interface PeerInfo {
  id: string
  name: string
  role: Role
  ready: boolean
}

export interface AttackResponse {
  player: string
  kind: 'attack' | 'pass'
  card?: CardId
  sudo?: boolean
}

// Discriminated union of every protocol message ({ type, payload }).
export type Message =
  // --- Lobby ---
  | { type: 'JOIN_REQUEST'; payload: { name: string } }
  | { type: 'PEER_LIST'; payload: { peers: PeerInfo[]; yourRole: 'player' | 'guest' } }
  | { type: 'PEER_JOINED'; payload: { id: string; name: string; role: Role; ready: boolean } }
  | { type: 'PLAYER_READY'; payload: Record<string, never> }
  | { type: 'LOBBY_CONFIG_UPDATED'; payload: { maxPlayers: number } }
  | { type: 'PLAYER_KICKED'; payload: { peerId: string; reason?: string } }
  // TRANSFER_HOST / HOST_TRANSFERRED: types defined here for future use.
  // Runtime handoff (reconnect to new host, state re-broadcast, HOST_TRANSFERRED confirm)
  // is intentionally deferred — depends on the game-engine spec / deck-keeper decision.
  | { type: 'TRANSFER_HOST'; payload: { newHostId: string } }
  | { type: 'HOST_TRANSFERRED'; payload: { from: string; to: string } }
  // --- Game start ---
  | { type: 'HAND_DEALT'; payload: { cards: CardId[] } }
  | {
      type: 'GAME_STARTED'
      payload: {
        players: { id: string; name: string }[]
        guests: { id: string; name: string }[]
        deckSize: number
        eventDeckSize: number
        releaseZones: Record<string, never>
        currentTurn: string
        maxPlayers: number
        modes: Record<string, unknown>
      }
    }
  // --- Turn ---
  | { type: 'TURN_START'; payload: { player: string; turnIndex: number } }
  | {
      type: 'CARD_PLAYED'
      payload: { card: CardId; target?: string; sudo?: boolean; codeReview?: boolean }
    }
  | { type: 'CARD_DRAWN'; payload: { deckSize: number } }
  | { type: 'TURN_END'; payload: Record<string, never> }
  | {
      type: 'ATTACK_WINDOW_OPEN'
      payload: { releaseCard: CardId; releasePlayer: string; codeReview: boolean }
    }
  | { type: 'ATTACK'; payload: { card: CardId; sudo?: boolean } }
  | { type: 'PASS'; payload: Record<string, never> }
  | { type: 'DEFENSE_REQUEST'; payload: { attack: CardId; fromPlayer: string } }
  | { type: 'DEFEND'; payload: { card: CardId } }
  | { type: 'DECLINE'; payload: Record<string, never> }
  | { type: 'TURN_RESOLVED'; payload: { state: GameStateSnapshot } }
  // --- Rules-driven (TYPES ONLY; runtime deferred — see plan scope note) ---
  | { type: 'DRAW_REQUEST'; payload: Record<string, never> }
  | { type: 'DRAW_RESULT'; payload: { card: CardId } }
  | { type: 'AI_REVEALED'; payload: { aiCard: CardId; eventCard: CardId } }
  | { type: 'ERROR503_DRAWN'; payload: { player: string } }
  | {
      type: 'NEUTRALIZE'
      payload: { method: 'debugger' | 'monitoring' | 'sacrifice'; releaseCard?: CardId }
    }
  | { type: 'PLAYER_ELIMINATED'; payload: { player: string } }
  | {
      type: 'HAND_ATTACK'
      payload: { card: CardId; target: string; sudo?: boolean; requestedCard?: CardId }
    }
  | { type: 'HAND_GIVE'; payload: { card: CardId } }
  | {
      type: 'HAND_ATTACK_RESULT'
      payload: {
        attacker: string
        target: string
        attackerHandSize: number
        targetHandSize: number
      }
    }
  | { type: 'DISCARD_REQUEST'; payload: { fromCard: CardId } }
  | { type: 'DISCARD_CHOICE'; payload: { card: CardId } }
  | {
      type: 'GIT_OP'
      payload: { op: 'branch' | 'merge' | 'rebase' | 'cherry-pick'; sudo?: boolean }
    }
  | { type: 'GIT_PEEK'; payload: { cards: CardId[] } }
  | { type: 'GIT_REORDER'; payload: { order: CardId[] } }

export type MessageType = Message['type']

export type WireMessage = Message & { from: string; seq: number }
