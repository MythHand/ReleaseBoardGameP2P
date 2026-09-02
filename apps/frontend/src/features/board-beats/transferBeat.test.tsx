import { act, render } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { BoardAnchors, BoardState } from '~/entities/game/board'
import type { BeatPlan } from './planBeats'
import { useTransferBeat } from './transferBeat'

const played = vi.hoisted(() => ({ names: [] as string[], shakes: [] as unknown[] }))
const arrivals = vi.hoisted(() => ({ handLengths: [] as number[], calls: 0 }))

vi.mock('@release/ui/animations', async (importOriginal) => {
  const real = await importOriginal<typeof import('@release/ui/animations')>()
  return {
    ...real,
    play: (name: string, _el: unknown, params?: unknown) => {
      played.names.push(name)
      if (name === 'shake') played.shakes.push(params)
      return { finished: Promise.resolve() } as unknown as Animation
    },
    useHandArrival: (...args: Parameters<typeof real.useHandArrival>) => {
      const step = real.useHandArrival(...args)
      return {
        ...step,
        arrive: (items: Parameters<typeof step.arrive>[0], handLength: number, at?: number) => {
          arrivals.calls += 1
          arrivals.handLengths.push(handLength)
          return step.arrive(items, handLength, at)
        },
      }
    },
  }
})

const base = {
  you: { name: 'You', hand: [{ uid: 'u1', card: { id: 'attack-bug' } }], release: {} },
  opponents: [{ id: 'p2', name: 'Two', handCount: 5, release: {} }],
  decks: { main: [10], events: 5, discardCount: 0 },
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
  seatBox: () => ({ left: 0, top: 0, width: 150, height: 210 }),
  seatOf: () => node(),
  handSlotAt: () => node(),
  releaseSlot: () => null,
  bindPile: () => {},
  bindSeat: () => {},
  bindReleaseSlot: () => {},
} as unknown as BoardAnchors

const transferPlan = (
  over: Partial<Extract<BeatPlan, { kind: 'handTransfer' }>> = {},
): Extract<BeatPlan, { kind: 'handTransfer' }> => ({
  kind: 'handTransfer',
  key: 'transfer:2',
  eventId: 2,
  from: 'p2',
  to: 'p1',
  card: 'attack-bug',
  role: 'taker',
  named: true,
  donorHand: 5,
  ...over,
})

function runTransfer(plan: Extract<BeatPlan, { kind: 'handTransfer' }>) {
  const published: BoardState[] = []
  const domSnapshots: string[] = []
  let start: (() => Promise<void>) | null = null
  function Probe() {
    const beat = useTransferBeat(anchors)
    start = () => beat.runTransfer(plan, { base, publish: (s) => published.push(s) })
    return <>{beat.overlay}</>
  }
  const view = render(<Probe />)
  return {
    published,
    view,
    domSnapshots,
    go: async () => {
      vi.useFakeTimers()
      try {
        let done = false
        const finished = start?.().then(() => {
          done = true
        })
        while (!done) {
          await act(async () => {
            await vi.advanceTimersByTimeAsync(20)
          })
          // Capture the DOM state after each animation frame
          domSnapshots.push(view.container.innerHTML)
        }
        await finished
      } finally {
        vi.useRealTimers()
      }
    },
  }
}

beforeEach(() => {
  played.names = []
  played.shakes = []
  arrivals.handLengths = []
  arrivals.calls = 0
})

it('flies a taken card out of the donor seat and into the fan', async () => {
  const r = runTransfer(transferPlan())
  await r.go()
  expect(played.names).toContain('takeFromSeat')
  expect(arrivals.calls).toBe(1)
  // it lands at the END of the fan: the engine appends what a hand gains, and
  // `toBoardState` passes that order through, so landing anywhere else makes
  // the last frame disagree with the projection it hands over to
  expect(arrivals.handLengths).toEqual([1])
})

it('drops the donor count as the card leaves the seat', async () => {
  // I7 — the beat's last frame IS the projection. The donor is one card lighter
  // on the live projection by the time this runs, so a beat that never said so
  // would pop the count on the handover.
  const r = runTransfer(transferPlan())
  await r.go()
  const counts = r.published.map((s) => s.opponents[0].handCount)
  expect(counts).toContain(4)
})

it('sends a lost card from the fan into the taker seat, and never into a hand', async () => {
  const r = runTransfer(transferPlan({ from: 'p1', to: 'p2', role: 'victim' }))
  await r.go()
  expect(played.names).toContain('dealToSeat')
  // THE assertion that separates the mirror from the original. `useHandArrival`
  // is the step for a card ARRIVING in the fan; a card leaving one must never
  // touch it. Pinned explicitly because it is exactly the kind of thing a later
  // refactor unifies by accident, and nothing else would notice.
  expect(arrivals.calls).toBe(0)
})

it('takes the lost card out of your own fan', async () => {
  const r = runTransfer(transferPlan({ from: 'p1', to: 'p2', role: 'victim' }))
  await r.go()
  const hands = r.published.map((s) => s.you.hand.length)
  expect(hands).toContain(0)
})

it('crosses the table closed when the event carried no card', async () => {
  const r = runTransfer(
    transferPlan({ from: 'p2', to: 'p3', role: 'watcher', card: undefined, named: false }),
  )
  await r.go()
  expect(played.names).toContain('takeFromSeat')
  expect(played.names).toContain('dealToSeat')
  // never turned over, and never handed to the fan
  expect(arrivals.calls).toBe(0)
})

it('leaks no identity into the DOM for a peer that is not a party', async () => {
  // The engine redacts `handTransfer.card` to `visibleTo: [from, to]`, and this
  // is the board keeping that promise. A `faceDown` prop is not enough on its
  // own — what matters is that no real card id is ever mounted, because a card
  // rendered face-down still carries its own art and name in the DOM.
  const r = runTransfer(
    transferPlan({ from: 'p2', to: 'p3', role: 'watcher', card: undefined, named: false }),
  )
  await r.go()
  // Check every snapshot captured during the flight
  for (const snapshot of r.domSnapshots) {
    expect(snapshot).not.toContain('attack-bug')
  }
})

const requestPlan = (
  over: Partial<Extract<BeatPlan, { kind: 'requested' }>> = {},
): Extract<BeatPlan, { kind: 'requested' }> => ({
  kind: 'requested',
  key: 'requested:1',
  eventId: 1,
  attacker: 'p1',
  target: 'p2',
  card: 'attack-bug',
  hit: true,
  ...over,
})

function runRequested(plan: Extract<BeatPlan, { kind: 'requested' }>, on: BoardState = base) {
  const published: BoardState[] = []
  let start: (() => Promise<void>) | null = null
  function Probe() {
    const beat = useTransferBeat(anchors)
    start = () => beat.runRequested(plan, { base: on, publish: (s) => published.push(s) })
    return <>{beat.overlay}</>
  }
  const view = render(<Probe />)
  return {
    published,
    view,
    go: async () => {
      vi.useFakeTimers()
      try {
        let done = false
        const finished = start?.().then(() => {
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
    },
  }
}

it('hands a hit over to the projection instead of holding it', async () => {
  // The named card has to survive the gap between two BATCHES — the transfer
  // comes from the victim's own RESOLVE — and no beat overlay can span that.
  // So the beat publishes the public `giveCard` pending and lets the board's
  // own render take the centre, which is why this leg is only an entrance.
  const r = runRequested(requestPlan({ hit: true }))
  await r.go()
  const pendings = r.published.map((s) => s.pending?.kind)
  expect(pendings).toContain('giveCard')
})

it('flinches the target seat on a miss, and takes nothing', async () => {
  const r = runRequested(requestPlan({ hit: false }))
  await r.go()
  expect(played.names).toContain('shake')
  // the story's values: a whole seat flinching, not the 7px settle sized for
  // an input field
  expect(played.shakes[0]).toMatchObject({ amp: 9, dur: 460, shape: 'spring' })
  expect(arrivals.calls).toBe(0)
  expect(r.published.map((s) => s.pending?.kind)).not.toContain('giveCard')
})

it('flinches your own fan when the miss is aimed at you', async () => {
  // To everyone else the target is a Seat; to the target there is no seat at
  // all — they are `you`, and what they own is the fan. Same gesture, rendered
  // as the target actually appears.
  //
  // Spying on the real `anchors.seatOf` rather than an unwired mock: the claim
  // is that the code never calls the seat lookup for its own outcome, and only
  // a spy on the lookup the code actually calls can prove that.
  const spy = vi.spyOn(anchors, 'seatOf')
  try {
    const own = { ...base, selfId: 'p2' } as BoardState
    const r = runRequested(requestPlan({ hit: false, target: 'p2' }), own)
    await r.go()
    expect(played.names).toContain('shake')
    expect(spy).not.toHaveBeenCalled()
  } finally {
    spy.mockRestore()
  }
})
