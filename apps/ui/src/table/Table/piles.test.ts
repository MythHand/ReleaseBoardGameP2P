import { describe, expect, it } from 'vitest'
import { pileWidthFor } from './piles'

describe('pileWidthFor', () => {
  it('is the screen-designed width for a single pile', () => {
    expect(pileWidthFor(1)).toBe(150)
  })

  it('comes down a step at two piles', () => {
    expect(pileWidthFor(2)).toBe(120)
  })

  it('comes down again at three — the most Git Branch plus Sudo can put out', () => {
    expect(pileWidthFor(3)).toBe(100)
  })

  // The ramp has no fourth step; PILE_W[Math.min(count, 3) - 1] clamps the
  // lookup at index 2, so four-and-up reads the same as three.
  it('clamps at three piles worth of width for anything wider', () => {
    expect(pileWidthFor(4)).toBe(100)
    expect(pileWidthFor(10)).toBe(100)
  })

  // count <= 0 pushes the index below 0, where the array has nothing — the
  // `?? 100` branch this test exists to pin.
  it('falls back to 100 when there is no pile to size at all', () => {
    expect(pileWidthFor(0)).toBe(100)
  })
})
