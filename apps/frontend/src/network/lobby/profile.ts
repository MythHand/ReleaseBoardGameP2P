import { botNames, PRESET_AVATARS } from '@release/ui'
import type { PeerInfo, ProfilePatch, ProfileRejectReason } from '../types'
import type { Outgoing } from './host'
import { applyPeerJoined, type LobbyState, MAX_BOTS } from './state'

// Every rule about how a member is shown — the avatar they hold and the
// nickname they go by. Pure, like the rest of lobby/: the host runs it to
// decide, and a guest runs `nameTaken` too, only to warn before asking.

export const AVATAR_IDS: readonly string[] = PRESET_AVATARS.map((a) => a.id)

export function isAvatarId(value: unknown): value is string {
  return typeof value === 'string' && AVATAR_IDS.includes(value)
}

// Avatars belong to seats: a spectator's leftover id (which should not exist)
// holds nothing, and the peer being reassigned never blocks itself.
export function takenAvatars(state: LobbyState, exceptPeerId?: string): Set<string> {
  const taken = new Set<string>()
  for (const p of Object.values(state.peers)) {
    if (p.id === exceptPeerId || p.role === 'guest' || !p.avatar) continue
    taken.add(p.avatar)
  }
  return taken
}

export function pickAvatar(
  state: LobbyState,
  wish: string | null | undefined,
  exceptPeerId: string,
  random: () => number = Math.random,
): string | undefined {
  const taken = takenAvatars(state, exceptPeerId)
  if (isAvatarId(wish) && !taken.has(wish)) return wish
  const free = AVATAR_IDS.filter((id) => !taken.has(id))
  if (free.length === 0) return undefined
  return free[Math.min(free.length - 1, Math.floor(random() * free.length))]
}

// The host's own, when it opens or restores a room: nobody else holds anything.
export function firstAvatar(
  wish: string | null | undefined,
  random: () => number = Math.random,
): string {
  if (isAvatarId(wish)) return wish
  return AVATAR_IDS[Math.min(AVATAR_IDS.length - 1, Math.floor(random() * AVATAR_IDS.length))]
}

const normal = (name: string) => name.trim().toLowerCase()

// Taken by a member, or by any bot the table could seat — all MAX_BOTS of them,
// not just the ones asked for: a bot added later would otherwise take a living
// player's name. `botNames` shuffles independently of `count`, so this prefix
// is exactly the names those bots will get.
export function nameTaken(
  state: LobbyState,
  name: string,
  exceptPeerIds: readonly string[] = [],
): boolean {
  const wanted = normal(name)
  if (botNames(state.hostId, MAX_BOTS).some((bot) => normal(bot) === wanted)) return true
  return Object.values(state.peers).some(
    (p) => !exceptPeerIds.includes(p.id) && normal(p.name) === wanted,
  )
}

export function parseProfilePatch(value: unknown): ProfilePatch | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  if (raw.name !== undefined && typeof raw.name !== 'string') return null
  if (raw.avatar !== undefined && typeof raw.avatar !== 'string') return null
  if (raw.name === undefined && raw.avatar === undefined) return null
  return {
    ...(raw.name === undefined ? {} : { name: raw.name as string }),
    ...(raw.avatar === undefined ? {} : { avatar: raw.avatar as string }),
  }
}

export interface ProfileResult {
  state: LobbyState
  outgoing: Outgoing[]
  error?: ProfileRejectReason
  renamed?: { from: string; to: string }
}

// Lobby only: the seating freezes names at the deal, so a rename mid-match
// would show two names for one seat. A patch is applied whole or not at all.
export function handleProfileUpdate(
  state: LobbyState,
  fromId: string,
  patch: ProfilePatch,
  matchRunning: boolean,
): ProfileResult {
  const reject = (reason: ProfileRejectReason): ProfileResult => ({
    state,
    error: reason,
    outgoing: [{ to: fromId, message: { type: 'PROFILE_REJECTED', payload: { reason } } }],
  })
  const peer = state.peers[fromId]
  if (peer?.where !== 'lobby' || matchRunning) return reject('not-in-lobby')

  let next: PeerInfo = peer
  if (patch.name !== undefined) {
    const name = patch.name.trim()
    if (!name) return reject('name-invalid')
    if (name !== peer.name) {
      if (nameTaken(state, name, [fromId])) return reject('name-taken')
      next = { ...next, name }
    }
  }
  // A spectator holds no avatar; its field is ignored rather than refused, so
  // a rename sent together with it still goes through.
  if (patch.avatar !== undefined && peer.role !== 'guest' && patch.avatar !== peer.avatar) {
    if (!isAvatarId(patch.avatar) || takenAvatars(state, fromId).has(patch.avatar))
      return reject('avatar-taken')
    next = { ...next, avatar: patch.avatar }
  }
  if (next === peer) return { state, outgoing: [] }
  return {
    state: applyPeerJoined(state, next),
    outgoing: [{ to: 'broadcast', message: { type: 'PEER_JOINED', payload: next } }],
    ...(next.name === peer.name ? {} : { renamed: { from: peer.name, to: next.name } }),
  }
}
