import type { PeerInfo } from '~/network'
import { privateSeatsFor, publicSeats, seatOf, seatsFor } from './seats'

const peer = (id: string, name: string, role: PeerInfo['role']): PeerInfo => ({
  id,
  name,
  role,
  ready: true,
  where: 'lobby',
})

const roster = (...list: PeerInfo[]): Record<string, PeerInfo> =>
  Object.fromEntries(list.map((p) => [p.id, p]))

it('seats players and leaves spectators standing', () => {
  const seats = seatsFor(
    roster(
      peer('peer-a', 'Ann', 'host'),
      peer('peer-b', 'Bo', 'player'),
      peer('peer-c', 'Cid', 'guest'),
    ),
  )
  expect(seats.map((s) => s.name)).toEqual(['Ann', 'Bo'])
  // A spectator has no seat at all — not a seat that happens to be empty.
  expect(seats.some((s) => s.peerId === 'peer-c')).toBe(false)
})

it('mints player ids that could never be mistaken for peer ids', () => {
  const seats = seatsFor(roster(peer('peer-a', 'Ann', 'host'), peer('peer-b', 'Bo', 'player')))
  expect(seats.map((s) => s.playerId)).toEqual(['p1', 'p2'])
  // The whole point: passing one where the other belongs must look wrong.
  for (const s of seats) expect(s.playerId).not.toBe(s.peerId)
})

it('carries each seat back to the peer that holds it', () => {
  const seats = seatsFor(roster(peer('peer-a', 'Ann', 'host'), peer('peer-b', 'Bo', 'player')))
  expect(seatOf(seats, 'peer-b')?.playerId).toBe('p2')
  expect(seatOf(seats, 'peer-b')?.name).toBe('Bo')
})

it('gives a spectator no seat to sit in', () => {
  const seats = seatsFor(roster(peer('peer-a', 'Ann', 'host'), peer('peer-c', 'Cid', 'guest')))
  expect(seatOf(seats, 'peer-c')).toBeNull()
})

it('seats the same roster the same way however it is enumerated', () => {
  const a = peer('peer-a', 'Ann', 'host')
  const b = peer('peer-b', 'Bo', 'player')
  const c = peer('peer-c', 'Cid', 'player')
  // Insertion order differs; the seating must not, or a re-render could move a
  // player between seats mid-game.
  expect(seatsFor(roster(a, b, c))).toEqual(seatsFor(roster(c, a, b)))
})

it('builds host-private seats and strips credentials for the wire', () => {
  const peers = roster(peer('peer-a', 'Ann', 'host'))
  const seats = seatsFor(peers)
  const privateSeats = privateSeatsFor(seats, new Map([['peer-a', 'resume-a']]))
  expect(privateSeats[0]).toEqual({
    seat: { playerId: 'p1', peerId: 'peer-a', name: 'Ann' },
    resumeToken: 'resume-a',
  })
  expect(publicSeats(privateSeats)[0]).toEqual({ playerId: 'p1', peerId: 'peer-a', name: 'Ann' })
})

it('refuses to start with a player whose private credential is missing', () => {
  const peers = roster(peer('peer-a', 'Ann', 'host'))
  expect(() => privateSeatsFor(seatsFor(peers), new Map())).toThrow('missing resume token')
})

it('refuses to start with duplicate private credentials', () => {
  const peers = roster(peer('peer-a', 'Ann', 'host'), peer('peer-b', 'Bo', 'player'))
  expect(() =>
    privateSeatsFor(
      seatsFor(peers),
      new Map([
        ['peer-a', 'duplicate-token'],
        ['peer-b', 'duplicate-token'],
      ]),
    ),
  ).toThrow('duplicate resume token')
})
