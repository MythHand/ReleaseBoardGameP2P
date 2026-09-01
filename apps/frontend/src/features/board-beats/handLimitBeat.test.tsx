import { cardById } from '@release/ui'
import type { Leaving, Rect } from '@release/ui/animations'
import { scatterAt } from '@release/ui/animations'
import { act, render } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { BeatRun, BoardAnchors, BoardState, HandLimitHandoff } from '~/entities/game/board'
import { useHandLimitBeat } from './handLimitBeat'
import type { BeatPlan } from './planBeats'

// Same stubbing idiom as `discardBeat.test.tsx`: `useFlyer` stays real with its
// `raise` recorded (that is what says whether cards were flown INTO the grid),
// and `useDiscardExit` is replaced at the leaf — its own `send` reaches `play`
// through a sibling import the barrel mock never sees.
const raises = vi.hoisted(() => ({ keys: [] as string[] }))
const exits = vi.hoisted(() => ({ items: [] as Leaving[] }))
const order = vi.hoisted(() => ({ calls: [] as string[] }))
const resets = vi.hoisted(() => ({ flyer: 0, exit: 0 }))
vi.mock('@release/ui/animations', async (importOriginal) => {
  const real = await importOriginal<typeof import('@release/ui/animations')>()
  return {
    ...real,
    useFlyer: (...args: Parameters<typeof real.useFlyer>) => {
      const flyer = real.useFlyer(...args)
      return {
        ...flyer,
        raise: (items: Parameters<typeof flyer.raise>[0]) => {
          raises.keys.push(...items.map((i) => i.key))
          return flyer.raise(items)
        },
        drop: (key?: string) => {
          if (key == null) resets.flyer += 1
          flyer.drop(key)
        },
      }
    },
    useDiscardExit: () => ({
      overlay: [],
      send: (items: Leaving[]) => {
        order.calls.push('send')
        exits.items.push(...items)
        return Promise.resolve()
      },
      reset: () => {
        resets.exit += 1
      },
      FLIGHT_MS: 420,
    }),
  }
})

const node = () => document.createElement('div')

const base = {
  you: {
    name: 'You',
    hand: [
      { uid: 'u1', card: cardById('attack-bug') },
      { uid: 'u2', card: cardById('protection-debugger') },
    ],
    release: {},
  },
  opponents: [{ id: 'p2', name: 'Two', handCount: 3, release: {} }],
  decks: { main: [10], events: 5, discardCount: 0, discardHeap: [] },
  selfId: 'p1',
  history: [],
  setup: {},
  playable: [],
  frozen: [],
} as unknown as BoardState

const plan = (player = 'p1'): Extract<BeatPlan, { kind: 'handLimit' }> => ({
  kind: 'handLimit',
  key: 'handLimit:4',
  player,
  cards: [
    { key: 'd4', eventId: 4, card: 'attack-bug', source: { kind: 'hand', index: 0 } },
    {
      key: 'd5',
      eventId: 5,
      card: 'protection-debugger',
      source: { kind: 'hand', index: 1 },
    },
  ],
})

// `defenseBeat.test.tsx`'s own driver: a runner spanning real `wait()` delays
// needs its timers advanced while React commits in between.
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

function harness(handoff?: HandLimitHandoff | null, overrides: Partial<BoardAnchors> = {}) {
  const anchors = {
    bg: { current: node() },
    centre: { current: node() },
    hand: { current: node() },
    discardBox: { current: node() },
    handSlotAt: () => node(),
    releaseSlot: () => node(),
    seatBox: () => ({ left: 0, top: 0, width: 150, height: 210 }) as Rect,
    ...overrides,
  } as unknown as BoardAnchors
  const ref = { current: handoff ?? null }
  const api: { beat?: ReturnType<typeof useHandLimitBeat> } = {}
  function Probe() {
    api.beat = useHandLimitBeat(anchors, ref)
    return <>{api.beat.overlay}</>
  }
  return { api, Probe }
}

// The grid the local player built is standing: the beat must fly THOSE cells
// out and never raise a carrier to put a second copy of the card into them.
it('adopts the grid the actor already filled', async () => {
  raises.keys.length = 0
  exits.items.length = 0
  order.calls.length = 0
  const cells = [node(), node()]
  const handoff: HandLimitHandoff = {
    player: 'p1',
    cards: [
      // biome-ignore lint/style/noNonNullAssertion: known catalogue entry
      { uid: 'u1', card: cardById('attack-bug')!, slot: 0 },
      // biome-ignore lint/style/noNonNullAssertion: known catalogue entry
      { uid: 'u2', card: cardById('protection-debugger')!, slot: 1 },
    ],
    cellAt: (slot: number) => cells[slot] ?? null,
    release: vi.fn(() => order.calls.push('release')),
  }
  const { api, Probe } = harness(handoff)
  render(<Probe />)
  await drive(() => api.beat?.run(plan(), { base, publish: () => {} }))
  expect(raises.keys).toEqual([])
  expect(handoff.release).toHaveBeenCalledTimes(1)
  // each card leaves on its own event's scatter (I7), staggered by its slot
  expect(exits.items.map((i) => i.scatter)).toEqual([scatterAt(4), scatterAt(5)])
  expect(exits.items.map((i) => i.delay)).toEqual([0, 90])
  expect(exits.items.map((i) => i.layer)).toEqual([0, 1])
  // release and send are one handover: the static grid comes down immediately
  // before the exit carriers go up, with no awaited gap between them.
  expect(order.calls).toEqual(['release', 'send'])
})

// Everyone else has no grid: the beat builds one and flies the cards in from
// the actor's seat before the same hold and the same exit.
it('builds the grid itself for a discard that is not ours', async () => {
  raises.keys.length = 0
  exits.items.length = 0
  const { api, Probe } = harness(null)
  render(<Probe />)
  await drive(() => api.beat?.run(plan('p2'), { base, publish: () => {} }))
  expect(raises.keys).toHaveLength(2)
  expect(exits.items).toHaveLength(2)
})

// The shadow the beat publishes: the cards are gone from where they stood, and
// the heap is left to the projection that already holds them.
it('publishes the cards out of the hand and leaves the heap alone', async () => {
  raises.keys.length = 0
  exits.items.length = 0
  const published: BoardState[] = []
  const ctx: BeatRun = { base, publish: (s) => published.push(s) }
  const { api, Probe } = harness(null)
  render(<Probe />)
  await drive(() => api.beat?.run(plan(), ctx))
  expect(published).toHaveLength(1)
  expect(published[0].you.hand).toHaveLength(0)
  expect(published[0].decks.discardCount).toBe(base.decks.discardCount)
})

it('drops a card whose source rect is missing and leaves state to the projection', async () => {
  raises.keys.length = 0
  exits.items.length = 0
  const { api, Probe } = harness(null, { handSlotAt: () => null })
  render(<Probe />)
  await drive(() => api.beat?.run(plan(), { base, publish: () => {} }))
  expect(raises.keys).toEqual([])
  expect(exits.items).toEqual([])
})

it('resets both the grid carriers and the discard-exit carriers', () => {
  resets.flyer = 0
  resets.exit = 0
  const { api, Probe } = harness(null)
  render(<Probe />)
  act(() => api.beat?.reset())
  expect(resets.flyer).toBe(1)
  expect(resets.exit).toBe(1)
})
