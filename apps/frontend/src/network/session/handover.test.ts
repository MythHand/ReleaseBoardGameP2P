import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from '@release/engine/fake'
import { adoptSession, createSession, handover, type Session } from './referee'

function session(): Session {
  return createSession({
    gameId: 'g1',
    keeperId: 'a',
    engine: createFakeEngine(),
    seed: 5,
    players: [
      { playerId: 'a', peerId: 'peer-a', name: 'Ann' },
      { playerId: 'b', peerId: 'peer-b', name: 'Bo' },
    ],
    setup: {},
    deck: FAKE_DECK,
    events: FAKE_EVENTS,
  }).session
}

it('hands the full state to the successor and announces the change', () => {
  const { outgoing } = handover(session(), 'b')
  const stateMessage = outgoing.find((o) => o.message.type === 'KEEPER_STATE')
  const announcement = outgoing.find((o) => o.message.type === 'KEEPER_CHANGED')

  expect(stateMessage?.to).toBe('peer-b')
  expect(announcement).toEqual({
    to: 'broadcast',
    message: { type: 'KEEPER_CHANGED', payload: { keeperId: 'b' } },
  })
})

it('sends GameState to the successor and to nobody else', () => {
  const { outgoing } = handover(session(), 'b')
  const others = outgoing.filter((o) => o.to !== 'peer-b')

  expect(JSON.stringify(others)).not.toContain('rngCursor')
})

it('refuses to hand over to a seat that is not connected', () => {
  const start = session()
  const orphaned: Session = {
    ...start,
    seats: start.seats.map((s) => (s.playerId === 'b' ? { ...s, peerId: null } : s)),
  }
  const result = handover(orphaned, 'b')

  expect(result.session).toBe(orphaned)
  expect(result.outgoing).toEqual([])
})

it('the successor adopts the state and can keep reducing', () => {
  const start = session()
  const adopted = adoptSession({
    state: start.state,
    gameId: 'g1',
    keeperId: 'b',
    engine: createFakeEngine(),
    seats: start.seats,
  })

  expect(adopted.keeperId).toBe('b')
  expect(adopted.state.players.a.hand).toEqual(start.state.players.a.hand)
})
