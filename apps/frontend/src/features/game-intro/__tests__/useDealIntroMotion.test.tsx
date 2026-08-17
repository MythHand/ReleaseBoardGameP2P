import type { Event, PlayerView } from '@release/engine'
import { act, renderHook } from '@testing-library/react'
import { createRef } from 'react'
import { expect, it, vi } from 'vitest'
import type { BoardState } from '~/entities/game/board'
import { useDealIntro } from '../useDealIntro'

// The counterpart of useDealIntro.test.tsx: there the opening is collapsed and
// every case ends in the same place. Here it is PLAYED — `beat.run()`, which is
// what the board's queue calls — and the assertions are the ones that hold on
// its first frame: the pre-deal table, and the gate staying shut until the
// choreography reaches its end.
//
// No `useReducedMotion` mock any more: the opening does not read the preference
// (#96 moved that to the queue, so there is one policy in one place), and a mock
// of something nothing calls is a mock that keeps passing after the behaviour
// moved out from under it.

// `useDealIntro` now takes the board's full `BoardAnchors` — this test only
// exercises the members the sequencer itself reads, but the shape must still
// satisfy the interface, so the rest are stubbed inert.
const refs = () => ({
  rail: createRef<HTMLDivElement>(),
  bg: createRef<HTMLDivElement>(),
  decks: createRef<HTMLDivElement>(),
  discard: createRef<HTMLDivElement>(),
  seats: createRef<HTMLDivElement>(),
  dock: createRef<HTMLDivElement>(),
  zone: createRef<HTMLDivElement>(),
  deckBox: createRef<HTMLDivElement>(),
  centre: createRef<HTMLDivElement>(),
  hand: createRef<HTMLDivElement>(),
  discardBox: createRef<HTMLDivElement>(),
  seatOf: () => null,
  seatBox: () => null,
  handSlotAt: () => null,
  releaseSlot: () => null,
  bindSeat: () => {},
  bindReleaseSlot: () => {},
})

const view = (): PlayerView => ({
  self: {
    id: 'p1',
    name: 'One',
    hand: [
      { uid: 'protection-debugger#0', id: 'protection-debugger' },
      { uid: 'attack-bug#1', id: 'attack-bug' },
    ],
    release: {},
    playable: [],
    frozen: [],
  },
  opponents: [{ id: 'p2', name: 'Two', handCount: 2, release: {}, eliminated: false }],
  decks: { piles: [100], events: 21, discardCount: 0 },
  turn: { player: 'p1', index: 0, hasDrawn: false },
  window: null,
  pending: null,
  setup: {},
  over: null,
})

const events = (): Event[] => [
  { id: 1, type: 'dealt', player: 'p1', count: 2, open: ['protection-debugger'] },
  { id: 2, type: 'dealt', player: 'p2', count: 2, open: ['protection-debugger'] },
]

const live = (): BoardState => ({
  you: {
    name: 'One',
    hand: [],
    release: {
      frontend: {
        id: 'x',
        name: 'X',
        category: 'release',
        deck: 'base',
        art: '',
        tags: [],
        qty: 1,
      },
    },
  },
  opponents: [{ id: 'p2', name: 'Two', handCount: 2, release: {} }],
  decks: { main: 100, events: 21, discardCount: 0 },
  turn: 'p1',
  hasDrawn: false,
  selfId: 'p1',
  history: [],
  setup: {},
  playable: [],
  frozen: [],
})

it('opens on the pre-deal table and keeps the gate shut', () => {
  const onDone = vi.fn()
  const { result, unmount } = renderHook(() =>
    useDealIntro({
      live: live(),
      gameId: 'g1',
      view: view(),
      events: events(),
      refs: refs(),
      onDone,
    }),
  )

  // The queue starts it; nothing happens until it does.
  expect(result.current.active).toBe(false)
  act(() => {
    void result.current.beat?.run()
  })

  expect(result.current.active).toBe(true)
  const shadow = result.current.shadow
  expect(shadow).not.toBeNull()
  // The table as it stood BEFORE the deal: the whole base pile (what is left
  // plus the four that went out), nobody holding anything, no release zone yet.
  expect(shadow?.decks.main).toBe(104)
  expect(shadow?.you.hand).toEqual([])
  expect(shadow?.you.release).toEqual({})
  expect(shadow?.opponents[0].handCount).toBe(0)
  expect(shadow?.introPhase).toBe('setup')
  expect(onDone).not.toHaveBeenCalled()

  // Unmount cancels — it must not report, or the gate would open on a peer
  // leaving the board mid-intro.
  unmount()
  expect(onDone).not.toHaveBeenCalled()
})

it('collapses on a skip, reporting once', () => {
  const onDone = vi.fn()
  const { result } = renderHook(() =>
    useDealIntro({
      live: live(),
      gameId: 'g1',
      view: view(),
      events: events(),
      refs: refs(),
      onDone,
    }),
  )
  act(() => {
    void result.current.beat?.run()
  })
  expect(result.current.active).toBe(true)
  act(() => {
    result.current.finish()
    result.current.finish()
  })
  expect(onDone).toHaveBeenCalledTimes(1)
})
