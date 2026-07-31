import { createEnvelope, nextSeq } from '../envelope'
import type { Transport } from '../transport/peer'
import type { Message, WireMessage } from '../types'

// A Transport over plain function calls: the whole protocol runs in one
// process, with no PeerJS, no browser and no timers. Frames are JSON
// round-tripped rather than passed by reference, because a peer receiving a
// live object would hide exactly the serialization bugs this is here to catch.
export function createMemoryNetwork(peerIds: string[]) {
  const inboxes = new Map<string, (frame: WireMessage) => void>()

  const deliver = (to: string, frame: WireMessage) => {
    const inbox = inboxes.get(to)
    if (inbox) inbox(JSON.parse(JSON.stringify(frame)) as WireMessage)
  }

  return {
    onDeliver(peerId: string, handler: (frame: WireMessage) => void) {
      inboxes.set(peerId, handler)
    },
    drop(peerId: string) {
      inboxes.delete(peerId)
    },
    transport(self: string): Transport {
      return {
        id: self,
        connectTo() {},
        send(to: string, message: Message) {
          // A peer holds no connection to itself, so PeerJS's `send` resolves
          // `connections.get(self)` to undefined and drops the frame
          // (transport/peer.ts). Mirrored here: delivering it to the sender's
          // own inbox would let a keeper-as-player wiring pass in tests and
          // then silently do nothing in production.
          if (to === self) return
          deliver(to, createEnvelope(message, self, nextSeq()))
        },
        broadcast(message: Message) {
          const frame = createEnvelope(message, self, nextSeq())
          for (const id of peerIds) if (id !== self) deliver(id, frame)
        },
        relay(toIds: string[], frame: WireMessage) {
          for (const to of toIds) deliver(to, frame)
        },
        connectedIds() {
          return peerIds.filter((id) => id !== self)
        },
        close() {},
      }
    },
  }
}
