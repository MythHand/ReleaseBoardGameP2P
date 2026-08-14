import type { Event } from '@release/engine'
import type { CardData } from '@release/ui'
import { cardById } from '@release/ui'
import { scatterAt } from '@release/ui/animations'
import { act, render } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { BoardAnchors, BoardState, IntroBeat } from '~/entities/game/board'
import { useBeats } from './useBeats'

const motion = vi.hoisted(() => ({ reduced: true }))
vi.mock('~/shared/lib/useReducedMotion', () => ({ useReducedMotion: () => motion.reduced }))

// `hang` parks the next flight mid-air: send() stores its resolver instead of
// resolving, so a test can hold a beat in flight — `draining` stays true — and
// choose the moment it lands. `release` is that moment.
const sent = vi.hoisted(() => ({
  calls: [] as unknown[][],
  hang: false,
  release: null as (() => void) | null,
}))
vi.mock('@release/ui/animations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@release/ui/animations')>()),
  useDiscardExit: () => ({
    overlay: [],
    send: (items: unknown[]) => {
      sent.calls.push(items)
      if (!sent.hang) return Promise.resolve()
      return new Promise<void>((r) => {
        sent.release = r
      })
    },
    reset: () => {},
    FLIGHT_MS: 420,
  }),
}))

const card = (id: string) => cardById(id) as CardData

// The board BEFORE the batch: the card is still in the fan. This is what the
// queue must keep on screen while the beat runs, and what a source rect is
// measured against.
const preDiscard = {
  you: { name: 'You', hand: [{ uid: 'u1', card: card('attack-bug') }], release: {} },
  opponents: [{ id: 'p2', name: 'Two', handCount: 3, release: {} }],
  decks: { main: [10], events: 5, discardCount: 0, discardHeap: [] },
  selfId: 'p1',
  history: [],
  setup: {},
  playable: [],
  frozen: [],
} as unknown as BoardState

// …and after: the card is gone from the hand and counted in the discard. The
// beat's last frame has to equal THIS.
const afterDiscard = {
  ...preDiscard,
  you: { ...preDiscard.you, hand: [] },
  decks: { ...preDiscard.decks, discardCount: 1 },
} as unknown as BoardState

const discardEvent = {
  id: 4,
  type: 'discarded',
  player: 'p1',
  card: 'attack-bug',
  reason: 'effect',
} as Event

// jsdom gives every element a zero rect, which is fine: the queue's job is to
// hand the step a rect, not to be right about layout. What matters is that a
// node exists for each anchor, because a MISSING one is the branch that drops a
// card from the flight.
//
// `handSlotAt` deliberately does NOT hand back a detached div. It queries the
// probe's real fan, exactly as the board's registry queries the real one, so it
// answers null when the slot is gone. The first version of this stub returned a
// fresh node on every call — which meant it measured the same whether the card
// was still on screen or not, and hid a defect where the queue measured the
// post-batch DOM and the local player's discard never flew at all.
const node = () => document.createElement('div')
const stub = {
  rail: { current: null },
  bg: { current: null },
  decks: { current: null },
  discard: { current: null },
  seats: { current: null },
  dock: { current: null },
  zone: { current: null },
  centre: { current: null },
  hand: { current: null },
  discardBox: { current: node() },
  seatOf: () => node(),
  seatBox: () => ({ left: 0, top: 0, width: 150, height: 210 }),
  handSlotAt: (i: number) => document.querySelectorAll<HTMLElement>('[data-hand-slot]')[i] ?? null,
  releaseSlot: () => node(),
  bindSeat: () => {},
  bindReleaseSlot: () => {},
  pileBox: () => null,
  bindPile: () => {},
} as unknown as BoardAnchors

// The opening's own shadow: a table with no hand at all, because the cards have
// not been dealt on screen yet. Distinct from preDiscard (a hand of one) and
// afterDiscard (a hand of none, but a card in the discard), so the probe can
// tell which of the three the board is showing.
const preDeal = {
  ...preDiscard,
  you: { ...preDiscard.you, hand: [] },
  decks: { ...preDiscard.decks, main: [40] },
} as unknown as BoardState

function Probe({
  live,
  events,
  anchors,
  intro,
}: {
  live: BoardState
  events: Event[]
  anchors: BoardAnchors
  intro?: IntroBeat | null
}) {
  const beats = useBeats({ live, events, anchors, enabled: true, intro })
  const shown = beats.shadow ?? live
  return (
    <>
      {/* The fan as the BOARD would render it — one slot per card of whichever
          state is showing. This is what `handSlotAt` queries, so a queue that
          measures before the shadow commits finds nothing here and the flight
          is dropped, which is precisely the failure worth catching. */}
      {shown.you.hand.map((c) => (
        <div key={c.uid} data-hand-slot />
      ))}
      <div data-testid="hand">{shown.you.hand.length}</div>
      {/* The deck tells the three states apart where the hand cannot: preDeal
          and afterDiscard both have an empty fan, and only the deck count says
          whether the board is showing the opening's shadow or the projection. */}
      <div data-testid="deck">{(beats.shadow ?? live).decks.main.join(',')}</div>
      <div data-testid="exclusive">{beats.exclusive ? 'exclusive' : 'open'}</div>
    </>
  )
}

// The probe renders the hand the BOARD would render — shadow if one is up,
// otherwise live. So "1" means the card is still in the fan and "0" means it has
// gone: the queue's whole observable behaviour, without asserting on internals.
//
// The first render is the pre-batch state (a hand of one), and the batch arrives
// on the rerender — which is the real sequence, and the only one where `settled`
// holds a projection the card is still in.
const mount = (intro?: IntroBeat | null) => {
  const utils = render(<Probe live={preDiscard} events={[]} anchors={stub} intro={intro} />)
  utils.rerender(<Probe live={afterDiscard} events={[discardEvent]} anchors={stub} intro={intro} />)
  return utils
}

// Let the queue get all the way through a beat. A beat now waits two animation
// frames before measuring — that is the fix for measuring against the DOM the
// batch left behind — and jsdom drives requestAnimationFrame on a real timer, so
// flushing microtasks alone no longer reaches the other side of it.
const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 80))))

// An opening that reports when it is told to, so a test can watch the order.
const introBeat = (log: string[], run?: () => Promise<void>): IntroBeat => ({
  key: 'g1',
  shadow: preDeal,
  run:
    run ??
    (() => {
      log.push('intro')
      return Promise.resolve()
    }),
  collapse: () => log.push('collapse'),
})

it('never animates when motion is reduced', async () => {
  motion.reduced = true
  sent.calls = []
  const { getByTestId } = mount()
  await flush()
  expect(sent.calls).toEqual([])
  // Straight to the end state: the card is gone, no beat ever ran.
  expect(getByTestId('hand').textContent).toBe('0')
})

it('keeps the card in the fan while its beat runs', () => {
  motion.reduced = false
  sent.calls = []
  const { getByTestId } = mount()
  expect(getByTestId('hand').textContent).toBe('1')
})

it('hands the board back to the live projection when the queue drains', async () => {
  motion.reduced = false
  const { getByTestId } = mount()
  await flush()
  expect(getByTestId('hand').textContent).toBe('0')
})

it('flies each card on the scatter the heap will rest it on', async () => {
  motion.reduced = false
  sent.calls = []
  mount()
  await flush()
  expect(sent.calls).toHaveLength(1)
  const [items] = sent.calls as [{ key: string; scatter: unknown }[]]
  expect(items).toHaveLength(1)
  expect(items[0].key).toBe('d4')
  // The identity this whole design rests on: the flight ends on the pose the
  // adapter's heap already holds for this card (I7). Task 2 folded the heap with
  // scatterAt(e.id); this is the same call on the same id.
  expect(items[0].scatter).toEqual(scatterAt(discardEvent.id))
})

it('leaves the table open — only the opening is exclusive', () => {
  motion.reduced = false
  const { getByTestId } = mount()
  expect(getByTestId('exclusive').textContent).toBe('open')
})

// ===== beat zero — the opening =====

it('runs the opening before anything the wire brought in', async () => {
  motion.reduced = false
  const log: string[] = []
  sent.calls = []
  mount(introBeat(log))
  // Twice, and the reason is the point of the test: these are two beats in
  // SEQUENCE. The opening drains inside the first window; only then does the
  // queue re-arm and start the discard, which needs a frame window of its own to
  // get past its wait-for-the-shadow. One flush would leave the second beat
  // still standing at the gate — and the assertion below would read that as
  // "the discard was dropped", which is the very thing it is here to disprove.
  await flush()
  await flush()
  // The opening went first, and the discard still happened — queued behind it,
  // not dropped in favour of it.
  expect(log).toEqual(['intro'])
  expect(sent.calls).toHaveLength(1)
})

it('holds the table and shows the opening’s own shadow while it runs', () => {
  motion.reduced = false
  // A run that never settles: the queue is parked on beat zero for this test.
  const { getByTestId } = mount(introBeat([], () => new Promise<void>(() => {})))
  expect(getByTestId('exclusive').textContent).toBe('exclusive')
  // The opening publishes a whole shape rather than animating away from a
  // projection, so the board shows THAT — a table not yet dealt, deck still at
  // 40 — and not the beat's base, whose deck is the projection's 10. The hand is
  // empty in both, which is exactly why this asserts on the deck.
  expect(getByTestId('deck').textContent).toBe('40')
})

it('hands the table back once the opening is over', async () => {
  motion.reduced = false
  const { getByTestId } = mount(introBeat([]))
  await flush()
  expect(getByTestId('exclusive').textContent).toBe('open')
})

// The opening is the one beat that owes something when it does NOT play: it
// reports this seat to the host's start gate, and until every seat has reported
// no peer may act. Skipping it silently would hold the match shut for everyone.
it('collapses the opening instead of running it when motion is reduced', async () => {
  motion.reduced = true
  const log: string[] = []
  mount(introBeat(log))
  await flush()
  expect(log).toEqual(['collapse'])
})

// The end of a match is exactly when discards fly, so the rematch's commit can
// land while a beat is still in the air. On that commit the arm effect unshifts
// the new opening and calls drain() — which returns at its `draining` guard
// instead of shifting the beat out synchronously — and the new-match reset then
// wipes the queue. If the reset runs AFTER the arm, it takes the opening with
// it, and `armed` already holds the new key so nothing ever re-arms: the
// opening never reports and the host's start gate never opens. The from-rest
// rematch path cannot see this — there drain() empties the queue before the
// reset lands — so this test parks a beat mid-flight first.
it('keeps the rematch’s opening when it lands while a beat is in flight', async () => {
  motion.reduced = false
  sent.calls = []
  const log: string[] = []
  const first = introBeat(log)
  // Match one: the opening plays out from rest…
  const utils = render(<Probe live={preDiscard} events={[]} anchors={stub} intro={first} />)
  await flush()
  // …then a discard beat takes off and is held mid-flight.
  sent.hang = true
  utils.rerender(<Probe live={afterDiscard} events={[discardEvent]} anchors={stub} intro={first} />)
  await flush()
  expect(sent.calls).toHaveLength(1)
  // The rematch arrives while the card is still in the air.
  const second: IntroBeat = {
    key: 'g2',
    shadow: preDeal,
    run: () => {
      log.push('intro2')
      return Promise.resolve()
    },
    collapse: () => log.push('collapse2'),
  }
  utils.rerender(<Probe live={preDiscard} events={[]} anchors={stub} intro={second} />)
  // The flight lands; the queue must still hold the second opening.
  sent.hang = false
  await act(async () => {
    sent.release?.()
    await new Promise((r) => setTimeout(r, 80))
  })
  expect(log).toEqual(['intro', 'intro2'])
})
