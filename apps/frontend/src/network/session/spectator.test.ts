import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from '@release/engine/fake'
import { vi } from 'vitest'
import type { WireMessage } from '../types'
import { createMemoryNetwork } from './memoryNetwork'
import {
  adoptSession,
  advanceSession,
  applyIntent,
  createSession,
  disconnect,
  syncAll,
  unwatch,
  watch,
} from './referee'
import { attachKeeper } from './remoteLink'
import { createStartGate } from './startGate'

function game(spectators: string[] = []) {
  return createSession({
    gameId: 'g1',
    keeperId: 'a',
    engine: createFakeEngine(),
    seed: 17,
    players: [
      { playerId: 'a', peerId: 'host', name: 'Ann' },
      { playerId: 'b', peerId: 'player', name: 'Bo' },
    ],
    setup: {},
    deck: FAKE_DECK,
    events: FAKE_EVENTS,
    spectators,
  }).session
}

it('catches up a watcher with public history and never enrolls a seat twice', () => {
  const session = game()
  session.log.push(
    { id: 90, type: 'drawn', player: 'a', pile: 0, card: 'support-sudo', deckSize: 30 },
    { id: 91, type: 'handTransfer', from: 'a', to: 'b', card: 'secret', visibleTo: ['a'] },
  )
  const result = watch(session, 'watcher')
  expect(result.session.spectators).toEqual(['watcher'])
  const frame = result.outgoing[0].message
  if (frame.type !== 'SYNC') throw new Error('missing public sync')
  expect(frame.payload.view.self).toBeNull()
  expect(frame.payload.view.opponents.map((p) => p.id)).toEqual(['a', 'b'])
  expect(frame.payload.resync).toBe(true)
  expect(frame.payload.events.at(-1)).toEqual({
    id: 90,
    type: 'drawn',
    player: 'a',
    pile: 0,
    deckSize: 30,
  })
  expect(JSON.stringify(frame)).not.toContain('secret')
  for (const p of Object.values(session.state.players))
    for (const card of p.hand) expect(JSON.stringify(frame)).not.toContain(card.uid)
  expect(watch(result.session, 'watcher').session.spectators).toEqual(['watcher'])
  expect(watch(result.session, 'player').session.spectators).toEqual(['watcher'])
  expect(applyIntent(result.session, 'watcher', { type: 'DRAW' }, 1000)).toEqual({
    session: result.session,
    outgoing: [],
  })
})

it('computes one public payload for both watchers while keeping private rejections private', () => {
  const session = game(['one', 'two'])
  const project = vi.spyOn(session.engine, 'spectate')
  const frames = syncAll(session, session.log)
  expect(project).toHaveBeenCalledTimes(1)
  expect(frames.map((f) => f.to)).toEqual(['host', 'player', 'one', 'two'])
  expect(frames[2].message).toBe(frames[3].message)
  expect(applyIntent(session, 'player', { type: 'DRAW' }, 1000).outgoing.map((f) => f.to)).toEqual([
    'player',
  ])
  expect(disconnect(session, 'one', 1000).session.spectators).toEqual(['two'])
  expect(unwatch(session, 'two').session.spectators).toEqual(['one'])
  expect(disconnect(session, 'one', 1000).session.seats).toEqual(session.seats)
  expect(adoptSession({ ...session }).spectators).toEqual([])
})

it('delivers live human and clock changes through the keeper and stops after leaving', () => {
  const net = createMemoryNetwork(['host', 'player', 'one', 'two'])
  const ref = { current: game() }
  const frames: Record<string, WireMessage[]> = { one: [], two: [] }
  for (const id of ['one', 'two']) net.onDeliver(id, (frame) => frames[id].push(frame))
  let tick = () => {}
  const keeper = attachKeeper({
    ref,
    transport: net.transport('host'),
    now: () => 1000,
    ticker: {
      start(fn) {
        tick = fn
      },
      stop() {},
    },
  })
  keeper.watch('one')
  keeper.watch('two')
  keeper.link.submit({ type: 'DRAW' })
  expect(frames.one.at(-1)?.type).toBe('SYNC')
  expect(frames.one).toEqual(frames.two.map((frame, i) => ({ ...frame, seq: frames.one[i].seq })))
  expect(frames.one).toHaveLength(2)
  keeper.unwatch('one')
  keeper.link.submit({ type: 'PUSH' })
  tick()
  expect(frames.one).toHaveLength(2)
  expect(frames.two.length).toBeGreaterThan(2)
  keeper.peerLeft('two')
  expect(ref.current.spectators).toEqual([])
  keeper.close()
})

it('drops observer intents before the intro queue even if that peer later takes a seat', () => {
  const ref = { current: game(['watcher']) }
  const gate = createStartGate({ expect: ['a', 'b'], schedule: () => () => {} })
  const keeper = attachKeeper({
    ref,
    transport: createMemoryNetwork(['host', 'player', 'watcher']).transport('host'),
    now: () => 1000,
    gate,
    ticker: { start() {}, stop() {} },
  })
  keeper.handleMessage({
    type: 'INTENT',
    payload: { intent: { type: 'DRAW' } },
    from: 'watcher',
    seq: 1,
  })
  keeper.handleMessage({ type: 'INTRO_READY', payload: { gameId: 'g1' }, from: 'watcher', seq: 2 })
  expect(gate.open).toBe(false)
  const state = ref.current.state
  ref.current = {
    ...ref.current,
    seats: ref.current.seats.map((seat) =>
      seat.playerId === 'a' ? { ...seat, peerId: 'watcher' } : seat,
    ),
  }
  gate.ready('a')
  gate.ready('b')
  expect(ref.current.state).toBe(state)
  keeper.close()
})

it('fans out bot changes to watchers through the same public stream', () => {
  const session = game(['watcher'])
  session.seats[1] = { ...session.seats[1], bot: true, peerId: null }
  session.state.turn.player = 'b'
  const result = advanceSession(session, 1000)
  expect(result.session.state).not.toBe(session.state)
  expect(
    result.outgoing.some(
      (frame) =>
        frame.to === 'watcher' &&
        frame.message.type === 'SYNC' &&
        frame.message.payload.view.self === null,
    ),
  ).toBe(true)
})
