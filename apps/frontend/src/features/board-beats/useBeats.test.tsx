import type { Event } from '@release/engine'
import type { CardData } from '@release/ui'
import { cardById } from '@release/ui'
import { scatterAt } from '@release/ui/animations'
import { act, render } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { BoardAnchors, BoardState } from '~/entities/game/board'
import { useBeats } from './useBeats'

const motion = vi.hoisted(() => ({ reduced: true }))
vi.mock('~/shared/lib/useReducedMotion', () => ({ useReducedMotion: () => motion.reduced }))

const sent = vi.hoisted(() => ({ calls: [] as unknown[][] }))
vi.mock('@release/ui/animations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@release/ui/animations')>()),
  useDiscardExit: () => ({
    overlay: [],
    send: (items: unknown[]) => {
      sent.calls.push(items)
      return Promise.resolve()
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
  decks: { main: 10, events: 5, discardCount: 0, discardHeap: [] },
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
const node = () => document.createElement('div')
const stub = {
  rail: { current: null },
  bg: { current: null },
  decks: { current: null },
  discard: { current: null },
  seats: { current: null },
  dock: { current: null },
  zone: { current: null },
  deckBox: { current: null },
  centre: { current: null },
  hand: { current: null },
  discardBox: { current: node() },
  seatOf: () => node(),
  seatBox: () => ({ left: 0, top: 0, width: 150, height: 210 }),
  handSlotAt: () => node(),
  releaseSlot: () => node(),
  bindSeat: () => {},
  bindReleaseSlot: () => {},
} as unknown as BoardAnchors

function Probe({
  live,
  events,
  anchors,
}: {
  live: BoardState
  events: Event[]
  anchors: BoardAnchors
}) {
  const beats = useBeats({ live, events, anchors, enabled: true })
  return (
    <>
      <div data-testid="hand">{(beats.shadow ?? live).you.hand.length}</div>
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
const mount = () => {
  const utils = render(<Probe live={preDiscard} events={[]} anchors={stub} />)
  utils.rerender(<Probe live={afterDiscard} events={[discardEvent]} anchors={stub} />)
  return utils
}

it('never animates when motion is reduced', async () => {
  motion.reduced = true
  sent.calls = []
  const { getByTestId } = mount()
  await act(async () => {})
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
  await act(async () => {})
  expect(getByTestId('hand').textContent).toBe('0')
})

it('flies each card on the scatter the heap will rest it on', async () => {
  motion.reduced = false
  sent.calls = []
  mount()
  await act(async () => {})
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
