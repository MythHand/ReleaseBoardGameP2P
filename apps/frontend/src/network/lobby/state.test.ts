import {
  applyConfig,
  applyPeerJoined,
  applyPeerLeft,
  applyPeerList,
  assignRole,
  createLobbyState,
  playerCount,
} from './state'

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

it('createLobbyState defaults setup to empty record', () => {
  const s = createLobbyState({ selfId: 'h', hostId: 'h', maxPlayers: 4, peers: [] })
  expect(s.setup).toEqual({})
})

it('createLobbyState uses provided setup', () => {
  const setup = { handLimit: 'base', releases: 'fast' }
  const s = createLobbyState({ selfId: 'h', hostId: 'h', maxPlayers: 4, setup, peers: [] })
  expect(s.setup).toEqual(setup)
})

it('applyConfig updates maxPlayers, preserves setup', () => {
  const s = createLobbyState({
    selfId: 'h',
    hostId: 'h',
    maxPlayers: 4,
    setup: { handLimit: 'base' },
    peers: [],
  })
  const next = applyConfig(s, { maxPlayers: 6 })
  expect(next.maxPlayers).toBe(6)
  expect(next.setup).toEqual({ handLimit: 'base' })
})

it('applyConfig updates setup, preserves maxPlayers', () => {
  const s = createLobbyState({
    selfId: 'h',
    hostId: 'h',
    maxPlayers: 4,
    setup: { handLimit: 'base' },
    peers: [],
  })
  const next = applyConfig(s, { setup: { handLimit: 'memory' } })
  expect(next.maxPlayers).toBe(4)
  expect(next.setup).toEqual({ handLimit: 'memory' })
})

it('applyPeerList preserves setup', () => {
  const setup = { handLimit: 'fast' }
  const host = { id: 'h', name: 'Host', role: 'host' as const, ready: false }
  const s = createLobbyState({ selfId: 'h', hostId: 'h', maxPlayers: 4, setup, peers: [host] })
  const next = applyPeerList(s, [host])
  expect(next.setup).toEqual(setup)
})
