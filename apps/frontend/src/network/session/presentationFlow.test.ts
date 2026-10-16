import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from '@release/engine/fake'
import { assert } from 'vitest'
import type { Sync } from './link'
import { createMemoryNetwork } from './memoryNetwork'
import { createSession, type SessionRef } from './referee'
import { attachKeeper } from './remoteLink'

function table() {
  const net = createMemoryNetwork(['host', 'guest', 'spectator'])
  let now = 1000
  let fire: () => void = () => {}
  const { session } = createSession({
    gameId: 'g',
    keeperId: 'a',
    engine: createFakeEngine(),
    seed: 17,
    players: [
      { playerId: 'a', peerId: 'host', name: 'A' },
      { playerId: 'b', peerId: 'guest', name: 'B' },
      { playerId: 'c', peerId: null, name: 'C', bot: true },
      { playerId: 'd', peerId: null, name: 'D', bot: true },
    ],
    spectators: ['spectator'],
    setup: {},
    deck: FAKE_DECK,
    events: FAKE_EVENTS,
  })
  session.state = { ...session.state, turn: { ...session.state.turn, player: 'c' } }
  const ref: SessionRef = { current: session }
  const keeper = attachKeeper({
    ref,
    transport: net.transport('host'),
    now: () => now,
    ticker: {
      start(fn) {
        fire = fn
      },
      stop() {},
    },
  })
  const views: Sync[] = []
  keeper.link.subscribe((sync) => views.push(sync))
  net.onDeliver('host', (frame) => keeper.handleMessage(frame))
  const step = (at: number) => {
    now = at
    fire()
  }
  keeper.resync()
  return { net, ref, keeper, views, step }
}

it('waits for a slow non-host before driving a bot, with a twelve-second cap', () => {
  const t = table()
  const first = latest(t.views)
  expect(first.presentation).toBeDefined()
  t.keeper.link.presentationReady(presentation(first))
  const state = t.ref.current.state
  t.step(3000)
  expect(t.ref.current.state).toBe(state)
  t.step(12999)
  expect(t.ref.current.state).toBe(state)
  t.step(13000)
  expect(t.ref.current.state).not.toBe(state)
  const next = presentation(latest(t.views))
  expect(next.revision).toBeGreaterThan(presentation(first).revision)
  t.keeper.link.presentationReady(next)
  t.net
    .transport('guest')
    .send('host', { type: 'PRESENTATION_READY', payload: { presentation: next } })
  const after = t.ref.current.state
  t.step(14999)
  expect(t.ref.current.state).toBe(after)
  t.step(15000)
  expect(t.ref.current.state).not.toBe(after)
})

it('starts a full human turn allowance after presentation and publishes clocks without another revision', () => {
  const t = table()
  t.ref.current.state = {
    ...t.ref.current.state,
    turn: { ...t.ref.current.state.turn, player: 'a' },
  }
  t.step(1000)
  const sync = latest(t.views)
  expect(sync.view.turn.awaitingPresentation).toBe(true)
  t.keeper.link.presentationReady(presentation(sync))
  t.step(4000)
  expect(t.ref.current.state.turn.awaitingPresentation).toBe(true)
  t.net
    .transport('guest')
    .send('host', { type: 'PRESENTATION_READY', payload: { presentation: presentation(sync) } })
  const active = latest(t.views)
  expect(active.view.turn.openedAt).toBe(4000)
  expect(active.view.turn.deadline).toBe(34000)
  expect(active.presentation).toEqual(sync.presentation)
})

it('invalidates old keeper acknowledgements on replacement without extending the original cap', () => {
  const t = table()
  const old = presentation(latest(t.views))
  t.keeper.close()
  const successor = attachKeeper({
    ref: t.ref,
    transport: t.net.transport('host'),
    now: () => 7000,
    ticker: { start() {}, stop() {} },
  })
  const syncs: Sync[] = []
  successor.link.subscribe((sync) => syncs.push(sync))
  successor.resync()
  const current = presentation(latest(syncs))
  expect(current.incarnation).not.toBe(old.incarnation)
  expect(t.ref.current.presentation?.wait?.deadline).toBe(13000)
  successor.handleMessage({
    type: 'PRESENTATION_READY',
    from: 'guest',
    seq: 1,
    payload: { presentation: old },
  })
  expect(t.ref.current.presentation?.wait?.waitingPeers).toContain('guest')
})

it('presents a returning player’s renewed expired clock while preserving its marked catch-up history', () => {
  const t = table()
  t.keeper.peerLeft('guest')
  t.ref.current.state = {
    ...t.ref.current.state,
    turn: {
      ...t.ref.current.state.turn,
      player: 'b',
      awaitingPresentation: undefined,
      openedAt: 0,
      deadline: 999,
    },
  }
  const revision = t.ref.current.presentation?.revision
  t.keeper.peerReturned('b', 'returned')
  expect(t.ref.current.state.turn.awaitingPresentation).toBe(true)
  expect(t.ref.current.presentation?.revision).toBeGreaterThan(revision ?? 0)
  expect(t.ref.current.presentation?.wait?.waitingPeers).toContain('returned')
})

function latest<T>(items: T[]): T {
  const item = items.at(-1)
  assert(item)
  return item
}
function presentation(sync: Sync) {
  assert(sync.presentation)
  return sync.presentation
}

it('does not replenish an active allowance when a keeper restores its saved state', () => {
  const t = table()
  t.ref.current.state = {
    ...t.ref.current.state,
    turn: {
      ...t.ref.current.state.turn,
      player: 'a',
      awaitingPresentation: undefined,
      openedAt: 1000,
      deadline: 31000,
    },
  }
  t.keeper.close()
  const restored = attachKeeper({
    ref: t.ref,
    transport: t.net.transport('host'),
    now: () => 7000,
    ticker: { start() {}, stop() {} },
  })
  expect(t.ref.current.state.turn.openedAt).toBe(1000)
  expect(t.ref.current.state.turn.deadline).toBe(31000)
  restored.resync()
  restored.close()
})
