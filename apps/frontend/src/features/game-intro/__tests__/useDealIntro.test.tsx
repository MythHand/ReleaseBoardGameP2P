import type { Event, PlayerView } from '@release/engine'
import { renderHook, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import { expect, it, vi } from 'vitest'
import type { BoardState } from '~/entities/game/board'
import { useDealIntro } from '../useDealIntro'

vi.mock('~/shared/lib/useReducedMotion', () => ({ useReducedMotion: () => true }))

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

// Minimal but real: the shapes the sequencer reads. No `as unknown as` cast —
// these satisfy PlayerView / BoardState outright, so drift is a compile error.
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
  // `Setup` is Record<string, string> in both the engine and the kit.
  setup: {},
  over: null,
})

const events = (): Event[] => [
  { id: 1, type: 'dealt', player: 'p1', count: 2, open: ['protection-debugger'] },
  { id: 2, type: 'dealt', player: 'p2', count: 2, open: ['protection-debugger'] },
]

const live = (): BoardState => ({
  you: { name: 'One', hand: [], release: {} },
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

it('under reduced motion it is over at once, and reports it', async () => {
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
  await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
  expect(result.current.active).toBe(false)
  expect(result.current.shadow).toBeNull()
})

it('does not run for a projection that is not an opening', async () => {
  const v = view()
  v.turn.hasDrawn = true
  const onDone = vi.fn()
  const { result } = renderHook(() =>
    useDealIntro({ live: live(), gameId: 'g1', view: v, events: events(), refs: refs(), onDone }),
  )
  expect(result.current.active).toBe(false)
  await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
})

it('does not run before the first projection arrives', () => {
  const onDone = vi.fn()
  const { result } = renderHook(() =>
    useDealIntro({ live: live(), gameId: 'g1', view: null, events: [], refs: refs(), onDone }),
  )
  // Nothing to replay yet, and nothing reported: the gate must keep waiting.
  expect(result.current.active).toBe(false)
  expect(onDone).not.toHaveBeenCalled()
})

it('deals again for a second match in the same mount', async () => {
  // The intro used to be keyed on `view.self.id` — this peer's own seat, which
  // is the same in every game it plays — and the "already reported" latch was
  // never reset. Together that made it once per PEER: a rematch without a
  // remount would have shown a table that dealt itself in silence.
  const onDone = vi.fn()
  const { rerender } = renderHook(
    (props: { id: string }) =>
      useDealIntro({
        live: live(),
        gameId: props.id,
        view: view(),
        events: events(),
        refs: refs(),
        onDone,
      }),
    { initialProps: { id: 'g1' } },
  )
  await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))

  rerender({ id: 'g2' })
  await waitFor(() => expect(onDone).toHaveBeenCalledTimes(2))
})

it('reports done exactly once even if the projection updates', async () => {
  const onDone = vi.fn()
  const { rerender } = renderHook(
    (props: { v: PlayerView }) =>
      useDealIntro({
        live: live(),
        gameId: 'g1',
        view: props.v,
        events: events(),
        refs: refs(),
        onDone,
      }),
    { initialProps: { v: view() } },
  )
  await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
  rerender({ v: view() })
  rerender({ v: view() })
  expect(onDone).toHaveBeenCalledTimes(1)
})
