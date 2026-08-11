import { expect, it } from 'vitest'
import type { GameConfig } from '../engine'
import { FAKE_DECK, FAKE_EVENTS } from './index'
import { createGame, setupEvents } from './setup'

const config = (players: number): GameConfig => ({
  gameId: 'g1',
  seed: 42,
  players: Array.from({ length: players }, (_, n) => ({ id: `p${n + 1}`, name: `P${n + 1}` })),
  setup: {
    handLimit: 'base',
    releases: 'base',
    releaseCond: 'base',
    ai: 'base',
    gitBranch: 'base',
  },
  deck: FAKE_DECK,
  events: FAKE_EVENTS,
})

it('emits one dealt event per player, in seating order', () => {
  const state = createGame(config(3))
  const events = setupEvents(state)
  expect(events.map((e) => e.type)).toEqual(['dealt', 'dealt', 'dealt'])
  expect(events.map((e) => (e.type === 'dealt' ? e.player : null))).toEqual(state.seating)
})

it('counts the hand it actually dealt', () => {
  const state = createGame(config(3))
  for (const e of setupEvents(state)) {
    if (e.type !== 'dealt') continue
    expect(e.count).toBe(state.players[e.player].hand.length)
  }
})

it('names the Debugger as dealt face up — it is public by the rules', () => {
  const state = createGame(config(3))
  for (const e of setupEvents(state)) {
    if (e.type !== 'dealt') continue
    const hand = state.players[e.player].hand
    const debuggers = hand.filter((c) => c.id === 'protection-debugger').map((c) => c.id)
    // Only the reserved opening Debugger is open, and it is hand[0] (setup.ts).
    expect(e.open ?? []).toEqual(hand[0]?.id === 'protection-debugger' ? [debuggers[0]] : [])
  }
})

it('is public — no dealt event is addressed to a subset of the table', () => {
  const state = createGame(config(3))
  // A count is not a secret; identities of closed cards never appear here.
  for (const e of setupEvents(state)) expect(e.visibleTo).toBeUndefined()
})

it('gives every event a distinct id', () => {
  const state = createGame(config(4))
  const ids = setupEvents(state).map((e) => e.id)
  expect(new Set(ids).size).toBe(ids.length)
})
