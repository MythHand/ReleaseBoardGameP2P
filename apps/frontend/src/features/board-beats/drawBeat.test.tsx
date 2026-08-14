import { act, render } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { BoardAnchors, BoardState } from '~/entities/game/board'
import { useDrawBeat } from './drawBeat'
import type { PlannedDraw } from './planBeats'

const played = vi.hoisted(() => ({ names: [] as string[] }))
vi.mock('@release/ui/animations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@release/ui/animations')>()),
  play: (name: string) => {
    played.names.push(name)
    return { finished: Promise.resolve() } as unknown as Animation
  },
  // `useDiscardExit` (apps/ui/src/animations/useDiscardExit.tsx) imports
  // `play` from its own sibling module (`./play`), not from this barrel — so
  // the mock above never sees its `centerToDiscard` call; the real function
  // runs underneath it regardless of the mock. `useBeats.test.tsx` hits the
  // same wall for the discard beat and stubs the whole hook instead of the
  // leaf it calls internally; this does the same; `flipCard` (Card's own flip,
  // played from `patch`) has the identical gap and the fourth test's own
  // comment already says as much — this closes the one case that IS asserted on.
  useDiscardExit: () => ({
    overlay: [],
    send: (_items: unknown[]) => {
      played.names.push('centerToDiscard')
      return Promise.resolve()
    },
    reset: () => {},
    FLIGHT_MS: 420,
  }),
}))

const base = {
  you: { name: 'You', hand: [], release: {} },
  opponents: [{ id: 'p2', name: 'Two', handCount: 3, release: {} }],
  decks: { main: [10], events: 5, discardCount: 0, discardHeap: [] },
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
  handSlotAt: () => null,
  releaseSlot: () => null,
  bindPile: () => {},
  bindSeat: () => {},
  bindReleaseSlot: () => {},
} as unknown as BoardAnchors

const draw = (over: Partial<PlannedDraw> = {}): PlannedDraw => ({
  key: 'w4',
  eventId: 4,
  player: 'p1',
  pile: 0,
  mine: true,
  card: 'attack-bug',
  ...over,
})

function run(draws: PlannedDraw[]) {
  const published: BoardState[] = []
  let start: (() => Promise<void>) | null = null
  function Probe() {
    const beat = useDrawBeat(anchors)
    start = () =>
      beat.run(
        { kind: 'draw', key: 'draw:4', draws },
        {
          base,
          publish: (s) => published.push(s),
        },
      )
    return <>{beat.overlay}</>
  }
  render(<Probe />)
  return {
    published,
    // `act(async () => await start())` alone never sees the runner's
    // intermediate DOM: React defers every update scheduled while an async
    // act() scope is open (they queue in `ReactSharedInternals.actQueue`) and
    // only flushes them once that scope's own promise settles — so a beat
    // that spans real `wait()` delays would never observe `useFlyer`'s flyer
    // mount mid-run, and `elOf('draw')` would read null the whole way through.
    // Fake timers advanced in small steps, each its own `act()` call (the same
    // shape `boardIntro.test.tsx` uses for the real deal), force a flush after
    // every step, so the runner sees the real DOM as it actually stands.
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

it('takes my own card to the centre, turns it over, and sits it in the fan', async () => {
  played.names = []
  const { published, go } = run([draw()])
  await go()
  expect(played.names).toContain('drawToCenter')
  // The hand it publishes is the fan the NEXT card of the batch must aim at.
  expect(published.at(-1)?.you.hand.map((h) => h.card.id)).toEqual(['attack-bug'])
})

it('sends an opponent’s card to their seat, face down', async () => {
  played.names = []
  const { published, go } = run([draw({ player: 'p2', mine: false, card: undefined })])
  await go()
  expect(played.names).toEqual(['drawToCenter', 'dealToSeat'])
  // Their count goes up; nothing enters this peer's fan, and no identity is
  // invented for a card the projection never named.
  expect(published.at(-1)?.opponents[0].handCount).toBe(4)
})

it('grows the fan between the cards of a multi-draw (I8)', async () => {
  played.names = []
  const { published, go } = run([draw(), draw({ key: 'w5', eventId: 5, card: 'attack-ddos' })])
  await go()
  expect(published.at(-1)?.you.hand).toHaveLength(2)
})

it('reveals a trigger at the centre and files it in the discard itself', async () => {
  played.names = []
  const { go } = run([
    draw({ card: undefined, reveal: { card: 'trigger-error-503', discardId: 6 } }),
  ])
  await go()
  // The reveal ends where the card is filed: it stands at the centre, so it
  // leaves from the centre. flipCard is played by `patch`, not by `play`.
  expect(played.names).toContain('drawToCenter')
  expect(played.names).toContain('centerToDiscard')
})
