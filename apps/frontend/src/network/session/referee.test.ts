import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from '@release/engine/fake'
import { createSession } from './referee'

// biome-ignore lint/suspicious/noExportsInTest: later tasks' tests import this fixture.
export function twoPlayerSession() {
  return createSession({
    gameId: 'g1',
    keeperId: 'a',
    engine: createFakeEngine(),
    seed: 42,
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
