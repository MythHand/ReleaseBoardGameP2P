import {
  applyConfig,
  applyPeerJoined,
  applyPeerLeft,
  applyPeerList,
  assignRole,
  createLobbyState,
  effectiveBots,
  type LobbyState,
  playerCount,
} from './state'

const host = {
  id: 'h',
  clientId: 'client-h',
  name: 'Host',
  role: 'host' as const,
  ready: false,
  where: 'lobby' as const,
}

function base(maxPlayers: number) {
  return createLobbyState({ selfId: 'h', hostId: 'h', maxPlayers, peers: [host] })
}

it('counts host + players, not guests', () => {
  let s = base(4)
  s = applyPeerJoined(s, {
    id: 'p1',
    clientId: 'client-p1',
    name: 'P1',
    role: 'player',
    ready: false,
    where: 'lobby',
  })
  s = applyPeerJoined(s, {
    id: 'g1',
    clientId: 'client-g1',
    name: 'G1',
    role: 'guest',
    ready: false,
    where: 'lobby',
  })
  expect(playerCount(s)).toBe(2)
})

it('assigns player while slots remain, guest once full', () => {
  let s = base(2) // host occupies 1 of 2 slots
  expect(assignRole(s)).toBe('player')
  s = applyPeerJoined(s, {
    id: 'p1',
    clientId: 'client-p1',
    name: 'P1',
    role: 'player',
    ready: false,
    where: 'lobby',
  })
  expect(assignRole(s)).toBe('guest') // 2 players, max 2
})

it('removes a peer on leave', () => {
  let s = base(4)
  s = applyPeerJoined(s, {
    id: 'p1',
    clientId: 'client-p1',
    name: 'P1',
    role: 'player',
    ready: false,
    where: 'lobby',
  })
  s = applyPeerLeft(s, 'p1')
  expect(s.peers.p1).toBeUndefined()
})

it('does not mutate the input state', () => {
  const s = base(4)
  const next = applyPeerJoined(s, {
    id: 'p1',
    clientId: 'client-p1',
    name: 'P1',
    role: 'player',
    ready: false,
    where: 'lobby',
  })
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
  const hostPeer = {
    id: 'h',
    clientId: 'client-h',
    name: 'Host',
    role: 'host' as const,
    ready: false,
    where: 'lobby' as const,
  }
  const s = createLobbyState({ selfId: 'h', hostId: 'h', maxPlayers: 4, setup, peers: [hostPeer] })
  const next = applyPeerList(s, [hostPeer])
  expect(next.setup).toEqual(setup)
})

// The bug this closes: applyPeerList rebuilds through createLobbyState, whose
// `bots` defaults to 0 when the argument is omitted — so a guest's count
// silently reset to 0 on every PEER_LIST, undoing whatever
// LOBBY_CONFIG_UPDATED had told it moments earlier.
it('applyPeerList preserves bots', () => {
  const hostPeer = {
    id: 'h',
    clientId: 'client-h',
    name: 'Host',
    role: 'host' as const,
    ready: false,
    where: 'lobby' as const,
  }
  const s = createLobbyState({
    selfId: 'h',
    hostId: 'h',
    maxPlayers: 4,
    bots: 2,
    peers: [hostPeer],
  })
  const next = applyPeerList(s, [hostPeer])
  expect(next.bots).toBe(2)
})

const table = (maxPlayers: number, bots: number, humans: number): LobbyState =>
  createLobbyState({
    selfId: 'h',
    hostId: 'h',
    maxPlayers,
    bots,
    peers: Array.from({ length: humans }, (_, i) => ({
      id: i === 0 ? 'h' : `p${i}`,
      clientId: `c${i}`,
      name: `P${i}`,
      role: i === 0 ? ('host' as const) : ('player' as const),
      ready: true,
      where: 'lobby' as const,
    })),
  })

it('defaults to no bots', () => {
  expect(table(6, 0, 1).bots).toBe(0)
})

// The ceiling, which is the whole displacement policy: people take the seats
// first, and the number says how many of whatever is left should be bots.
it('gives only the seats people have not taken', () => {
  expect(effectiveBots(table(6, 3, 1))).toBe(3)
  expect(effectiveBots(table(6, 3, 4))).toBe(2)
  expect(effectiveBots(table(6, 3, 6))).toBe(0)
})

// Asked-for is remembered, so a seat freed by someone leaving comes back as a
// bot without the host touching the slider.
it('remembers what was asked for when the table frees up again', () => {
  const full = table(6, 3, 6)
  expect(effectiveBots(full)).toBe(0)
  expect(effectiveBots({ ...full, peers: table(6, 3, 4).peers })).toBe(2)
})

it('never returns a negative count when capacity is below the people present', () => {
  expect(effectiveBots(table(2, 3, 4))).toBe(0)
})

it('carries bots through applyConfig', () => {
  expect(applyConfig(table(6, 0, 1), { bots: 2 }).bots).toBe(2)
  // An absent key leaves the field alone, exactly as maxPlayers and setup do.
  expect(applyConfig(table(6, 2, 1), { setup: {} }).bots).toBe(2)
})
