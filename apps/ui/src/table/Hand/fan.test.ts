import { describe, expect, it } from 'vitest'
import { handStep, insertPath } from './fan'

// The rule these guard is "a card enters the fan round from the LEFT", and it
// exists so the layer switch mid-landing has as little overlap as possible to
// change hands. Every assertion below is that rule, not the arithmetic that
// happens to implement it — the curve may be retuned, the direction may not.

const LEFT_OF = { x: 400, y: 300 } // a slot somewhere on screen
const HIGH_ABOVE = { x: 400, y: 120 }
const LEVEL = { x: 380, y: 300 }

const leftmost = (path: { x: number; y: number }[]) => Math.min(...path.map((p) => p.x))

describe('insertPath', () => {
  it('starts where the card is and ends on the slot', () => {
    const path = insertPath(HIGH_ABOVE, LEFT_OF, 3, 8)
    expect(path[0]).toEqual(HIGH_ABOVE)
    expect(path[path.length - 1]).toEqual(LEFT_OF)
  })

  it('comes round the LEFT of the slot', () => {
    const path = insertPath(HIGH_ABOVE, LEFT_OF, 3, 8)
    expect(leftmost(path)).toBeLessThan(Math.min(HIGH_ABOVE.x, LEFT_OF.x))
  })

  it('bulges about half a step out — the offset the layer switch needs', () => {
    const path = insertPath(LEVEL, LEFT_OF, 3, 8)
    const bulge = LEFT_OF.x - leftmost(path)
    expect(bulge).toBeGreaterThan(handStep(8) * 0.35)
    expect(bulge).toBeLessThan(handStep(8) * 0.75)
  })

  it('goes straight into the last slot — nothing there to tuck under', () => {
    const path = insertPath(HIGH_ABOVE, LEFT_OF, 7, 8)
    for (const p of path) {
      // the straight line between two points that share an x IS that x
      expect(p.x).toBeCloseTo(LEFT_OF.x, 6)
    }
  })

  it('takes a different line depending on how high the card was let go', () => {
    const high = insertPath(HIGH_ABOVE, LEFT_OF, 3, 8)
    const level = insertPath({ ...HIGH_ABOVE, y: LEFT_OF.y }, LEFT_OF, 3, 8)
    // released level, the card comes round flat and therefore further out
    expect(leftmost(level)).toBeLessThan(leftmost(high))
  })

  it('does not swing the curve over when the release crosses the slot', () => {
    // a pixel either side of the slot must not change the approach — the arc is
    // read off the HEIGHT, never off which side the pointer happens to be on
    const justLeft = insertPath({ x: LEFT_OF.x - 1, y: 200 }, LEFT_OF, 3, 8)
    const justRight = insertPath({ x: LEFT_OF.x + 1, y: 200 }, LEFT_OF, 3, 8)
    expect(Math.abs(leftmost(justLeft) - leftmost(justRight))).toBeLessThan(2)
  })

  it('scales the sweep with the fan, not with pixels', () => {
    const loose = insertPath(LEVEL, LEFT_OF, 3, 6)
    const tight = insertPath(LEVEL, LEFT_OF, 3, 20)
    expect(LEFT_OF.x - leftmost(loose)).toBeGreaterThan(LEFT_OF.x - leftmost(tight))
  })
})
