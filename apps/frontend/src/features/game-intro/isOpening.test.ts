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

// The bug this pins, found by playing the real game: the host saw no opening
// while every other player did.
//
// A projection reaches the peer holding the keeper *in memory*, so it arrives
// exactly as the engine built it — an empty release being an object whose slots
// are present and `undefined`. Every other peer's projection crosses a
// DataChannel as JSON, and JSON.stringify drops undefined-valued keys, so the
// same empty release arrives as `{}`. Judging "has this player released
// anything?" by counting KEYS therefore answered yes for the host alone, and the
// host alone was refused its deal.
//
// One game, two peers, two object shapes: any predicate over a projection has to
// survive both, so both are asserted here.
it('treats an empty release as empty however it reached this peer', () => {
  // As the keeper holds it, in memory: slots present, values undefined.
  const local = opening()
  local.self.release = { frontend: undefined, backend: undefined, database: undefined }
  local.opponents[0].release = { frontend: undefined, backend: undefined, database: undefined }
  expect(isOpening(local)).toBe(true)

  // As it survives a round trip over the wire.
  const wire = JSON.parse(JSON.stringify(local)) as PlayerView
  expect(wire.self.release).toEqual({})
  expect(isOpening(wire)).toBe(true)
})

it('still sees a real release through the in-memory shape', () => {
  // The other half of the same coin: filled slots must still count, even when
  // the empty ones sit beside them as explicit undefined.
  const v = opening()
  v.self.release = {
    frontend: { uid: 'release-frontend#0', card: 'release-frontend' },
    backend: undefined,
    database: undefined,
  }
  expect(isOpening(v)).toBe(false)
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
