import { cardById } from '@release/ui'
import { scatterAt } from '@release/ui/animations'
import { describe, expect, it } from 'vitest'
import type { BoardState } from '~/entities/game/board'
import { withLanded, withoutTopCopy } from './toHeap'

const c = (id: string) => cardById(id) as NonNullable<ReturnType<typeof cardById>>

const heapOf = (count: number, cards: [string, string][]): BoardState =>
  ({
    decks: {
      main: [5],
      events: 3,
      discardCount: count,
      discardHeap: cards.map(([uid, id]) => ({ uid, card: c(id), ...scatterAt(1) })),
    },
  }) as unknown as BoardState

const uids = (state: BoardState) => state.decks.discardHeap?.map((card) => card.uid)

describe('withLanded', () => {
  // a refused crush: its release rests as the stand-in for the top, and the
  // trigger beside it lands a moment later — under it, as the projection folds
  it('files a card under a stand-in the count has not passed', () => {
    const next = withLanded(heapOf(5, [['top6', 'release-frontend']]), [
      { eventId: 3, card: 'trigger-ai' },
    ])
    expect(uids(next)).toEqual(['d3', 'top6'])
    expect(next.decks.discardCount).toBe(6)
    expect(next.decks.discard?.id).toBe('release-frontend')
  })

  it('files a card over a stand-in the count has passed — it is no longer the top', () => {
    const next = withLanded(heapOf(6, [['top6', 'release-frontend']]), [
      { eventId: 9, card: 'attack-bug' },
    ])
    expect(uids(next)).toEqual(['top6', 'd9'])
    expect(next.decks.discard?.id).toBe('attack-bug')
  })
})

describe('withLanded — a card that lands late', () => {
  // A refused Crush: the destroyed release and the Code Review under it can come
  // down before the trigger beside them. The trigger was filed first, so it lies
  // under them — where the projection folds it — and not on top for a moment
  // before dropping under them (owner's recording, 04.10).
  it('lies under the cards already there that were filed after it', () => {
    const pair = heapOf(2, [
      ['d4', 'support-code-review'],
      ['d3', 'release-backend'],
    ])
    const next = withLanded(pair, [{ eventId: 1, card: 'trigger-ai' }])
    expect(uids(next)).toEqual(['d1', 'd4', 'd3'])
    expect(next.decks.discard?.id).toBe('release-backend')
  })

  // …while the cards of ONE landing keep the order the table gave them: the
  // Code Review under its release, though its event is the later one
  it('keeps the table order of the cards landing together', () => {
    const next = withLanded(heapOf(1, [['d1', 'trigger-ai']]), [
      { eventId: 4, card: 'support-code-review', layer: 0 },
      { eventId: 3, card: 'release-backend', layer: 1 },
    ])
    expect(uids(next)).toEqual(['d1', 'd4', 'd3'])
  })
})

describe('withoutTopCopy', () => {
  // the event names the card, not which copy: the topmost copy leaves, the one
  // the projection takes out for `takenFromDiscard`
  it('takes the topmost copy of the card out of the heap', () => {
    const next = withoutTopCopy(
      heapOf(3, [
        ['d1', 'release-frontend'],
        ['d2', 'attack-bug'],
        ['d3', 'release-frontend'],
      ]),
      'release-frontend',
    )
    expect(uids(next)).toEqual(['d1', 'd2'])
    expect(next.decks.discardCount).toBe(2)
    expect(next.decks.discard?.id).toBe('attack-bug')
  })
})
