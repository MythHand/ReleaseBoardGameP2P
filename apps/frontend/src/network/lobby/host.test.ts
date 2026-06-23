import { canStart, handleJoinRequest, handleReady, kick, setMaxPlayers } from './host'
import { createLobbyState } from './state'

const host = { id: 'h', name: 'Host', role: 'host' as const, ready: true }

function base(maxPlayers: number) {
  return createLobbyState({ selfId: 'h', hostId: 'h', maxPlayers, peers: [host] })
}

it('assigns player role and emits PEER_LIST + PEER_JOINED', () => {
  const { state, outgoing } = handleJoinRequest(base(4), 'p1', 'Pam')
  expect(state.peers.p1.role).toBe('player')

  const list = outgoing.find((o) => o.message.type === 'PEER_LIST')
  expect(list?.to).toBe('p1')
  expect(list?.message.type === 'PEER_LIST' && list.message.payload.yourRole).toBe('player')

  const joined = outgoing.find((o) => o.message.type === 'PEER_JOINED')
  expect(joined?.to).toBe('broadcast')
  expect(joined?.message.type === 'PEER_JOINED' && joined.message.payload.ready).toBe(false)
})

it('handleReady broadcasts PEER_JOINED with ready: true', () => {
  const joined = handleJoinRequest(base(4), 'p1', 'Pam').state
  const { outgoing } = handleReady(joined, 'p1')
  const broadcast = outgoing.find((o) => o.message.type === 'PEER_JOINED')
  expect(broadcast?.to).toBe('broadcast')
  expect(broadcast?.message.type === 'PEER_JOINED' && broadcast.message.payload.ready).toBe(true)
})

it('assigns guest when player slots are full', () => {
  const { state } = handleJoinRequest(base(2), 'p1', 'Pam') // host fills 1, p1 fills 2
  const second = handleJoinRequest(state, 'p2', 'Pat')
  expect(second.state.peers.p2.role).toBe('guest')
})

it('kick removes the peer and broadcasts PLAYER_KICKED', () => {
  const joined = handleJoinRequest(base(4), 'p1', 'Pam').state
  const { state, outgoing } = kick(joined, 'p1', 'afk')
  expect(state.peers.p1).toBeUndefined()
  expect(outgoing[0].message).toEqual({
    type: 'PLAYER_KICKED',
    payload: { peerId: 'p1', reason: 'afk' },
  })
  expect(outgoing[0].to).toBe('broadcast')
})

it('setMaxPlayers clamps to 2..6', () => {
  expect(setMaxPlayers(base(4), 9).state.maxPlayers).toBe(6)
  expect(setMaxPlayers(base(4), 1).state.maxPlayers).toBe(2)
})

it('canStart requires >=2 players all ready', () => {
  const onePlayer = base(4)
  expect(canStart(onePlayer)).toBe(false) // only host
  const withReady = handleJoinRequest(onePlayer, 'p1', 'Pam').state
  expect(canStart(withReady)).toBe(false) // p1 not ready
  withReady.peers.p1.ready = true
  expect(canStart(withReady)).toBe(true)
})
