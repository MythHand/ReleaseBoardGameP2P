import { cardById } from '@release/ui'
import { scatterAt } from '@release/ui/animations'
import { describe, expect, it } from 'vitest'
import { type BoardState, standInScatter } from '~/entities/game/board'
import { withLanded, withStandIn } from './toHeap'

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

describe('withStandIn', () => {
  it('rests the card on the projection’s own stand-in, in place of an earlier one', () => {
    const next = withStandIn(
      heapOf(4, [
        ['d3', 'trigger-ai'],
        ['top2', 'attack-bug'],
      ]),
      { card: 'release-frontend', count: 5 },
    )
    expect(uids(next)).toEqual(['d3', 'top5'])
    expect(next.decks.discardHeap?.at(-1)).toMatchObject(standInScatter(5))
    expect(next.decks.discardCount).toBe(5)
    expect(next.decks.discard?.id).toBe('release-frontend')
  })
})
