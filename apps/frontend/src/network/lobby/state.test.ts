import { applyPeerJoined, applyPeerLeft, assignRole, createLobbyState, playerCount } from './state'

const host = { id: 'h', name: 'Host', role: 'host' as const, ready: false }

function base(maxPlayers: number) {
  return createLobbyState({ selfId: 'h', hostId: 'h', maxPlayers, peers: [host] })
}

it('counts host + players, not guests', () => {
  let s = base(4)
  s = applyPeerJoined(s, { id: 'p1', name: 'P1', role: 'player', ready: false })
  s = applyPeerJoined(s, { id: 'g1', name: 'G1', role: 'guest', ready: false })
  expect(playerCount(s)).toBe(2)
})

it('assigns player while slots remain, guest once full', () => {
  let s = base(2) // host occupies 1 of 2 slots
  expect(assignRole(s)).toBe('player')
  s = applyPeerJoined(s, { id: 'p1', name: 'P1', role: 'player', ready: false })
  expect(assignRole(s)).toBe('guest') // 2 players, max 2
})

it('removes a peer on leave', () => {
  let s = base(4)
  s = applyPeerJoined(s, { id: 'p1', name: 'P1', role: 'player', ready: false })
  s = applyPeerLeft(s, 'p1')
  expect(s.peers.p1).toBeUndefined()
})

it('does not mutate the input state', () => {
  const s = base(4)
  const next = applyPeerJoined(s, { id: 'p1', name: 'P1', role: 'player', ready: false })
  expect(s.peers.p1).toBeUndefined()
  expect(next).not.toBe(s)
})
