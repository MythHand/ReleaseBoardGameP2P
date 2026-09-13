import type { PeerInfo, Setup } from '../types'

export interface LobbyState {
  selfId: string
  hostId: string
  maxPlayers: number
  // How many bots the host has ASKED for — a ceiling, not a reservation. What
  // the table can actually seat is `effectiveBots` below, which shrinks as
  // people take the seats and grows back when they leave. Storing the request
  // rather than the outcome is what keeps a bot from ever costing a person a
  // seat, and what saves this from needing a displacement rule.
  bots: number
  setup: Setup
  peers: Record<string, PeerInfo>
}

export function createLobbyState(args: {
  selfId: string
  hostId: string
  maxPlayers: number
  bots?: number
  setup?: Setup
  peers: PeerInfo[]
}): LobbyState {
  const peers: Record<string, PeerInfo> = {}
  for (const p of args.peers) peers[p.id] = p
  return {
    selfId: args.selfId,
    hostId: args.hostId,
    maxPlayers: args.maxPlayers,
    bots: args.bots ?? 0,
    setup: args.setup ?? {},
    peers,
  }
}

export function playerCount(state: LobbyState): number {
  return Object.values(state.peers).filter((p) => p.role === 'host' || p.role === 'player').length
}

// What the table can actually seat, given who is in it. Every reader derives
// bots from this rather than storing which seats are bots — storing that is
// what would force a displacement rule when somebody joins, a kick rule for a
// thing that cannot be kicked, and a ready rule for a thing that is always
// ready. `Math.max(0, …)` covers a capacity lowered below the people already
// present, where the subtraction goes negative.
export function effectiveBots(state: LobbyState): number {
  return Math.max(0, Math.min(state.bots, state.maxPlayers - playerCount(state)))
}

export function assignRole(state: LobbyState): 'player' | 'guest' {
  return playerCount(state) < state.maxPlayers ? 'player' : 'guest'
}

export function applyPeerList(state: LobbyState, peers: PeerInfo[]): LobbyState {
  return createLobbyState({
    selfId: state.selfId,
    hostId: state.hostId,
    maxPlayers: state.maxPlayers,
    setup: state.setup,
    peers,
  })
}

export function applyPeerJoined(state: LobbyState, peer: PeerInfo): LobbyState {
  return { ...state, peers: { ...state.peers, [peer.id]: peer } }
}

export function applyPeerLeft(state: LobbyState, peerId: string): LobbyState {
  const peers = { ...state.peers }
  delete peers[peerId]
  return { ...state, peers }
}

export function applyConfig(
  state: LobbyState,
  patch: { maxPlayers?: number; setup?: Setup; bots?: number },
): LobbyState {
  return {
    ...state,
    ...(patch.maxPlayers !== undefined && { maxPlayers: patch.maxPlayers }),
    ...(patch.setup !== undefined && { setup: patch.setup }),
    ...(patch.bots !== undefined && { bots: patch.bots }),
  }
}
