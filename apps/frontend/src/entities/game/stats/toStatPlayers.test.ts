import type { PlayerTally } from '@release/engine'
import type { PeerInfo } from '~/network'
import { toStatPlayers } from './toStatPlayers'

const tally = (over: Partial<PlayerTally> = {}): PlayerTally => ({
  attack: 0,
  defense: 0,
  ddos: 0,
  ai: 0,
  err503: 0,
  cherryPick: 0,
  attackedInto: 0,
  ...over,
})

const seats = [
  { playerId: 'p1', peerId: 'peer-a', name: 'Ann' },
  { playerId: 'p2', peerId: 'peer-b', name: 'Bo' },
]

const peers: Record<string, PeerInfo> = {
  'peer-a': { id: 'peer-a', name: 'Ann', role: 'host', ready: true, where: 'stats' },
  'peer-b': { id: 'peer-b', name: 'Bo', role: 'player', ready: true, where: 'lobby' },
}

it('rows are keyed by peer id, never by the engine seat id', () => {
  // PlayerId and peer id are both `string`, which is exactly what hides a
  // mix-up. The screen resolves winnerId and selfId against peer ids, so a row
  // carrying 'p1' would silently match nobody.
  const rows = toStatPlayers({ tally: { p1: tally(), p2: tally() }, seats, peers })
  expect(rows.map((r) => r.id)).toEqual(['peer-a', 'peer-b'])
})

it('carries the counters of each seat onto its row', () => {
  const rows = toStatPlayers({
    tally: { p1: tally({ attack: 5, ddos: 2, attackedInto: 4 }), p2: tally({ defense: 3 }) },
    seats,
    peers,
  })
  expect(rows[0]).toMatchObject({ attack: 5, ddos: 2, attackedInto: 4 })
  expect(rows[1]).toMatchObject({ defense: 3 })
})

it('reads player locations from the roster', () => {
  const rows = toStatPlayers({ tally: { p1: tally(), p2: tally() }, seats, peers })
  expect(rows.map((r) => r.location)).toEqual(['stats', 'lobby'])
})

it('keeps the row of a player who left, and calls them offline', () => {
  // They played the match. Dropping the row would rewrite its history to
  // exclude someone who was there.
  const rows = toStatPlayers({
    tally: { p1: tally(), p2: tally({ attack: 9 }) },
    seats,
    peers: { 'peer-a': peers['peer-a'] },
  })
  expect(rows).toHaveLength(2)
  expect(rows[1]).toMatchObject({ id: 'peer-b', name: 'Bo', location: 'offline', attack: 9 })
})

it('names a departed player from the seat, since the roster no longer can', () => {
  const rows = toStatPlayers({ tally: { p1: tally(), p2: tally() }, seats, peers: {} })
  expect(rows.map((r) => r.name)).toEqual(['Ann', 'Bo'])
})

it('gives a seat with no counters a row of zeros rather than dropping it', () => {
  const rows = toStatPlayers({ tally: {}, seats, peers })
  expect(rows).toHaveLength(2)
  expect(rows[0]).toMatchObject({
    attack: 0,
    defense: 0,
    ddos: 0,
    ai: 0,
    err503: 0,
    cherryPick: 0,
    attackedInto: 0,
  })
})

it('has no rows when nobody was seated', () => {
  expect(toStatPlayers({ tally: {}, seats: [], peers })).toEqual([])
})
