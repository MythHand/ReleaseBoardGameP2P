import type { Action, Event, GameState } from '@release/engine'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from '@release/engine/fake'
import { deriveDock, isCounting } from '@release/ui'
import { describe, expect, it } from 'vitest'
import { type HistoryLabels, toTableState } from './toTableState'

// Every other test in this chain builds its reaction window by hand, so the
// shape the kit is asserted against is the shape someone believed the engine
// produces. This drives the real engine to a real window instead, which is the
// only way the belief itself gets checked — the countdown reaching a screen has
// never been proven from engine state, and a window that arrives without its
// bounds reads as "no timer" rather than failing.
const T0 = 1_000_000
const WINDOW_MS = 15_000
const labels = {} as HistoryLabels

// Deal, draw, ship a Release, pay its discard cost: the shortest real path to an
// open window. The seat that did none of it is the one owed a reaction.
function openWindowByPlayingARelease(): { state: GameState; owner: string; responder: string } {
  const engine = createFakeEngine()
  let state = engine.createGame({
    gameId: 'g1',
    seed: 7,
    players: [
      { id: 'p1', name: 'Ann' },
      { id: 'p2', name: 'Bo' },
    ],
    setup: {},
    deck: FAKE_DECK,
    events: FAKE_EVENTS,
  })

  // `reduce` is total — an illegal action comes back as an unchanged state plus a
  // `rejected` event. Silently swallowing one would leave this test asserting
  // against a game that never reached a window, so it fails loudly instead.
  const step = (action: Action) => {
    const { state: next, events } = engine.reduce(state, action)
    const rejected = events.find((e) => e.type === 'rejected')
    if (rejected) {
      throw new Error(`${action.type} was rejected: ${(rejected as { reason: string }).reason}`)
    }
    state = next
  }

  step({ type: 'DRAW', player: 'p1', at: T0 })
  const release = state.players.p1.hand.find((c) => c.id.startsWith('release-'))
  if (!release) throw new Error('the seeded deal dealt p1 no Release to ship')
  step({ type: 'PLAY', player: 'p1', card: release.uid, at: T0 })

  // Shipping a Release costs a discard, and the window only opens once it is
  // paid — the release is not on the board until then.
  const cost = state.players.p1.hand.find((c) => !c.id.startsWith('release-'))
  step({
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'discardForRelease', card: cost?.uid ?? '' },
    at: T0,
  })

  return { state, owner: 'p1', responder: 'p2' }
}

describe('a reaction window the engine actually opened', () => {
  it('reaches the kit carrying both bounds of its deadline span', () => {
    const { state, responder } = openWindowByPlayingARelease()
    const view = createFakeEngine().project(state, responder)
    expect(view.window).toBeTruthy()

    const table = toTableState(view, [] as Event[], labels)

    // The adapter passes `window` straight through, so nothing here would fail
    // to compile if a bound went missing — and a missing bound is silent, since
    // deriveDock reads it as "this state has no deadline".
    expect(table.window?.openedAt).toBe(T0)
    expect(table.window?.deadline).toBe(T0 + WINDOW_MS)
  })

  it('offers the responder something to throw, so a ring is drawn at all', () => {
    const { state, responder } = openWindowByPlayingARelease()
    const view = createFakeEngine().project(state, responder)
    const table = toTableState(view, [] as Event[], labels)

    // deriveDock ignores a window with an empty `canAttackWith`, which is a real
    // state — a responder holding none of the four release attacks is owed a
    // window it can do nothing with, and sees no ring. This asserts the seeded
    // deal is not that case, so the countdown assertions below mean something.
    expect(table.window?.canAttackWith.length).toBeGreaterThan(0)
    expect(isCounting(table, table.selfId)).toBe(true)
  })

  it('counts down from the clock it is given', () => {
    const { state, responder } = openWindowByPlayingARelease()
    const view = createFakeEngine().project(state, responder)
    const table = toTableState(view, [] as Event[], labels)

    // Exact rather than approximate: the clock is a parameter, so no wall-clock
    // slack enters and the arithmetic is pinned to the engine's own bounds.
    expect(deriveDock(table, table.selfId, T0).seconds).toBe(15)
    expect(deriveDock(table, table.selfId, T0 + 5_000).seconds).toBe(10)
    expect(deriveDock(table, table.selfId, T0 + 14_500).seconds).toBe(1)
  })

  it('reads zero once the deadline passes, which is not the same as no clock', () => {
    const { state, responder } = openWindowByPlayingARelease()
    const view = createFakeEngine().project(state, responder)
    const table = toTableState(view, [] as Event[], labels)

    // An expired window still has a clock, so 0 here is a real reading and the
    // ring shows it. Absence is reserved for states that carry no deadline —
    // conflating the two is what put a stuck 0 on the dock during a player's
    // own turn.
    expect(deriveDock(table, table.selfId, T0 + WINDOW_MS).seconds).toBe(0)
    expect(deriveDock(table, table.selfId, T0 + WINDOW_MS + 5_000).seconds).toBe(0)

    // Two distinct routes report "no clock", and each has to be checked on its
    // own: the default branch never consults the clock at all, while an untimed
    // pending consults it and gets no bounds back. A mutation of one leaves the
    // other green.
    const nothingOwed = { ...table, window: null, pending: null }
    expect(deriveDock(nothingOwed, nothingOwed.selfId, T0).seconds).toBeUndefined()

    const untimedPending = {
      ...table,
      window: null,
      pending: {
        kind: 'discardForRelease' as const,
        player: table.selfId,
        options: [table.you.hand[0]?.uid ?? 'x'],
      },
    }
    expect(deriveDock(untimedPending, untimedPending.selfId, T0).seconds).toBeUndefined()
  })
})
