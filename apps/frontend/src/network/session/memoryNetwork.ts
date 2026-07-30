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
