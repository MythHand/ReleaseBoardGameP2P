import { describe, expect, it } from 'vitest'
import { PILE_WIDTH, pileWidthFor } from './piles'

describe('the draw pile is one width', () => {
  it('is the width the screen was designed at', () => {
    expect(PILE_WIDTH).toBe(150)
  })

  // The ramp that used to live here (150 / 120 / 100 by pile count) was removed
  // at the designer's word: a draw pile is one size on every scene. This is the
  // test that fails if a count-dependent width is reintroduced.
  it('does not move with how many piles are on the table', () => {
    expect(pileWidthFor(1)).toBe(PILE_WIDTH)
    expect(pileWidthFor(2)).toBe(PILE_WIDTH)
    expect(pileWidthFor(3)).toBe(PILE_WIDTH)
    expect(pileWidthFor(10)).toBe(PILE_WIDTH)
  })

  // The old ramp read an array by index and fell through to 100 below it. There
  // is no lookup left to fall through, and a count of none is not a reason to
  // draw a different pile.
  it('answers the same with no piles to size at all', () => {
    expect(pileWidthFor(0)).toBe(PILE_WIDTH)
  })
})
