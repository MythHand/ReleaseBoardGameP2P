import type { PeerInfo, Setup } from '../types'

export interface LobbyState {
  selfId: string
  hostId: string
  maxPlayers: number
  setup: Setup
  peers: Record<string, PeerInfo>
}

export function createLobbyState(args: {
  selfId: string
  hostId: string
  maxPlayers: number
  setup?: Setup
  peers: PeerInfo[]
}): LobbyState {
  const peers: Record<string, PeerInfo> = {}
  for (const p of args.peers) peers[p.id] = p
  return {
    selfId: args.selfId,
    hostId: args.hostId,
    maxPlayers: args.maxPlayers,
    setup: args.setup ?? {},
    peers,
  }
}

export function playerCount(state: LobbyState): number {
  return Object.values(state.peers).filter((p) => p.role === 'host' || p.role === 'player').length
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
  patch: { maxPlayers?: number; setup?: Setup },
): LobbyState {
  return {
    ...state,
    ...(patch.maxPlayers !== undefined && { maxPlayers: patch.maxPlayers }),
    ...(patch.setup !== undefined && { setup: patch.setup }),
  }
}
