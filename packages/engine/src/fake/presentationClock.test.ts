import type { GameState, Pending } from '../state'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from './index'
import { activatePresentedClocks, deferNewClocks } from './presentationClock'
import { reduce } from './reduce'

const initial = () =>
  createFakeEngine().createGame({
    gameId: 'g',
    seed: 17,
    players: [
      { id: 'a', name: 'a' },
      { id: 'b', name: 'b' },
      { id: 'c', name: 'c' },
    ],
    setup: { releaseCond: 'easy' },
    deck: FAKE_DECK,
    events: FAKE_EVENTS,
  })

it('holds a newly established turn allowance and starts its full duration after presentation', () => {
  const before = initial()
  const after = reduce(before, { type: 'CLOCK_STARTED', at: 1000 }).state
  const held = deferNewClocks(before, after)
  expect(held.turn.awaitingPresentation).toBe(true)
  const active = activatePresentedClocks(held, 5000)
  expect(active.turn.openedAt).toBe(5000)
  expect(active.turn.deadline).toBe(35000)
  expect(active.turn.awaitingPresentation).toBeUndefined()
  expect(activatePresentedClocks(active, 9000)).toBe(active)
  expect(deferNewClocks(before, before)).toBe(before)
})

it('does not restart an unrelated active window and preserves a held window across passing', () => {
  const base = initial()
  const before: GameState = {
    ...base,
    window: {
      target: { player: 'a', slot: 'frontend', card: 'r' },
      round: 1,
      passed: [],
      openedAt: 1000,
      deadline: 16000,
    },
  }
  const passed = reduce(before, { type: 'PASS', player: 'b', at: 2000 }).state
  expect(passed.window?.passed).toEqual(['b'])
  expect(deferNewClocks(before, passed).window?.awaitingPresentation).toBeUndefined()
  const held = deferNewClocks(base, before)
  expect(held.window?.awaitingPresentation).toBe(true)
  const early = reduce(held, { type: 'PASS', player: 'b', at: 90000 }).state
  expect(early.window?.passed).toEqual(['b'])
  expect(deferNewClocks(held, early).window?.awaitingPresentation).toBe(true)
  expect(reduce(held, { type: 'WINDOW_EXPIRED', at: 90000 }).state).toBe(held)
  const active = activatePresentedClocks(held, 5000)
  expect(active.window).toMatchObject({ openedAt: 5000, deadline: 20000 })
})

it.each([
  'defend',
  'stealCard',
  'requestCard',
  'giveCard',
] as const)('holds and activates %s timing without waiting for a human choice', (kind) => {
  const before = initial()
  const timing = { openedAt: 1000, deadline: 26000 }
  const context = { attack: { uid: 'bug', id: 'attack-bug' }, owner: 'b' }
  const pending: Pending =
    kind === 'defend'
      ? {
          kind,
          player: 'a',
          attacker: 'b',
          attack: 'bug',
          attackId: 'attack-bug',
          attackEventId: 1,
          scope: 'hand',
          sudo: false,
          canDefendWith: [],
          ...timing,
        }
      : kind === 'stealCard'
        ? { kind, player: 'a', target: 'b', slots: [], context, ...timing }
        : kind === 'requestCard'
          ? { kind, player: 'a', target: 'b', context, ...timing }
          : { kind, player: 'a', requested: 'attack-bug', attacker: 'b', context, ...timing }
  const after = { ...before, pending }
  const held = deferNewClocks(before, after)
  expect(held.pending).toMatchObject({ awaitingPresentation: true })
  const active = activatePresentedClocks(held, 5000)
  expect(active.pending).toMatchObject({ openedAt: 5000, deadline: 30000 })
  expect(
    active.pending &&
      'awaitingPresentation' in active.pending &&
      active.pending.awaitingPresentation,
  ).toBeFalsy()
  const resolved = { ...held, pending: null }
  expect(activatePresentedClocks(resolved, 5000).pending).toBeNull()
})

it('projects held phases to every recipient without altering allowance duration', () => {
  const before = initial()
  const held = deferNewClocks(before, reduce(before, { type: 'CLOCK_STARTED', at: 1000 }).state)
  const engine = createFakeEngine()
  expect(engine.project(held, 'a').turn.awaitingPresentation).toBe(true)
  expect(engine.spectate(held).turn.awaitingPresentation).toBe(true)
})
