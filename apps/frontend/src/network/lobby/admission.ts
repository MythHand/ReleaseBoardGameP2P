import type { JoinAvailability, JoinRequestPayload, JoinRole, PeerInfo, Role, Seat } from '../types'
import type { LobbyState } from './state'

export interface JoinOptions {
  matchRunning: boolean
  returningSeat?: Seat
  returningLobbyPeer?: Pick<PeerInfo, 'role' | 'ready' | 'where'> & { id?: string }
  requestedRole?: JoinRole
}

export type JoinAdmission =
  | { accepted: true; role: Role }
  | { accepted: false; reason: 'room-full'; availability: JoinAvailability }

export function parseJoinRequestPayload(value: unknown): JoinRequestPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const payload = value as Record<string, unknown>
  if (
    typeof payload.name !== 'string' ||
    !payload.name.trim() ||
    typeof payload.resumeToken !== 'string' ||
    !payload.resumeToken
  )
    return null
  if (
    payload.requestedRole !== undefined &&
    payload.requestedRole !== 'player' &&
    payload.requestedRole !== 'spectator'
  )
    return null
  let resume: JoinRequestPayload['resume']
  if (payload.resume !== undefined) {
    if (!payload.resume || typeof payload.resume !== 'object') return null
    const preference = payload.resume as Record<string, unknown>
    if (preference.where !== 'lobby' && preference.where !== 'game' && preference.where !== 'stats')
      return null
    if (preference.lastGameId !== null && typeof preference.lastGameId !== 'string') return null
    resume = { where: preference.where, lastGameId: preference.lastGameId }
  }
  return {
    name: payload.name,
    resumeToken: payload.resumeToken,
    ...(payload.requestedRole === undefined ? {} : { requestedRole: payload.requestedRole }),
    ...(resume ? { resume } : {}),
  }
}

export function resolveJoinAdmission(
  state: LobbyState,
  fromId: string,
  options: JoinOptions,
): JoinAdmission {
  if (options.returningSeat)
    return { accepted: true, role: fromId === state.hostId ? 'host' : 'player' }
  const others = Object.values(state.peers).filter(
    (peer) => peer.id !== fromId && peer.id !== options.returningLobbyPeer?.id,
  )
  const availability = {
    player:
      !options.matchRunning &&
      others.filter((peer) => peer.role !== 'guest').length < state.maxPlayers,
    spectator: others.filter((peer) => peer.role === 'guest').length < state.maxSpectators,
  }
  const wantsSpectator =
    options.requestedRole === 'spectator' || options.returningLobbyPeer?.role === 'guest'
  if (!wantsSpectator && availability.player) return { accepted: true, role: 'player' }
  if (availability.spectator) return { accepted: true, role: 'guest' }
  return { accepted: false, reason: 'room-full', availability }
}
