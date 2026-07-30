import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from '@release/engine/fake'
import type { Sync } from './link'
import { createMemoryNetwork } from './memoryNetwork'
import { createSession, type SessionRef } from './referee'
import { attachKeeper, createRemoteLink } from './remoteLink'

function twoPeerGame() {
  const net = createMemoryNetwork(['peer-a', 'peer-b'])
  const { session } = createSession({
    gameId: 'g1',
    keeperId: 'a',
    engine: createFakeEngine(),
    seed: 3,
    players: [
      { playerId: 'a', peerId: 'peer-a', name: 'Ann' },
      { playerId: 'b', peerId: 'peer-b', name: 'Bo' },
    ],
    setup: {},
    deck: FAKE_DECK,
    events: FAKE_EVENTS,
  })
  const ref: SessionRef = { current: session }
  let clock = 1_000
  const keeper = attachKeeper({
    ref,
    transport: net.transport('peer-a'),
    now: () => (clock += 100),
    ticker: { start: () => {}, stop: () => {} },
  })
  const remote = createRemoteLink({ transport: net.transport('peer-b'), keeperId: 'peer-a' })
  net.onDeliver('peer-b', (frame) => remote.handleMessage(frame))
  net.onDeliver('peer-a', (frame) => keeper.handleMessage(frame))
  return { net, ref, remote: remote.link }
}

it('carries a remote peer`s intent to the keeper and its view back', () => {
  const { ref, remote } = twoPeerGame()
  const seen: Sync[] = []
  remote.subscribe((sync) => seen.push(sync))

  // 'b' does not hold the turn, so this must come back as a rejection —
  // proving the round trip without depending on the deal.
  remote.submit({ type: 'DRAW' })

  expect(seen).toHaveLength(1)
  expect(seen[0].view.self.id).toBe('b')
  expect(seen[0].events.map((e) => e.type)).toEqual(['rejected'])
  expect(ref.current.state.turn.player).toBe('a')
})

it('sends a remote peer only its own projection', () => {
  const { ref, remote } = twoPeerGame()
  const seen: Sync[] = []
  remote.subscribe((sync) => seen.push(sync))

  remote.submit({ type: 'PASS' })

  const handA = ref.current.state.players.a.hand.map((c) => c.uid)
  const wire = JSON.stringify(seen)
  for (const uid of handA) expect(wire).not.toContain(uid)
})
