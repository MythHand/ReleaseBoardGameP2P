import type { JoinRole, Message, PeerInfo, Where } from '../types'
import { type JoinAdmission, type JoinOptions, resolveJoinAdmission } from './admission'
import {
  applyConfig,
  applyPeerJoined,
  applyPeerLeft,
  effectiveBots,
  type LobbyState,
  playerCount,
  spectatorCount,
  validSpectatorLimit,
} from './state'

export interface Outgoing {
  to: string | 'broadcast'
  message: Message
}

export type LobbyActionError =
  | 'invalid-limit'
  | 'spectators-full'
  | 'players-full'
  | 'match-running'
  | 'invalid-target'

interface Result {
  error?: LobbyActionError
  state: LobbyState
  outgoing: Outgoing[]
}

function peerList(state: LobbyState): PeerInfo[] {
  return Object.values(state.peers)
}

export function handleJoinRequest(
  state: LobbyState,
  fromId: string,
  memberId: string,
  name: string,
  options: JoinOptions,
): Result & JoinAdmission {
  const admission = resolveJoinAdmission(state, fromId, options)
  if (!admission.accepted)
    return {
      ...admission,
      state,
      outgoing: [
        {
          to: fromId,
          message: {
            type: 'JOIN_REJECTED',
            payload: { reason: admission.reason, availability: admission.availability },
          },
        },
      ],
    }
  const { role } = admission

  const peer: PeerInfo = {
    id: fromId,
    memberId,
    name,
    role,
    // A lobby reconnect preserves its confirmation. Returning from a match
    // or its results requires a new one, just like handleWhereabouts.
    ready: options.returningSeat
      ? true
      : role !== 'guest' &&
        options.returningLobbyPeer?.where === 'lobby' &&
        options.returningLobbyPeer.ready,
    where: options.returningSeat ? 'game' : 'lobby',
  }
  const next = applyPeerJoined(state, peer)

  return {
    ...admission,
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
          payload: {
            maxPlayers: state.maxPlayers,
            maxSpectators: state.maxSpectators,
            setup: state.setup,
            bots: state.bots,
          },
        },
      },
      {
        to: 'broadcast',
        message: {
          type: 'PEER_JOINED',
          payload: { id: fromId, memberId, name, role, ready: peer.ready, where: peer.where },
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
  if (existing?.where !== 'lobby' || existing.role === 'guest') return { state, outgoing: [] }
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
            memberId: updated.memberId,
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
            memberId: updated.memberId,
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
  if (!Number.isInteger(maxPlayers)) return { state, outgoing: [], error: 'invalid-limit' }
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
        const guest: PeerInfo = { ...peer, role: 'guest', ready: false }
        peers[peer.id] = guest
        demoted.push(guest)
      }
    } else {
      peers[peer.id] = peer
    }
  }
  if (spectatorCount(state) + demoted.length > state.maxSpectators)
    return { state, outgoing: [], error: 'spectators-full' }
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
            memberId: peer.memberId,
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

export function setMaxSpectators(state: LobbyState, maxSpectators: number): Result {
  if (!validSpectatorLimit(maxSpectators)) return { state, outgoing: [], error: 'invalid-limit' }
  if (maxSpectators < spectatorCount(state))
    return { state, outgoing: [], error: 'spectators-full' }
  return {
    state: applyConfig(state, { maxSpectators }),
    outgoing: [
      { to: 'broadcast', message: { type: 'LOBBY_CONFIG_UPDATED', payload: { maxSpectators } } },
    ],
  }
}

export function setParticipantRole(
  state: LobbyState,
  peerId: string,
  role: JoinRole,
  matchRunning: boolean,
): Result {
  if (matchRunning) return { state, outgoing: [], error: 'match-running' }
  const peer = state.peers[peerId]
  if (
    !peer ||
    peer.role === 'host' ||
    peer.id.startsWith('bot:') ||
    peer.where !== 'lobby' ||
    (role !== 'player' && role !== 'spectator')
  )
    return { state, outgoing: [], error: 'invalid-target' }
  const assigned = role === 'spectator' ? 'guest' : 'player'
  if (peer.role === assigned) return { state, outgoing: [] }
  if (assigned === 'guest' && spectatorCount(state) >= state.maxSpectators)
    return { state, outgoing: [], error: 'spectators-full' }
  if (assigned === 'player' && playerCount(state) >= state.maxPlayers)
    return { state, outgoing: [], error: 'players-full' }
  const updated: PeerInfo = { ...peer, role: assigned, ready: false }
  return {
    state: applyPeerJoined(state, updated),
    outgoing: [{ to: 'broadcast', message: { type: 'PEER_JOINED', payload: updated } }],
  }
}
