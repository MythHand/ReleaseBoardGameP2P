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

const sent = vi.hoisted(() => ({ calls: [] as unknown[][], hold: null as Promise<void> | null }))
vi.mock('@release/ui/animations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@release/ui/animations')>()),
  useDiscardExit: () => ({
    overlay: [],
    send: (items: unknown[]) => {
      sent.calls.push(items)
      // `hold` parks the beat mid-flight, for a test that has to observe the
      // board WHILE it is still up. Without it the beat's whole life can fall
      // inside a single async act() window — React holds the updates queued in
      // one until that window settles, so a beat that starts and ends inside it
      // renders once, at its end, and everything it showed on the way is
      // unobservable. One-shot, so a parked beat cannot leak into the next test.
      const held = sent.hold
      sent.hold = null
      return held ?? Promise.resolve()
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
  shadows,
}: {
  live: BoardState
  events: Event[]
  anchors: BoardAnchors
  intro?: IntroBeat | null
  shadows?: string[]
}) {
  const beats = useBeats({ live, events, anchors, enabled: true, intro })
  const shown = beats.shadow ?? live
  // Every DISTINCT board the SHADOW has shown, in order. A final-state
  // assertion cannot see a rollback: the board can go A → B → A → B and end
  // exactly where it should while the table visibly jumps on the way, so only
  // the sequence says whether anything was taken back. Consecutive duplicates
  // are dropped — a re-render that changes nothing is not a frame anybody could
  // see — and the live projection is not recorded at all, because between two
  // beats it is not what the board is showing.
  if (beats.shadow) {
    const row = beats.shadow.decks.main.join(',')
    if (shadows && shadows.at(-1) !== row) shadows.push(row)
  }
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

// The intro slot is the queue's own "here is a beat, run it" door. Using it
// keeps this test about the SHADOW rather than about planning.
const renderWithBeat = (run: (ctx: { publish: (s: BoardState) => void }) => Promise<void>) =>
  render(
    <Probe
      live={preDiscard}
      events={[]}
      anchors={stub}
      intro={{ key: 'g1', shadow: null, run, collapse: () => {} }}
    />,
  )

// The generalization of what the opening already did. A runner that publishes
// moves the board under itself — which is how the second card of a multi-draw
// aims at the fan the first one grew (I8), and how a split's new pile exists
// before it is measured.
it('renders what a running beat publishes, and drops it when the queue drains', async () => {
  motion.reduced = false
  sent.calls = []
  // A beat that parks after publishing, so the published state can be observed
  // while it is still up.
  const published = { ...preDiscard, decks: { ...preDiscard.decks, main: [7] } } as BoardState
  const { getByTestId } = renderWithBeat((ctx) => {
    ctx.publish(published)
    return new Promise<void>(() => {})
  })
  await flush()
  expect(getByTestId('deck').textContent).toBe('7')
})

// Git Branch landing in the same sync as a discard: two beats out of one batch,
// and the first of them moves the board. `[drawn(mine), …, discarded]` through
// `resolveAiEvent` is the same shape with a fan instead of a row.
const splitEvent = { id: 3, type: 'pilesChanged', piles: [4, 6] } as Event

// The projection the WHOLE batch produces — the row split and the card filed.
const afterBatch = {
  ...afterDiscard,
  decks: { ...afterDiscard.decks, main: [4, 6] },
} as unknown as BoardState

// A batch is planned in one pass against one projection, so every beat of it is
// handed the same base. That is right for the FIRST beat and wrong for every
// one after it the moment a beat moves the board under itself: the pile beat
// publishes the split row, and the beat behind it would render the row the
// batch started from. On a `[drawn(mine), pilesChanged]` batch that is the
// drawn card popping out of the fan and back into it — and the final state is
// correct the whole time, which is why this asserts the sequence.
it('does not let the next beat of a batch take back what the last one published', async () => {
  motion.reduced = false
  sent.calls = []
  // The second beat parks in its flight instead of finishing, so the board it
  // starts from is a state that can be looked at rather than one that flickers
  // past inside a single act() window.
  sent.hold = new Promise<void>(() => {})
  const shadows: string[] = []
  const utils = render(<Probe live={preDiscard} events={[]} anchors={stub} shadows={shadows} />)
  utils.rerender(
    <Probe
      live={afterBatch}
      events={[splitEvent, discardEvent]}
      anchors={stub}
      shadows={shadows}
    />,
  )
  // One window per step rather than one long one: React holds every update
  // queued inside a single async act() scope until that scope settles, so a
  // 700ms window would render the end state and nothing before it — and this
  // test is entirely about what came before it. Enough windows to cover both
  // beats: the pile beat spans a STEP_HOLD after its publish, and the discard
  // beat behind it needs a frame window of its own to get past its
  // wait-for-the-shadow.
  for (let i = 0; i < 10; i++) await flush()
  // The second beat really did start — without this the sequence below would
  // also be satisfied by a queue that dropped it.
  expect(sent.calls).toHaveLength(1)
  // The row the batch started from, then the split row the first beat
  // published — and nothing after it, because the second beat animates away
  // from the board the first one left. A third entry of '10' here is the
  // rollback: the fan (or, here, the row) snapping back mid-batch.
  expect(shadows).toEqual(['10', '4,6'])
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
