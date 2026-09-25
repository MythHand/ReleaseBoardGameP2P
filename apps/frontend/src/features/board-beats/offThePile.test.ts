import { describe, expect, it } from 'vitest'
import type { BoardState } from '~/entities/game/board'
import { offThePile } from './offThePile'

const withPiles = (main: number[]) =>
  ({ decks: { main, events: 5, discardCount: 0 } }) as unknown as BoardState

describe('offThePile', () => {
  it('takes the card off its own pile the moment it takes off', () => {
    const published: BoardState[] = []
    const ctx = { base: withPiles([10, 7]), publish: (s: BoardState) => published.push(s) }
    offThePile(ctx, 1)
    expect(ctx.base.decks.main).toEqual([10, 6])
    // the base moves with the publish: what the beat builds next starts here
    expect(published).toEqual([ctx.base])
  })

  it('leaves an empty pile at nothing, and publishes nothing for it', () => {
    const published: BoardState[] = []
    const ctx = { base: withPiles([0]), publish: (s: BoardState) => published.push(s) }
    offThePile(ctx, 0)
    expect(ctx.base.decks.main).toEqual([0])
    expect(published).toEqual([])
  })
})
