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
const raises = vi.hoisted(() => ({ keys: [] as string[], at: [] as Rect[] }))
const played = vi.hoisted(() => ({ moves: [] as { from: Rect; to: Rect }[] }))
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
          order.calls.push('raise')
          raises.keys.push(...items.map((i) => i.key))
          raises.at.push(...items.map((i) => i.at))
          return flyer.raise(items)
        },
        drop: (key?: string) => {
          if (key == null) resets.flyer += 1
          flyer.drop(key)
        },
      }
    },
    play: (...args: Parameters<typeof real.play>) => {
      const [name, , params = {}] = args
      if (name === 'playToCenter') {
        order.calls.push('move')
        played.moves.push({ from: params.from as Rect, to: params.to as Rect })
      }
      return real.play(...args)
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

const nodeAt = (rect: Rect) => {
  const el = node()
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    ...rect,
    x: rect.left,
    y: rect.top,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    toJSON: () => rect,
  })
  return el
}

const knownCard = (id: string) => {
  const card = cardById(id)
  if (!card) throw new Error(`missing test catalogue card: ${id}`)
  return card
}

const attackCard = knownCard('attack-bug')
const protectionCard = knownCard('protection-debugger')
const otherCard = knownCard('operation-git-branch')

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
async function drive(run: () => Promise<void> | undefined, afterStart?: () => void) {
  vi.useFakeTimers()
  try {
    let done = false
    const started = run()
    afterStart?.()
    const finished = Promise.resolve(started).then(() => {
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
  return { api, Probe, ref }
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

it('keeps the handoff captured when the page clears its ref during the first frame wait', async () => {
  raises.keys.length = 0
  exits.items.length = 0
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
    release: vi.fn(),
  }
  const { api, Probe, ref } = harness(handoff)
  render(<Probe />)
  await drive(
    () => api.beat?.run(plan(), { base, publish: () => {} }),
    () => {
      ref.current = null
    },
  )
  expect(raises.keys).toEqual([])
  expect(handoff.release).toHaveBeenCalledTimes(1)
  expect(exits.items).toHaveLength(2)
})

it.each([
  {
    shape: 'missing',
    cards: [{ uid: 'u1', card: attackCard, slot: 0 }],
  },
  {
    shape: 'extra',
    cards: [
      { uid: 'u1', card: attackCard, slot: 0 },
      { uid: 'u2', card: protectionCard, slot: 1 },
      { uid: 'u3', card: otherCard, slot: 2 },
    ],
  },
  {
    shape: 'duplicate',
    cards: [
      { uid: 'u1', card: attackCard, slot: 0 },
      { uid: 'u2', card: attackCard, slot: 1 },
    ],
  },
  {
    shape: 'mismatched',
    cards: [
      { uid: 'u1', card: attackCard, slot: 0 },
      { uid: 'u2', card: otherCard, slot: 1 },
    ],
  },
])('builds the complete grid instead of partially adopting a $shape handoff', async ({ cards }) => {
  raises.keys.length = 0
  exits.items.length = 0
  const handoff: HandLimitHandoff = {
    player: 'p1',
    cards,
    cellAt: () => node(),
    release: vi.fn(),
  }
  const { api, Probe } = harness(handoff)
  render(<Probe />)
  await drive(() => api.beat?.run(plan(), { base, publish: () => {} }))
  expect(raises.keys).toEqual(['hl4', 'hl5'])
  expect(exits.items).toHaveLength(2)
  expect(handoff.release).not.toHaveBeenCalled()
})

it('falls through to the whole projection when one adopted cell cannot be measured', async () => {
  raises.keys.length = 0
  exits.items.length = 0
  order.calls.length = 0
  const cells = [node(), null]
  const handoff: HandLimitHandoff = {
    player: 'p1',
    cards: [
      { uid: 'u1', card: attackCard, slot: 0 },
      { uid: 'u2', card: protectionCard, slot: 1 },
    ],
    cellAt: (slot: number) => cells[slot] ?? null,
    release: vi.fn(() => order.calls.push('release')),
  }
  const { api, Probe } = harness(handoff)
  render(<Probe />)

  await drive(() => api.beat?.run(plan(), { base, publish: () => {} }))

  // One unmeasurable member makes the adopted exit all-or-nothing. The held
  // grid yields as a whole to the accepted projection; no partial carrier set
  // tells the table that only one of two discards happened.
  expect(raises.keys).toEqual([])
  expect(exits.items).toEqual([])
  expect(handoff.release).toHaveBeenCalledTimes(1)
  expect(order.calls).toEqual(['release'])
})

// Everyone else has no grid: the beat builds one and flies the cards in from
// the actor's seat before the same hold and the same exit.
it('builds the grid itself for a discard that is not ours', async () => {
  raises.keys.length = 0
  raises.at.length = 0
  played.moves.length = 0
  exits.items.length = 0
  order.calls.length = 0
  const handSlotAt = vi.fn(() => node())
  const sources: Rect[] = [
    { left: 25, top: 35, width: 145, height: 203 },
    { left: 45, top: 55, width: 135, height: 189 },
  ]
  let source = 0
  const seatBox = vi.fn(() => sources[source++] ?? null)
  const table = { left: 100, top: 200, width: 1000, height: 600 }
  const targets: Rect[] = [
    { left: 444, top: 359, width: 150, height: 210 },
    { left: 606, top: 359, width: 150, height: 210 },
  ]
  const { api, Probe } = harness(null, {
    bg: { current: nodeAt(table) },
    handSlotAt,
    seatBox,
  })
  const remotePlan = {
    ...plan('p2'),
    cards: plan('p2').cards.map((card) => ({
      ...card,
      source: { kind: 'seat' as const, player: 'p2' },
    })),
  }
  render(<Probe />)
  await drive(() =>
    api.beat?.run(remotePlan, {
      base,
      publish: () => order.calls.push('publish'),
    }),
  )
  expect(handSlotAt).not.toHaveBeenCalled()
  expect(seatBox).toHaveBeenNthCalledWith(1, 'p2')
  expect(seatBox).toHaveBeenNthCalledWith(2, 'p2')
  expect(raises.keys).toEqual(['hl4', 'hl5'])
  expect(raises.at).toEqual(sources)
  expect(played.moves).toEqual([
    { from: sources[0], to: targets[0] },
    { from: sources[1], to: targets[1] },
  ])
  expect(exits.items.map((item) => item.from)).toEqual(targets)
  expect(exits.items).toHaveLength(2)
  expect(order.calls).toEqual(['publish', 'raise', 'move', 'move', 'send'])
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

it('never raises or exits an unknown catalogue card from a malformed build plan', async () => {
  raises.keys.length = 0
  exits.items.length = 0
  const malformed = {
    ...plan('p2'),
    cards: [{ ...plan('p2').cards[0], card: 'not-in-the-catalogue' }, plan('p2').cards[1]],
  } as unknown as Extract<BeatPlan, { kind: 'handLimit' }>
  const { api, Probe } = harness(null)
  render(<Probe />)

  await drive(() => api.beat?.run(malformed, { base, publish: () => {} }))

  expect(raises.keys).toEqual(['hl5'])
  expect(exits.items.map((item) => item.card.id)).toEqual(['protection-debugger'])
  expect(exits.items.map((item) => item.layer)).toEqual([1])
})

it('does not release or send an old grid after reset interrupts its hold', async () => {
  exits.items.length = 0
  order.calls.length = 0
  const cells = [node(), node()]
  const handoff: HandLimitHandoff = {
    player: 'p1',
    cards: [
      { uid: 'u1', card: attackCard, slot: 0 },
      { uid: 'u2', card: protectionCard, slot: 1 },
    ],
    cellAt: (slot: number) => cells[slot] ?? null,
    release: vi.fn(() => order.calls.push('release')),
  }
  const { api, Probe } = harness(handoff)
  render(<Probe />)

  await drive(
    () => api.beat?.run(plan(), { base, publish: () => {} }),
    () => {
      // `nextFrames()` has completed by then and the adopted grid is inside
      // GATHER_HOLD. Reset belongs to a new match and invalidates this tail.
      window.setTimeout(() => api.beat?.reset(), 100)
    },
  )

  expect(handoff.release).not.toHaveBeenCalled()
  expect(exits.items).toEqual([])
  expect(order.calls).not.toContain('send')
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
