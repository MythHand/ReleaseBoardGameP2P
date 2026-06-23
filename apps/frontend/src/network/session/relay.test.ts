import { relayTargets } from './relay'

it('forwards to all peers except the sender and the host', () => {
  const targets = relayTargets({ connectedPeerIds: ['h', 'a', 'b', 'c'], hostId: 'h', from: 'a' })
  expect(targets.sort()).toEqual(['b', 'c'])
})

it('returns empty when sender is the only non-host peer', () => {
  expect(relayTargets({ connectedPeerIds: ['h', 'a'], hostId: 'h', from: 'a' })).toEqual([])
})
