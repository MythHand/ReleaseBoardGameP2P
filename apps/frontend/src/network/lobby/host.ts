import type { Message, PeerInfo } from '../types'
import {
  applyConfig,
  applyPeerJoined,
  applyPeerLeft,
  assignRole,
  type LobbyState,
  playerCount,
} from './state'

export interface Outgoing {
  to: string | 'broadcast'
  message: Message
}

interface Result {
  state: LobbyState
  outgoing: Outgoing[]
}

function peerList(state: LobbyState): PeerInfo[] {
  return Object.values(state.peers)
}

export function handleJoinRequest(state: LobbyState, fromId: string, name: string): Result {
  const role = assignRole(state)
  const peer: PeerInfo = { id: fromId, name, role, ready: false }
  const next = applyPeerJoined(state, peer)
  return {
    state: next,
    outgoing: [
      {
        to: fromId,
        message: { type: 'PEER_LIST', payload: { peers: peerList(next), yourRole: role } },
      },
      { to: 'broadcast', message: { type: 'PEER_JOINED', payload: { id: fromId, name, role } } },
    ],
  }
}

export function handleReady(state: LobbyState, fromId: string): Result {
  const existing = state.peers[fromId]
  if (!existing) return { state, outgoing: [] }
  const updated: PeerInfo = { ...existing, ready: true }
  const next = applyPeerJoined(state, updated)
  return {
    state: next,
    outgoing: [
      {
        to: 'broadcast',
        message: {
          type: 'PEER_JOINED',
          payload: { id: updated.id, name: updated.name, role: updated.role },
        },
      },
    ],
  }
}

export function kick(state: LobbyState, peerId: string, reason?: string): Result {
  const next = applyPeerLeft(state, peerId)
  return {
    state: next,
    outgoing: [
      { to: 'broadcast', message: { type: 'PLAYER_KICKED', payload: { peerId, reason } } },
    ],
  }
}

export function setMaxPlayers(state: LobbyState, maxPlayers: number): Result {
  const clamped = Math.min(6, Math.max(2, Math.trunc(maxPlayers)))
  const next = applyConfig(state, clamped)
  return {
    state: next,
    outgoing: [
      {
        to: 'broadcast',
        message: { type: 'LOBBY_CONFIG_UPDATED', payload: { maxPlayers: clamped } },
      },
    ],
  }
}

export function transferHost(state: LobbyState, newHostId: string): Result {
  return {
    state,
    outgoing: [{ to: 'broadcast', message: { type: 'TRANSFER_HOST', payload: { newHostId } } }],
  }
}

export function canStart(state: LobbyState): boolean {
  if (playerCount(state) < 2) return false
  return Object.values(state.peers)
    .filter((p) => p.role === 'host' || p.role === 'player')
    .every((p) => p.ready)
}
