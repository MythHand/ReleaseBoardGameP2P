import { isRelayable, relayTargets } from './relay'

it('never forwards a message a guest would read as the host`s word', () => {
  expect(isRelayable('PLAYER_KICKED')).toBe(false)
  expect(isRelayable('PEER_LIST')).toBe(false)
  expect(isRelayable('LOBBY_DISBANDED')).toBe(false)
})

it('forwards the game traffic a keeper behind the host depends on', () => {
  expect(isRelayable('INTENT')).toBe(true)
  expect(isRelayable('SYNC')).toBe(true)
  expect(isRelayable('KEEPER_CHANGED')).toBe(true)
})

it('forwards to all peers except the sender and the host', () => {
  const targets = relayTargets({ connectedPeerIds: ['h', 'a', 'b', 'c'], hostId: 'h', from: 'a' })
  expect(targets.sort()).toEqual(['b', 'c'])
})

it('returns empty when sender is the only non-host peer', () => {
  expect(relayTargets({ connectedPeerIds: ['h', 'a'], hostId: 'h', from: 'a' })).toEqual([])
})
