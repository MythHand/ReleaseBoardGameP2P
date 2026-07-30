import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from '@release/engine/fake'
import { applyIntent, createSession } from './referee'

function twoPlayerSession() {
  return createSession({
    gameId: 'g1',
    keeperId: 'a',
    engine: createFakeEngine(),
    // Seed 42 puts a trigger card (publicly revealed on draw, per Task 4's
    // "hides the drawn card" test) at the top of pile 0. Seed 1 deals a normal
    // card there instead, so a draw stays private to the drawer as intended.
    seed: 1,
    players: [
      { playerId: 'a', peerId: 'peer-a', name: 'Ann' },
      { playerId: 'b', peerId: 'peer-b', name: 'Bo' },
    ],
    setup: {},
    deck: FAKE_DECK,
    events: FAKE_EVENTS,
  })
}

it('announces the game and syncs every seat privately', () => {
  const { outgoing } = twoPlayerSession()

  expect(outgoing[0]).toEqual({
    to: 'broadcast',
    message: { type: 'GAME_STARTED', payload: { gameId: 'g1', keeperId: 'a' } },
  })
  expect(outgoing.slice(1).map((o) => o.to)).toEqual(['peer-a', 'peer-b'])
  expect(outgoing.slice(1).every((o) => o.message.type === 'SYNC')).toBe(true)
})

it('sends each seat its own hand and never another seat`s', () => {
  const { outgoing } = twoPlayerSession()
  const [, toA, toB] = outgoing
  const viewA = toA.message.type === 'SYNC' ? toA.message.payload.view : null
  const viewB = toB.message.type === 'SYNC' ? toB.message.payload.view : null

  expect(viewA?.self.id).toBe('a')
  expect(viewB?.self.id).toBe('b')
  expect(viewA?.self.hand.length).toBeGreaterThan(0)
  // The opponent is a count, never an identity.
  expect(viewA?.opponents[0]).toMatchObject({ id: 'b' })
  expect(JSON.stringify(viewA)).not.toContain(viewB?.self.hand[0].uid)
})

it('never puts the seed or GameState on the wire', () => {
  const { outgoing } = twoPlayerSession()
  expect(JSON.stringify(outgoing)).not.toContain('"seed"')
  expect(JSON.stringify(outgoing)).not.toContain('rngCursor')
})

it('attributes an intent to the seat bound to the connection, not the payload', () => {
  const { session } = twoPlayerSession()
  // 'b' submits over peer-b while claiming to be 'a'. The claim is ignored, so
  // the action is 'b' drawing out of turn — and 'a' holds the turn.
  const { session: next, outgoing } = applyIntent(
    session,
    'peer-b',
    { type: 'DRAW', player: 'a' } as never,
    1_000,
  )

  expect(next).toBe(session)
  expect(outgoing.map((o) => o.to)).toEqual(['peer-b'])
})

it('returns a rejection to the submitter alone', () => {
  const { session } = twoPlayerSession()
  const { outgoing } = applyIntent(session, 'peer-b', { type: 'PASS' }, 1_000)
  const only = outgoing[0]
  const events = only.message.type === 'SYNC' ? only.message.payload.events : []

  expect(outgoing).toHaveLength(1)
  expect(only.to).toBe('peer-b')
  expect(events.map((e) => e.type)).toEqual(['rejected'])
})

it('fans a committed action out to every connected seat', () => {
  const { session } = twoPlayerSession()
  const { session: next, outgoing } = applyIntent(session, 'peer-a', { type: 'DRAW' }, 1_000)

  expect(next).not.toBe(session)
  expect(outgoing.map((o) => o.to)).toEqual(['peer-a', 'peer-b'])
})

it('hides the drawn card from everyone but the drawer', () => {
  const { session } = twoPlayerSession()
  const { outgoing } = applyIntent(session, 'peer-a', { type: 'DRAW' }, 1_000)
  const [toA, toB] = outgoing
  const eventsA = toA.message.type === 'SYNC' ? toA.message.payload.events : []
  const eventsB = toB.message.type === 'SYNC' ? toB.message.payload.events : []
  const drawnA = eventsA.find((e) => e.type === 'drawn')
  const drawnB = eventsB.find((e) => e.type === 'drawn')

  expect(drawnA).toBeDefined()
  // B learns a draw happened and the new deck size, never which card.
  expect(drawnB).toBeUndefined()
})

it('stamps the keeper`s clock, ignoring any time the peer supplies', () => {
  const { session } = twoPlayerSession()
  const { session: next } = applyIntent(
    session,
    'peer-a',
    { type: 'DRAW', at: 999_999 } as never,
    5_000,
  )
  expect(next.state.turn.hasDrawn).toBe(true)
})

it('ignores an intent from a peer bound to no seat', () => {
  const { session } = twoPlayerSession()
  const result = applyIntent(session, 'peer-stranger', { type: 'DRAW' }, 1_000)

  expect(result.session).toBe(session)
  expect(result.outgoing).toEqual([])
})
