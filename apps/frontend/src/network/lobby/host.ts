import type { Message, PeerInfo, Role, Seat, Where } from '../types'
import {
  applyConfig,
  applyPeerJoined,
  applyPeerLeft,
  assignRole,
  effectiveBots,
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

export function handleJoinRequest(
  state: LobbyState,
  fromId: string,
  name: string,
  options: { matchRunning: boolean; returningSeat?: Seat },
): Result {
  // Role comes from the seat, never from assignRole. A returning player whose
  // room filled up behind them would otherwise be handed 'guest' and silently
  // demoted out of a match they are still seated in.
  const role: Role = options.returningSeat
    ? fromId === state.hostId
      ? 'host'
      : 'player'
    : options.matchRunning
      ? 'guest'
      : assignRole(state)

  const peer: PeerInfo = {
    id: fromId,
    name,
    role,
    // A returner is mid-match, so it is past readiness; the lobby is the only
    // place to join from, so a newcomer starts there and is not ready.
    ready: Boolean(options.returningSeat),
    where: options.returningSeat ? 'game' : 'lobby',
  }
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
          payload: { maxPlayers: state.maxPlayers, setup: state.setup, bots: state.bots },
        },
      },
      {
        to: 'broadcast',
        message: {
          type: 'PEER_JOINED',
          payload: { id: fromId, name, role, ready: peer.ready, where: peer.where },
        },
      },
      // Everyone else holds the seating with this seat's dead peer id in it.
      ...(options.returningSeat
        ? [
            {
              to: 'broadcast' as const,
              message: {
                type: 'SEAT_REBOUND' as const,
                payload: { playerId: options.returningSeat.playerId, peerId: fromId },
              },
            },
          ]
        : []),
    ],
  }
}

// Ready is a reversible toggle: a player can retract readiness (e.g. after
// spotting a wrong setting), matching the Toggle control in the lobby UI.
export function handleReady(state: LobbyState, fromId: string): Result {
  const existing = state.peers[fromId]
  if (existing?.where !== 'lobby') return { state, outgoing: [] }
  const updated: PeerInfo = { ...existing, ready: !existing.ready }
  const next = applyPeerJoined(state, updated)
  return {
    state: next,
    outgoing: [
      {
        to: 'broadcast',
        message: {
          type: 'PEER_JOINED',
          payload: {
            id: updated.id,
            name: updated.name,
            role: updated.role,
            ready: updated.ready,
            where: updated.where,
          },
        },
      },
    ],
  }
}

// The presence half of the roster, shaped exactly like handleReady: the host is
// the only authority for who is where, so a guest's announcement arrives here
// and leaves as the host's own broadcast.
export function handleWhereabouts(state: LobbyState, fromId: string, where: Where): Result {
  const existing = state.peers[fromId]
  if (!existing) return { state, outgoing: [] }
  // Every screen announces on mount, so a remount would otherwise cost the
  // whole table a broadcast that changed nothing.
  if (existing.where === where) return { state, outgoing: [] }
  // Returning from a match requires a new confirmation. The identical-location
  // guard above keeps remounts from retracting that new confirmation.
  const updated: PeerInfo = {
    ...existing,
    where,
    ready: where === 'lobby' ? false : existing.ready,
  }
  return {
    state: applyPeerJoined(state, updated),
    outgoing: [
      {
        to: 'broadcast',
        message: {
          type: 'PEER_JOINED',
          payload: {
            id: updated.id,
            name: updated.name,
            role: updated.role,
            ready: updated.ready,
            where: updated.where,
          },
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
          payload: {
            id: peer.id,
            name: peer.name,
            role: peer.role,
            ready: peer.ready,
            where: peer.where,
          },
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

// The rules seat 2–6 (docs/rules/general.md:13), so one human and five bots is
// the largest table a lone host can ask for.
export const MAX_BOTS = 5

export function setBots(state: LobbyState, bots: number): Result {
  const clamped = Math.min(MAX_BOTS, Math.max(0, Math.trunc(bots)))
  return {
    state: applyConfig(state, { bots: clamped }),
    outgoing: [
      { to: 'broadcast', message: { type: 'LOBBY_CONFIG_UPDATED', payload: { bots: clamped } } },
    ],
  }
}

export function canStart(state: LobbyState): boolean {
  if (playerCount(state) + effectiveBots(state) < 2) return false
  return Object.values(state.peers)
    .filter((p) => p.role === 'host' || p.role === 'player')
    .every((p) => p.ready && p.where === 'lobby')
}

export function disbandLobby(state: LobbyState): Result {
  return {
    state,
    outgoing: [{ to: 'broadcast', message: { type: 'LOBBY_DISBANDED', payload: {} } }],
  }
}
