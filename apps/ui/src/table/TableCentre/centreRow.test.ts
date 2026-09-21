import { describe, expect, it } from 'vitest'
import { CENTRE_ROWS, rowCells, rowPlaceStyle } from './centreRow'

// The row's rules, which a stylesheet cannot be asked about — the same reason
// `centre.test.ts` and `discardGrid.test.ts` exist next door. The values are the
// approved scenes'; this file only pins that they are still true, and that the
// row keeps the two properties every centre layout has to keep: it is centred on
// the centre point, and neighbours are exactly one gap apart.
describe('the row a play makes at the centre', () => {
  it('centres the row on the centre point, whatever its length', () => {
    for (const n of [1, 2, 3, 5]) {
      const cells = rowCells('upgrade', n)
      const mid = cells.reduce((sum, c) => sum + c.dx, 0) / cells.length
      expect(Math.abs(mid)).toBeLessThan(0.001)
    }
  })

  it('leaves exactly one gap between neighbours', () => {
    for (const row of ['staging', 'upgrade'] as const) {
      const cells = rowCells(row, 3)
      expect(cells[1].dx - cells[0].dx).toBeCloseTo(cells[0].w + CENTRE_ROWS[row].gap)
      expect(cells[2].dx - cells[1].dx).toBeCloseTo(cells[0].w + CENTRE_ROWS[row].gap)
    }
  })

  // A single card sits in the middle — which is what makes the two-place ask
  // below readable as an ask: with the second place declared, the first moves
  // off centre and the empty half is visible.
  it('puts a lone card in the middle, and moves it aside once a place is kept beside it', () => {
    expect(rowCells('staging', 1)[0].dx).toBe(0)
    const pair = rowCells('staging', 2)
    expect(pair[0].dx).toBeLessThan(0)
    expect(pair[1].dx).toBe(-pair[0].dx)
  })

  // The row is asked for its geometry before anything stands in it.
  it('never yields a row of nothing', () => {
    expect(rowCells('staging', 0)).toHaveLength(1)
    expect(rowPlaceStyle('staging', 0, 0).inlineSize).toBe('150px')
  })

  it('aims at a card box, not at a square', () => {
    const [cell] = rowCells('upgrade', 1)
    expect(cell.h).toBeGreaterThan(cell.w)
  })

  // Out-of-range asks happen while a row is shrinking under a beat that still
  // holds an old index; the place falls back rather than throwing.
  it('answers an index the row does not have', () => {
    expect(rowPlaceStyle('upgrade', 2, 9).inlineSize).toBe('150px')
  })
})
