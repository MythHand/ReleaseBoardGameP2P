export { checkRoom } from './lobby/checkRoom'
export { MAX_BOTS } from './lobby/host'
export { nameTaken } from './lobby/profile'
export { effectiveBots, type LobbyState } from './lobby/state'
export { MAX_RECONNECT_ATTEMPTS, type ReconnectEvent } from './session/reconnect'
export type {
  Intent,
  JoinAvailability,
  JoinRole,
  PeerInfo,
  ProfilePatch,
  ProfileRejectReason,
  Role,
  Seat,
  Where,
} from './types'
export {
  type ErrorKind,
  formatRoomCode,
  type LobbyStatus,
  type ProfileRejection,
  parseRoomCode,
  type ReconnectState,
  type UseLobby,
  useLobby,
} from './useLobby'
export type { VoiceIssue, VoiceSnapshot } from './voice/runtime'
export type { RoomVoiceFacade } from './voice/useRoomVoice'
