import type { CardData } from '@release/ui'
import { cardById } from '@release/ui'
import { act, render } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { BoardAnchors, BoardState } from '~/entities/game/board'
import { useDeckBeat } from './deckBeat'
import type { BeatPlan } from './planBeats'

const played = vi.hoisted(() => ({ names: [] as string[] }))
// One shared timeline for `publish` calls and `play` calls, so the split test
// can prove ORDER rather than only presence — the whole point of the branch
// (I1) is that the new pile is published before `flyFrom` measures it, and a
// test that only checks both things happened would still pass if that flipped.
const timeline = vi.hoisted(() => ({ events: [] as string[] }))
vi.mock('@release/ui/animations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@release/ui/animations')>()),
  play: (name: string) => {
    played.names.push(name)
    timeline.events.push(`play:${name}`)
    return { finished: Promise.resolve() } as unknown as Animation
  },
}))

const card = (id: string) => cardById(id) as CardData

const base = {
  you: { name: 'You', hand: [], release: {} },
  opponents: [],
  decks: {
    main: [24],
    events: 5,
    discardCount: 6,
    discardHeap: [],
    // A real top card: `deckReshuffled`/`fromDiscard` carry the discard's OWN
    // top, never an invented one, so the projection needs to actually hold one
    // for the flight to have anything to fly. `useBeats.test.tsx`'s `preDiscard`
    // fixture uses the same `cardById` helper for the same reason.
    discard: card('attack-bug'),
  },
  selfId: 'p1',
  history: [],
  setup: {},
  playable: [],
  frozen: [],
} as unknown as BoardState

const node = () => document.createElement('div')
const anchors = {
  hand: { current: node() },
  centre: { current: node() },
  discardBox: { current: node() },
  pileBox: () => node(),
  seatBox: () => null,
  seatOf: () => null,
  handSlotAt: () => null,
  releaseSlot: () => null,
  bindPile: () => {},
  bindSeat: () => {},
  bindReleaseSlot: () => {},
} as unknown as BoardAnchors

function harness() {
  const published: BoardState[] = []
  const api: { beat?: ReturnType<typeof useDeckBeat> } = {}
  function Probe() {
    api.beat = useDeckBeat(anchors)
    return <>{api.beat.overlay}</>
  }
  render(<Probe />)
  const ctx = {
    base,
    publish: (s: BoardState) => {
      published.push(s)
      timeline.events.push('publish')
    },
  }
  return { published, api, ctx }
}

// `drawBeat.test.tsx`'s established pattern: a runner that spans real `wait()`
// delays needs its intermediate DOM observed step by step, because React
// defers every state update queued inside a single async `act()` scope until
// that scope's own promise settles. A naive `act(async () => await run())`
// would never see `useFlyer`'s flyer mount mid-run, so `raise()` would return
// null elements the whole way through and every flight would be silently
// skipped — which is exactly the failure this harness exists to avoid.
async function drive(run: () => Promise<void> | undefined) {
  vi.useFakeTimers()
  try {
    let done = false
    const finished = Promise.resolve(run()).then(() => {
      done = true
    })
    while (!done) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20)
      })
    }
    await finished
  } finally {
    vi.useRealTimers()
  }
}

it('carries the discard onto the deck when the table recycles it', async () => {
  played.names = []
  timeline.events = []
  const { api, ctx } = harness()
  const plan = {
    kind: 'reshuffle',
    key: 'reshuffle:3',
    cards: 12,
  } as Extract<BeatPlan, { kind: 'reshuffle' }>
  await drive(() => api.beat?.runReshuffle(plan, ctx))
  expect(played.names).toContain('gatherToDeck')
})

it('skips the flight when the discard has no top card to carry', async () => {
  played.names = []
  const { api, ctx } = harness()
  const emptyDiscard = { ...ctx, base: { ...base, decks: { ...base.decks, discard: undefined } } }
  const plan = {
    kind: 'reshuffle',
    key: 'reshuffle:3',
    cards: 12,
  } as Extract<BeatPlan, { kind: 'reshuffle' }>
  await drive(() => api.beat?.runReshuffle(plan, emptyDiscard))
  // Nothing this beat may invent a face for: an empty discard means the flight
  // never starts, rather than carrying a fabricated card.
  expect(played.names).not.toContain('gatherToDeck')
})

// The new pile must be RENDERED before flyFrom can measure it — that is what
// the published shadow is for. A split that animated against the old pile list
// would have nothing to fly to.
it('publishes the new pile before it animates the split', async () => {
  played.names = []
  timeline.events = []
  const { api, ctx, published } = harness()
  const plan = {
    kind: 'piles',
    key: 'piles:5',
    steps: [{ kind: 'split', at: 0, piles: [12, 12] }],
  } as Extract<BeatPlan, { kind: 'piles' }>
  await drive(() => api.beat?.runPiles(plan, ctx))
  expect(published[0]?.decks.main).toEqual([12, 12])
  expect(played.names).toContain('flyFrom')
  // The ordering itself, not just that both things happened: `publish` must
  // precede the `flyFrom` play call in the shared timeline.
  const publishIndex = timeline.events.indexOf('publish')
  const flyFromIndex = timeline.events.indexOf('play:flyFrom')
  expect(publishIndex).toBeGreaterThanOrEqual(0)
  expect(flyFromIndex).toBeGreaterThan(publishIndex)
})

it('absorbs every other pile into the survivor on a merge', async () => {
  played.names = []
  const { api, ctx } = harness()
  const plan = {
    kind: 'piles',
    key: 'piles:5',
    steps: [{ kind: 'merge', withDiscard: false, piles: [24] }],
  } as Extract<BeatPlan, { kind: 'piles' }>
  const mergeCtx = { ...ctx, base: { ...base, decks: { ...base.decks, main: [12, 12] } } }
  await drive(() => api.beat?.runPiles(plan, mergeCtx))
  expect(played.names).toContain('absorbToDeck')
})

it('lands the discard as a further pile at the end of the row (fromDiscard)', async () => {
  played.names = []
  const { api, ctx, published } = harness()
  const plan = {
    kind: 'piles',
    key: 'piles:7',
    steps: [{ kind: 'fromDiscard', at: 1, piles: [24, 6] }],
  } as Extract<BeatPlan, { kind: 'piles' }>
  await drive(() => api.beat?.runPiles(plan, ctx))
  // The row now has the discard counted as a pile of its own...
  expect(published[0]?.decks.main).toEqual([24, 6])
  // ...and the flight that carries it found a face — the discard's own top,
  // read out of `ctx.base` while it still had one.
  expect(played.names).toContain('gatherToDeck')
})

// "Git Branch + Sudo" — the one real in-game batch that emits TWO pile steps
// at once: a split, then the discard landing as a further pile. `advance()`
// exists specifically so the second step runs against the table the FIRST
// one left, not the one the batch started with. The published SEQUENCE (not
// just the final state) is what tells a fresh re-read apart from a stale one.
it('runs the fromDiscard half of a split+fromDiscard batch against the split’s own result', async () => {
  played.names = []
  timeline.events = []
  const { api, ctx, published } = harness()
  const plan = {
    kind: 'piles',
    key: 'piles:9',
    steps: [
      { kind: 'split', at: 0, piles: [12, 12] },
      { kind: 'fromDiscard', at: 2, piles: [12, 12, 6] },
    ],
  } as Extract<BeatPlan, { kind: 'piles' }>
  await drive(() => api.beat?.runPiles(plan, ctx))
  // Two publishes, in order: the split's own row first, then that SAME row
  // with the discard appended — not the pre-batch row with a pile invented on
  // top of it.
  expect(published.map((s) => s.decks.main)).toEqual([
    [12, 12],
    [12, 12, 6],
  ])
  // The split's flight, then the discard's landing on the pile it just grew.
  const flyFromIndex = timeline.events.indexOf('play:flyFrom')
  const gatherIndex = timeline.events.indexOf('play:gatherToDeck')
  expect(flyFromIndex).toBeGreaterThanOrEqual(0)
  expect(gatherIndex).toBeGreaterThan(flyFromIndex)
})
