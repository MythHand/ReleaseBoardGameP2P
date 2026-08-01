import type { PlayerId } from '@release/engine'
import type { PeerInfo } from '~/network'

export interface Seat {
  playerId: PlayerId
  peerId: string
  name: string
}

// PlayerId and peer id are distinct spaces that are both `string`, which is
// exactly what hides a mix-up (network/session/remoteLink.ts:34). Minting
// `p1…pN` rather than reusing the peer id keeps them visibly different, so a
// swap addresses an obviously wrong seat instead of quietly working.
const seatId = (index: number): PlayerId => `p${index + 1}`

// Who sits down, in the order the referee will seat them. Spectators are not
// players and get no seat — they watch through the roster, not the engine.
// The host computes this alone and every other peer learns its seat from the
// SYNC it receives, so no cross-peer agreement on ordering is required; sorting
// by peer id only keeps a single host's seating stable across re-renders.
export function seatsFor(peers: Record<string, PeerInfo>): Seat[] {
  return Object.values(peers)
    .filter((p) => p.role === 'host' || p.role === 'player')
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((p, i) => ({ playerId: seatId(i), peerId: p.id, name: p.name }))
}

// The seat a given peer got, or null if it is watching rather than playing.
export function seatOf(seats: Seat[], peerId: string): Seat | null {
  return seats.find((s) => s.peerId === peerId) ?? null
}
