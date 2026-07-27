// The lobby entity is an adapter over the fixed network/ transport segment.
// Pages and features depend on this, not on network/ directly.

export type { ErrorKind, PeerInfo, Role, UseLobby } from '~/network'
export { useLobby } from '~/network'
