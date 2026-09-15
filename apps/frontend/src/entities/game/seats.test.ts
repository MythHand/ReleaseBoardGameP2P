import type { PeerInfo } from '~/network'
import { botSeats, seatOf, seatsFor } from './seats'

const peer = (
  id: string,
  name: string,
  role: PeerInfo['role'],
  clientId = `client-${id}`,
): PeerInfo => ({
  id,
  clientId,
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

it('carries each peer clientId onto the seat it is dealt', () => {
  const seats = seatsFor(
    roster(peer('peer-a', 'Ann', 'host', 'client-a'), peer('peer-b', 'Bo', 'player', 'client-b')),
  )
  expect(seats).toEqual([
    { playerId: 'p1', peerId: 'peer-a', clientId: 'client-a', name: 'Ann' },
    { playerId: 'p2', peerId: 'peer-b', clientId: 'client-b', name: 'Bo' },
  ])
})

// Bot seats continue the same p1..pN sequence the humans are numbered in,
// because the engine seats a table, not two kinds of player.
it('numbers bot seats after the humans', () => {
  const seats = botSeats(2, 3, ['Бот 1', 'Бот 2'])
  expect(seats.map((s) => s.playerId)).toEqual(['p4', 'p5'])
  expect(seats.map((s) => s.name)).toEqual(['Бот 1', 'Бот 2'])
  expect(seats.every((s) => s.bot)).toBe(true)
})

// A bot holds no connection, so its ids exist only to be a stable key. They
// carry a colon so they can never collide with a PeerJS id, which is drawn
// from an alphabet that has none.
it('gives a bot an address nothing can dial', () => {
  const [seat] = botSeats(1, 1, ['Бот 1'])
  expect(seat.peerId).toContain(':')
  expect(seat.peerId).toBe(seat.clientId)
})

it('asks for no seats when no bots were asked for', () => {
  expect(botSeats(0, 2, [])).toEqual([])
})
