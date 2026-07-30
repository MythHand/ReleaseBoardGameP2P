import type { CardInstance } from '@release/engine'
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

// Three seats, so an absent seat that owes nothing (seated before the one
// that owes the actual pending action) can be told apart from one that does.
function threeSeatSession(): Session {
  return createSession({
    gameId: 'g2',
    keeperId: 'a',
    engine: createFakeEngine(),
    seed: 11,
    players: [
      { playerId: 'a', peerId: 'peer-a', name: 'Ann' },
      { playerId: 'b', peerId: 'peer-b', name: 'Bo' },
      { playerId: 'c', peerId: 'peer-c', name: 'Cy' },
    ],
    setup: {},
    deck: FAKE_DECK,
    events: FAKE_EVENTS,
  }).session
}

// Deal 'a' an exact one-card hand so this test is about the fallback rule,
// not about which seed happens to strand a seat this way. Matches
// packages/engine/src/fake/release.test.ts's own convention of overriding a
// dealt hand after `createGame` rather than hunting for a seed.
it('falls back to DRAW/PUSH when an absent seat holds the turn but its bot suggestion is rejected', () => {
  const release: CardInstance = { uid: 'release-frontend#0', id: 'release-frontend' }
  const created = session()
  // `setup: {}` (see `session()` above) means `releaseCond` isn't 'easy', so
  // playing a release costs a second card. `playableFor`
  // (packages/engine/src/fake/project.ts) lists a release as playable
  // without checking that cost, but `onPlay`
  // (packages/engine/src/fake/release.ts) rejects it when the hand holds
  // nothing else to pay with — the exact mismatch driveAbsent's fallback
  // exists to survive.
  const forced: Session = {
    ...created,
    state: {
      ...created.state,
      turn: { ...created.state.turn, player: 'a', hasDrawn: true },
      players: { ...created.state.players, a: { ...created.state.players.a, hand: [release] } },
    },
  }
  const dropped = disconnect(forced, 'peer-a', 1_000).session

  const result = driveAbsent(dropped, 1_000 + ABSENT_GRACE_MS + 1)

  // botAction's first (and only) suggestion for this hand is PLAY
  // release-frontend#0, which the engine rejects. Without the fallback,
  // driveAbsent gives up here — the "before" state in fix #1's
  // investigation. With it, the turn ends via PUSH (hasDrawn is already
  // true) and passes to 'b'.
  expect(result.session.state).not.toBe(dropped.state)
  expect(result.session.state.turn.player).toBe('b')
})

it('drives the absent seat that owes the action even when an earlier absent seat owes nothing', () => {
  // Rotate the turn from 'a' onto 'c' (a's and b's turns each end with a bare
  // draw + push, playing nothing) while every seat is still connected.
  let s = threeSeatSession()
  s = applyIntent(s, 'peer-a', { type: 'DRAW' }, 100).session
  s = applyIntent(s, 'peer-a', { type: 'PUSH' }, 101).session
  s = applyIntent(s, 'peer-b', { type: 'DRAW' }, 102).session
  s = applyIntent(s, 'peer-b', { type: 'PUSH' }, 103).session
  expect(s.state.turn.player).toBe('c')

  // Seat order is [a, b, c]: 'a' is absent but owes nothing (it is not their
  // turn and nothing is pending on them); 'c' — last in seating order — is
  // the one actually on turn and owes the game its next move.
  s = disconnect(s, 'peer-a', 1_000).session
  s = disconnect(s, 'peer-c', 1_000).session

  const result = driveAbsent(s, 1_000 + ABSENT_GRACE_MS + 1)

  expect(result.session.state).not.toBe(s.state)
})
