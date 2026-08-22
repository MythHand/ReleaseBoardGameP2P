import { emptyTally, type PlayerId, type PlayerTally } from '@release/engine'
import type { StatPlayer } from '@release/ui'
import type { Seat } from '~/entities/game/seats'
import type { PeerInfo } from '~/network'

// The results screen's rows. This module owns the one crossing that matters
// here: the engine names seats p1..pN and the roster is keyed by peer id, and
// both are `string`, so a swap addresses nobody and says nothing (the same trap
// the board's winner lookup carries a paragraph about). Every row leaves here
// wearing a PEER id, because that is what `winnerId` and `selfId` are compared
// against on the screen.
//
// Seats, not peers, are what the table is built from: a peer that has left the
// roster still played the match, so its row survives its connection.
export function toStatPlayers(args: {
  tally: Record<PlayerId, PlayerTally>
  seats: Seat[]
  peers: Record<string, PeerInfo>
}): StatPlayer[] {
  return args.seats.map((seat) => {
    const peer = args.peers[seat.peerId]
    const counts = args.tally[seat.playerId] ?? emptyTally()
    return {
      id: seat.peerId,
      // The roster's name is the live one; the seat's is what the match was
      // played under, and the only one left once a peer is gone.
      name: peer?.name ?? seat.name,
      // Absence IS the offline signal — nobody announces their own
      // disconnection, so `where` has no such member to read.
      location: peer?.where ?? 'offline',
      ...counts,
    }
  })
}
