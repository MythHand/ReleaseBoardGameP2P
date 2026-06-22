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
