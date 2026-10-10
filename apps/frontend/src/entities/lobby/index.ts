// The lobby entity is an adapter over the fixed network/ transport segment.
// Pages and features depend on this, not on network/ directly.

export type {
  ErrorKind,
  JoinRole,
  PeerInfo,
  ReconnectEvent,
  ReconnectState,
  Role,
  UseLobby,
} from '~/network'
export { MAX_RECONNECT_ATTEMPTS, parseRoomCode, useLobby } from '~/network'
