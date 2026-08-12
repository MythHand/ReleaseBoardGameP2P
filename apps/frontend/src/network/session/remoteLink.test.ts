import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from '@release/engine/fake'
import type { WireMessage } from '../types'
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
  const remote = createRemoteLink({ transport: net.transport('peer-b'), keeperPeerId: 'peer-a' })
  net.onDeliver('peer-b', (frame) => remote.handleMessage(frame))
  net.onDeliver('peer-a', (frame) => keeper.handleMessage(frame))
  return { net, ref, keeper, remote, link: remote.link }
}

it('carries a remote peer`s intent to the keeper and its view back', () => {
  const { ref, link } = twoPeerGame()
  const seen: Sync[] = []
  link.subscribe((sync) => seen.push(sync))

  // 'b' does not hold the turn, so this must come back as a rejection —
  // proving the round trip without depending on the deal.
  link.submit({ type: 'DRAW' })

  expect(seen).toHaveLength(1)
  expect(seen[0].view.self.id).toBe('b')
  expect(seen[0].events.map((e) => e.type)).toEqual(['rejected'])
  expect(ref.current.state.turn.player).toBe('a')
})

it('sends a remote peer only its own projection', () => {
  const { ref, link } = twoPeerGame()
  const seen: Sync[] = []
  link.subscribe((sync) => seen.push(sync))

  link.submit({ type: 'PASS' })

  const handA = ref.current.state.players.a.hand.map((c) => c.uid)
  const wire = JSON.stringify(seen)
  for (const uid of handA) expect(wire).not.toContain(uid)
})

it('drives the keeper`s own seat through its link, with no connection to itself', () => {
  // The keeper is a player too. A self-addressed `send` is dropped by PeerJS
  // (`connections.get(self)` is undefined), so if this seat had to go over the
  // transport the host could never take its own turn and every other player
  // would wait on it forever — `driveAbsent` never covers a seat that is
  // *connected*.
  const { ref, keeper } = twoPeerGame()
  const seen: Sync[] = []
  keeper.link.subscribe((sync) => seen.push(sync))

  keeper.link.submit({ type: 'DRAW' })

  expect(ref.current.state.turn.drawnFrom).not.toEqual([])
  expect(seen).toHaveLength(1)
  expect(seen[0].view.self.id).toBe('a')
})

it('ignores a SYNC that did not come from the keeper', () => {
  // A forged SYNC would replace a victim's whole view with cards of the
  // attacker's choosing, so their real actions come back rejected against a
  // board they cannot see.
  const { net, link } = twoPeerGame()
  const seen: Sync[] = []
  link.subscribe((sync) => seen.push(sync))

  net.transport('peer-c').send('peer-b', {
    type: 'SYNC',
    payload: { view: { self: { id: 'b' } } as never, events: [] },
  })

  expect(seen).toEqual([])
})

it('ignores a KEEPER_CHANGED that did not come from the keeper', () => {
  // `keeperId: null` is the death notice: honouring a forged one would drop
  // every player to the Reconnect screen and end the game mid-play.
  const net = createMemoryNetwork(['peer-a', 'peer-b', 'peer-c'])
  const changes: (string | null)[] = []
  const remote = createRemoteLink({
    transport: net.transport('peer-b'),
    keeperPeerId: 'peer-a',
    onKeeperChanged: (id) => changes.push(id),
  })
  net.onDeliver('peer-b', (frame) => remote.handleMessage(frame))

  net.transport('peer-c').send('peer-b', { type: 'KEEPER_CHANGED', payload: { keeperId: null } })
  expect(changes).toEqual([])

  net.transport('peer-a').send('peer-b', { type: 'KEEPER_CHANGED', payload: { keeperId: 'c' } })
  expect(changes).toEqual(['c'])
})

it('re-points at the successor once the caller resolves its peer id', () => {
  // KEEPER_CHANGED announces a `PlayerId` and `submit` addresses a peer id, so
  // the announcement alone cannot move the link: without `setKeeper` every
  // intent would keep going to the deposed keeper, or to nobody at all once it
  // left.
  const net = createMemoryNetwork(['peer-a', 'peer-b', 'peer-c'])
  const atC: WireMessage[] = []
  const remote = createRemoteLink({ transport: net.transport('peer-b'), keeperPeerId: 'peer-a' })
  net.onDeliver('peer-c', (frame) => atC.push(frame))

  remote.link.submit({ type: 'DRAW' })
  expect(atC).toEqual([])

  remote.setKeeper('peer-c')
  remote.link.submit({ type: 'DRAW' })

  expect(atC.map((f) => f.type)).toEqual(['INTENT'])
})

it('stops answering intents once it has handed the session over', () => {
  // Two keepers answering one table is worse than none: a move applied here
  // never reaches the successor, and the two SYNC streams contradict each
  // other on every peer whose link has not been re-pointed yet.
  const { ref, keeper, remote } = twoPeerGame()
  const before = ref.current

  keeper.handover('b')
  remote.link.submit({ type: 'DRAW' })

  expect(ref.current.keeperId).toBe('b')
  expect(ref.current.state).toBe(before.state)
})

it('drops a frame whose payload the envelope never validated', () => {
  // `parseEnvelope` checks type/from/seq and nothing else, so the payload is
  // whatever the connection carried — including nothing at all.
  const { ref, keeper } = twoPeerGame()
  const before = ref.current

  expect(() =>
    keeper.handleMessage({ type: 'INTENT', from: 'peer-b', seq: 1 } as WireMessage),
  ).not.toThrow()
  expect(() =>
    keeper.handleMessage({
      type: 'INTENT',
      payload: { intent: null },
      from: 'peer-b',
      seq: 2,
    } as unknown as WireMessage),
  ).not.toThrow()

  expect(ref.current).toBe(before)
})

it('never hands a subscriber a SYNC with no view in it', () => {
  const { net, link } = twoPeerGame()
  const seen: Sync[] = []
  link.subscribe((sync) => seen.push(sync))

  net.transport('peer-a').send('peer-b', { type: 'SYNC' } as never)

  expect(seen).toEqual([])
})

it('deals every seat its opening hand without anyone acting first', () => {
  const { keeper, link } = twoPeerGame()
  const remoteSeen: Sync[] = []
  const keeperSeen: Sync[] = []
  link.subscribe((sync) => remoteSeen.push(sync))
  keeper.link.subscribe((sync) => keeperSeen.push(sync))

  // Nobody has submitted anything. Without resync the table sits empty until
  // someone clicks, which is not a game.
  keeper.resync()

  expect(remoteSeen).toHaveLength(1)
  expect(keeperSeen).toHaveLength(1)
  expect(remoteSeen[0].view.self.id).toBe('b')
  expect(keeperSeen[0].view.self.id).toBe('a')
  expect(remoteSeen[0].view.self.hand.length).toBeGreaterThan(0)
  expect(keeperSeen[0].view.self.hand.length).toBeGreaterThan(0)
  // A statement of position, not a replay.
  expect(remoteSeen[0].events).toEqual([])
})

it('still sends each seat only its own hand on a resync', () => {
  const { ref, keeper, link } = twoPeerGame()
  const seen: Sync[] = []
  link.subscribe((sync) => seen.push(sync))

  keeper.resync()

  // The same guarantee the per-intent fan-out gives: none of a's card instances
  // may appear anywhere in what b receives.
  const handA = ref.current.state.players.a.hand.map((c) => c.uid)
  const wire = JSON.stringify(seen)
  expect(handA.length).toBeGreaterThan(0)
  for (const uid of handA) expect(wire).not.toContain(uid)
})
