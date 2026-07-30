import type { MessageType } from '../types'

// Messages a guest accepts only from the host: the roster, the lobby config,
// and the three that end someone's membership. Since the transport now stamps
// `from` with the connection a frame arrived on (transport/peer.ts), a relayed
// frame reaches a guest wearing the host's id — so a peer-originated one of
// these would arrive looking authoritative. The host does not forward them.
const HOST_ONLY: ReadonlySet<MessageType> = new Set<MessageType>([
  'PEER_LIST',
  'PEER_JOINED',
  'LOBBY_CONFIG_UPDATED',
  'PLAYER_KICKED',
  'LOBBY_DISBANDED',
  'HOST_TRANSFERRED',
])

export function isRelayable(type: MessageType): boolean {
  return !HOST_ONLY.has(type)
}

// Host relay: a message arriving from one peer is forwarded to every other
// connected peer, never back to the sender and never to the host's own
// connection (the host delivers its own outbound messages directly).
export function relayTargets(args: {
  connectedPeerIds: string[]
  hostId: string
  from: string
}): string[] {
  return args.connectedPeerIds.filter((id) => id !== args.from && id !== args.hostId)
}
