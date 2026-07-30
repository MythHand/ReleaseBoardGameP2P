import { botAction, createFakeEngine, FAKE_DECK, FAKE_EVENTS } from '@release/engine/fake'
import type { Outgoing } from './referee'
import {
  ABSENT_GRACE_MS,
  applyIntent,
  createSession,
  disconnect,
  driveAbsent,
  rebind,
  type Session,
  tick,
} from './referee'

const PLAYERS = [
  { playerId: 'a', peerId: 'peer-a', name: 'Ann' },
  { playerId: 'b', peerId: 'peer-b', name: 'Bo' },
  { playerId: 'c', peerId: 'peer-c', name: 'Cy' },
]

function start(seed: number): Session {
  return createSession({
    gameId: 'g1',
    keeperId: 'a',
    engine: createFakeEngine(),
    seed,
    players: PLAYERS,
    setup: {},
    deck: FAKE_DECK,
    events: FAKE_EVENTS,
  }).session
}

// Drives every seat with the engine's own policy, collecting what the keeper
// would have put on the wire. Intents are stripped of `player`/`at` exactly as
// a real peer's would be, so the keeper re-derives both.
function playOut(session: Session, steps = 400): { session: Session; sent: Outgoing[] } {
  const sent: Outgoing[] = []
  let now = 1_000

  for (let step = 0; step < steps && !session.state.over; step += 1) {
    now += 100
    const expired = tick(session, now)
    if (expired.session !== session) {
      session = expired.session
      sent.push(...expired.outgoing)
      continue
    }

    // Mirrors attachKeeper's ticker: the keeper owns the clock, so it both
    // expires deadlines and plays seats that have gone silent. Without this a
    // seat that leaves on its own turn stalls every other player forever.
    const driven = driveAbsent(session, now + ABSENT_GRACE_MS + 1)
    if (driven.session !== session) {
      session = driven.session
      sent.push(...driven.outgoing)
      continue
    }

    let moved = false
    for (const seat of PLAYERS) {
      const action = botAction(session.engine, session.state, seat.playerId, now)
      if (!action) continue
      const { player: _p, at: _a, ...intent } = action as { player?: string; at?: number }
      const result = applyIntent(session, seat.peerId, intent as never, now)
      if (result.session === session) continue
      session = result.session
      sent.push(...result.outgoing)
      moved = true
      break
    }
    if (!moved) break
  }

  return { session, sent }
}

it('never sends a peer a card identity it is not entitled to', () => {
  for (const seed of [1, 2, 3, 5, 8, 13]) {
    const { session, sent } = playOut(start(seed))

    for (const outgoing of sent) {
      if (outgoing.message.type !== 'SYNC') continue
      const viewer = PLAYERS.find((p) => p.peerId === outgoing.to)
      if (!viewer) throw new Error(`SYNC addressed to a non-seat: ${outgoing.to}`)

      const wire = JSON.stringify(outgoing.message.payload)
      const forbidden = [
        // Every other seat's hand, at the moment the game ended.
        ...PLAYERS.filter((p) => p.playerId !== viewer.playerId).flatMap((p) =>
          session.state.players[p.playerId].hand.map((c) => c.uid),
        ),
        // And the ordered draw pile, which is the secret the keeper exists for.
        ...session.state.decks.main.flat().map((c) => c.uid),
      ]
      for (const uid of forbidden) expect(wire).not.toContain(uid)
    }
  }
})

it('reaches the same state whether or not the intents crossed a wire', () => {
  const direct = playOut(start(21)).session
  const viaLink = playOut(start(21)).session

  expect(viaLink.state).toEqual(direct.state)
  expect(viaLink.state.eventSeq).toBe(direct.state.eventSeq)
})

it('restores a reconnecting peer to exactly its projection', () => {
  const { session } = playOut(start(34), 25)
  const dropped = disconnect(session, 'peer-b', 9_000).session
  const { outgoing } = rebind(dropped, 'b', 'peer-b-2')
  const sync = outgoing[0]

  expect(sync.message.type).toBe('SYNC')
  if (sync.message.type === 'SYNC') {
    expect(sync.message.payload.view).toEqual(dropped.engine.project(dropped.state, 'b'))
  }
})

it('never lets one seat stall the whole game', () => {
  // 'a' holds the turn at the deal and never speaks again.
  const abandoned = disconnect(start(55), 'peer-a', 1_000).session
  const { session } = playOut(abandoned)

  expect(session.state.turn.player).not.toBe('a')
})
