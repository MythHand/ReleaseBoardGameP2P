import type { PlayerView } from '@release/engine'
import { expect, it } from 'vitest'
import { isOpening } from './isOpening'

// No `as unknown as PlayerView` cast: the fixture satisfies the real shape, so a
// drift in the projection becomes a compile error here rather than a silent lie.
const opening = (): PlayerView => ({
  self: { id: 'p1', name: 'One', hand: [], release: {}, playable: [], frozen: [] },
  opponents: [{ id: 'p2', name: 'Two', handCount: 5, release: {}, eliminated: false }],
  decks: { piles: [89], events: 21, discardCount: 0 },
  turn: { player: 'p1', index: 0, hasDrawn: false },
  window: null,
  pending: null,
  // `Setup` is Record<string, string> (packages/engine/src/state.ts) — the
  // brief's { mode, releasesToWin: 3, handLimit: 7 } is not one.
  setup: {},
  over: null,
})

it('recognises a game that has not been played yet', () => {
  expect(isOpening(opening())).toBe(true)
})

it('is not an opening once a turn has advanced', () => {
  const v = opening()
  v.turn.index = 1
  expect(isOpening(v)).toBe(false)
})

it('is not an opening once the player on turn has drawn', () => {
  const v = opening()
  v.turn.hasDrawn = true
  expect(isOpening(v)).toBe(false)
})

it('is not an opening once anything is in the discard', () => {
  const v = opening()
  v.decks.discardCount = 1
  expect(isOpening(v)).toBe(false)
})

it('is not an opening once a release is on the table', () => {
  const v = opening()
  v.opponents[0].release = { frontend: { uid: 'release-frontend#0', card: 'release-frontend' } }
  expect(isOpening(v)).toBe(false)
})

it('is not an opening once somebody is out', () => {
  const v = opening()
  v.opponents[0].eliminated = true
  expect(isOpening(v)).toBe(false)
})

it('is not an opening for a finished game', () => {
  const v = opening()
  v.over = { winner: 'p1', condition: 'release' }
  expect(isOpening(v)).toBe(false)
})
