import { act, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import type { BoardState } from '~/entities/game/board'
import { useHandOrder } from './useHandOrder'

// The engine has no notion of hand ORDER — a player's arrangement of their own
// fan is presentation, private to the seat (others see only a count). So the
// order lives here, as an overlay applied to every projection on its way in.
// The bug this suite pins: the kit's reorder gesture animated a settle into the
// new slot and then committed to nothing, so the very next projection render
// snapped the card back to where the engine had it.

const hand = (...ids: string[]): BoardState =>
  ({
    you: {
      name: 'You',
      hand: ids.map((uid) => ({ uid, card: { id: `card-${uid}` } })),
      release: {},
    },
    opponents: [],
    decks: { main: [10], events: 5, discardCount: 0 },
    selfId: 'p1',
    history: [],
    setup: {},
    playable: [],
    frozen: [],
  }) as unknown as BoardState

const uids = (s: BoardState) => s.you.hand.map((c) => c.uid)
const items = (s: BoardState) => s.you.hand

it('is the identity while the player has not sorted anything', () => {
  const { result } = renderHook(() => useHandOrder('g1'))
  const live = hand('a', 'b', 'c')
  // The very same reference, not an equal copy: everything downstream keys
  // effects on `live`, and a fresh object per render would re-arm them all.
  expect(result.current.arrange(live)).toBe(live)
})

// The heart of the bug: the commit must OUTLIVE the projection render that
// used to undo it. A fresh, differently-ordered projection object stands in
// for "the next render from the wire".
it('keeps a committed order across fresh projections', () => {
  const { result } = renderHook(() => useHandOrder('g1'))
  const live = hand('a', 'b', 'c')
  act(() => result.current.commit(items(live), items(live), 'a', 2))
  expect(uids(result.current.arrange(hand('a', 'b', 'c')))).toEqual(['b', 'c', 'a'])
  // …and again, off another fresh object — nothing decays per render.
  expect(uids(result.current.arrange(hand('a', 'b', 'c')))).toEqual(['b', 'c', 'a'])
})

it('moves by the same splice rule as the canonical reorder commit', () => {
  // reorderHand (the playground's canonical commit) removes first, then
  // inserts — so moving `c` "to 0" from [a,b,c] gives [c,a,b]. The kit's
  // slotUnderCursor computes `to` under that rule; this pins the same one.
  const { result } = renderHook(() => useHandOrder('g1'))
  const live = hand('a', 'b', 'c')
  act(() => result.current.commit(items(live), items(live), 'c', 0))
  expect(uids(result.current.arrange(hand('a', 'b', 'c')))).toEqual(['c', 'a', 'b'])
})

it('puts a card the order has never seen at the end, where a draw lands', () => {
  const { result } = renderHook(() => useHandOrder('g1'))
  const live = hand('a', 'b', 'c')
  act(() => result.current.commit(items(live), items(live), 'a', 2))
  // Two draws arrive; the projection appends them. They stay appended, in the
  // projection's own relative order — the same end the draw beat lands on.
  expect(uids(result.current.arrange(hand('a', 'b', 'c', 'n1', 'n2')))).toEqual([
    'b',
    'c',
    'a',
    'n1',
    'n2',
  ])
})

it('lets a departed card go without disturbing the rest', () => {
  const { result } = renderHook(() => useHandOrder('g1'))
  const live = hand('a', 'b', 'c')
  act(() => result.current.commit(items(live), items(live), 'a', 2))
  // `c` was played: it simply is not in the projection any more.
  expect(uids(result.current.arrange(hand('a', 'b')))).toEqual(['b', 'a'])
})

// The fan can be rendered MINUS a staged card (the staging gesture filters it
// out while it waits at the centre), and the kit's `to` indexes that shorter
// list. The commit takes both lists so the hidden card keeps its own slot.
it('reorders around a staged card without moving it', () => {
  const { result } = renderHook(() => useHandOrder('g1'))
  const full = hand('a', 'b', 's', 'c') // `s` is staged, off the fan
  const visible = items(hand('a', 'b', 'c'))
  act(() => result.current.commit(items(full), visible, 'c', 0))
  // Visible order became [c,a,b]; `s` stays third, exactly where it was.
  expect(uids(result.current.arrange(hand('a', 'b', 's', 'c')))).toEqual(['c', 'a', 's', 'b'])
})

it('forgets the order when a new match starts', () => {
  const { result, rerender } = renderHook(({ key }) => useHandOrder(key), {
    initialProps: { key: 'g1' as string | null },
  })
  const live = hand('a', 'b', 'c')
  act(() => result.current.commit(items(live), items(live), 'a', 2))
  rerender({ key: 'g2' })
  // Uids are seeded per game (`id#n`), so game two REUSES game one's uids — a
  // surviving order would silently pre-sort the new deal.
  const fresh = hand('a', 'b', 'c')
  expect(result.current.arrange(fresh)).toBe(fresh)
})

it('ignores a commit for a card that is not in the fan', () => {
  const { result } = renderHook(() => useHandOrder('g1'))
  const live = hand('a', 'b')
  act(() => result.current.commit(items(live), items(live), 'ghost', 1))
  const fresh = hand('a', 'b')
  expect(result.current.arrange(fresh)).toBe(fresh)
})
