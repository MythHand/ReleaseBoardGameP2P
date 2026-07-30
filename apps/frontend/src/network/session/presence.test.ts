import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from '@release/engine/fake'
import {
  ABSENT_GRACE_MS,
  applyIntent,
  createSession,
  disconnect,
  driveAbsent,
  rebind,
  type Session,
} from './referee'

function session(): Session {
  return createSession({
    gameId: 'g1',
    keeperId: 'a',
    engine: createFakeEngine(),
    seed: 7,
    players: [
      { playerId: 'a', peerId: 'peer-a', name: 'Ann' },
      { playerId: 'b', peerId: 'peer-b', name: 'Bo' },
    ],
    setup: {},
    deck: FAKE_DECK,
    events: FAKE_EVENTS,
  }).session
}

it('keeps the seat when its connection drops', () => {
  const after = disconnect(session(), 'peer-b', 1_000).session
  const seat = after.seats.find((s) => s.playerId === 'b')

  expect(seat).toMatchObject({ playerId: 'b', peerId: null, absentSince: 1_000 })
  expect(after.state.players.b.hand.length).toBeGreaterThan(0)
})

it('stops syncing a disconnected seat', () => {
  const after = disconnect(session(), 'peer-b', 1_000).session
  const { outgoing } = applyIntent(after, 'peer-a', { type: 'DRAW' }, 1_100)

  expect(outgoing.map((o) => o.to)).toEqual(['peer-a'])
})

it('restores the seat on reconnect with one fresh SYNC', () => {
  const dropped = disconnect(session(), 'peer-b', 1_000).session
  const { session: back, outgoing } = rebind(dropped, 'b', 'peer-b-2')
  const seat = back.seats.find((s) => s.playerId === 'b')
  const sync = outgoing[0]

  expect(seat).toMatchObject({ peerId: 'peer-b-2', absentSince: null })
  expect(outgoing).toHaveLength(1)
  expect(sync.to).toBe('peer-b-2')
  expect(sync.message.type).toBe('SYNC')
  if (sync.message.type === 'SYNC') expect(sync.message.payload.view.self.id).toBe('b')
})

it('leaves an absent seat alone inside the grace period', () => {
  const dropped = disconnect(session(), 'peer-a', 1_000).session
  const result = driveAbsent(dropped, 1_000 + ABSENT_GRACE_MS - 1)

  expect(result.session).toBe(dropped)
})

it('drives an absent seat once the grace period expires, so the game cannot stall', () => {
  // 'a' holds the turn and vanishes: without the keeper acting, nothing can
  // ever advance and every other player waits forever.
  const dropped = disconnect(session(), 'peer-a', 1_000).session
  const result = driveAbsent(dropped, 1_000 + ABSENT_GRACE_MS + 1)

  expect(result.session.state).not.toBe(dropped.state)
})
