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
      // Seed the joiner with the host's current config so the modes/capacity
      // panels show the agreed match settings immediately — without this a guest
      // sees its DEFAULT_SETUP seed until the host happens to change a setting.
      {
        to: fromId,
        message: {
          type: 'LOBBY_CONFIG_UPDATED',
          payload: { maxPlayers: state.maxPlayers, setup: state.setup },
        },
      },
      {
        to: 'broadcast',
        message: { type: 'PEER_JOINED', payload: { id: fromId, name, role, ready: false } },
      },
    ],
  }
}

// Ready is a reversible toggle: a player can retract readiness (e.g. after
// spotting a wrong setting), matching the Toggle control in the lobby UI.
export function handleReady(state: LobbyState, fromId: string): Result {
  const existing = state.peers[fromId]
  if (!existing) return { state, outgoing: [] }
  const updated: PeerInfo = { ...existing, ready: !existing.ready }
  const next = applyPeerJoined(state, updated)
  return {
    state: next,
    outgoing: [
      {
        to: 'broadcast',
        message: {
          type: 'PEER_JOINED',
          payload: { id: updated.id, name: updated.name, role: updated.role, ready: updated.ready },
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
  // Lowering the cap must demote the now over-capacity players to guests in
  // join order, otherwise playerCount()/canStart() would still count them and
  // the game could start above the new cap. The host always keeps a slot.
  const peers: Record<string, PeerInfo> = {}
  const demoted: PeerInfo[] = []
  let players = 0
  for (const peer of Object.values(state.peers)) {
    if (peer.role === 'host') {
      peers[peer.id] = peer
      players += 1
    } else if (peer.role === 'player') {
      if (players < clamped) {
        peers[peer.id] = peer
        players += 1
      } else {
        const guest: PeerInfo = { ...peer, role: 'guest' }
        peers[peer.id] = guest
        demoted.push(guest)
      }
    } else {
      peers[peer.id] = peer
    }
  }
  const next = applyConfig({ ...state, peers }, { maxPlayers: clamped })
  return {
    state: next,
    outgoing: [
      {
        to: 'broadcast',
        message: { type: 'LOBBY_CONFIG_UPDATED', payload: { maxPlayers: clamped } },
      },
      // Propagate each demotion so guests' rosters stay consistent with the host.
      ...demoted.map((peer) => ({
        to: 'broadcast' as const,
        message: {
          type: 'PEER_JOINED' as const,
          payload: { id: peer.id, name: peer.name, role: peer.role, ready: peer.ready },
        },
      })),
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

export function disbandLobby(state: LobbyState): Result {
  return {
    state,
    outgoing: [{ to: 'broadcast', message: { type: 'LOBBY_DISBANDED', payload: {} } }],
  }
}
