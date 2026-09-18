// THE ROW A VARIABLE NUMBER OF CARDS MAKES AT THE CENTRE.
//
// The third shape the centre comes in, and the one that was missing. `centre.ts`
// holds a handful of NAMED places a scene declared; `discardGrid.ts` holds cells
// that are a function of a count and cannot be named. A row is the same kind of
// thing as the grid — you cannot list its places either — but it is one line,
// not a block: the cards that a play puts open at the centre, side by side.
//
// Two situations are that row today, and both were written twice before this
// file existed — once in the scene's CSS and once again in the board's:
//   • a play being assembled: the yellow support stands first and the card it
//     will enhance stands beside it, the empty place asking what it goes with;
//   • System Upgrade: one card per seat that answered.
//
// Kept here for the reason the whole folder exists: geometry written in a CSS
// module can be neither aimed at by a flight nor asked about by a test, which is
// exactly how one layout ends up written twice and equal by attention alone.
//
// THE SAME BOUNDARY AS `centre.ts`: a place is WHERE a card arrives. There is no
// angle here. Whether the cards of a row lie square or at their own angle is the
// SITUATION's, and it is recorded as a character rather than a number — the
// scatter that gives a card its angle stays the one source of that (I11).
import type { CSSProperties } from 'react'
import { CARD_RATIO } from '@/primitives/Card'
import { CENTRE_TOP, type CentreTilt } from './centre'

/** One place in the row, as an offset from the centre point. */
export interface RowCell {
  /** offset from the centre of the table, px (0 is the middle) */
  dx: number
  /** the card's width here, px */
  w: number
  /** …and its height, from the card ratio — a flight aims at this box (I6) */
  h: number
}

export interface RowShape {
  /** card width in this row, px */
  w: number
  /** between neighbours, px */
  gap: number
  /** do these cards lie square, or each at its own angle */
  tilt: CentreTilt
  /** the playground scene the values were transcribed from */
  from: string
}

/**
 * The rows, by game situation — the same rule sets follow in `centre.ts`: a row
 * exists here only once a scene has shown it, and its numbers are that scene's.
 * The gap belongs to the situation rather than to the centre: the two rows below
 * genuinely differ, and one shared constant would be a value nobody chose.
 */
export const CENTRE_ROWS = {
  /**
   * A play being assembled, open to the table: the card pulled out of the fan
   * stands here and waits for the one it goes with. Square — a card waiting is
   * not a card played, the same reading a release awaiting its cost gets in
   * `centre.ts`.
   */
  staging: { w: 150, gap: 18, tilt: 'square', from: 'DeckAnimationsStory' },
  /** Every seat's answer to a System Upgrade, face up at the centre. */
  upgrade: { w: 150, gap: 24, tilt: 'square', from: 'GitCards · SystemUpgrade' },
} satisfies Record<string, RowShape>

export type CentreRow = keyof typeof CENTRE_ROWS

/**
 * Every place of an `n`-card row, as offsets from the centre point. `n` is the
 * row's FULL length, including places nothing stands in yet: an assembling play
 * asks for two from the first card on, because the gap where the second card
 * goes is the question being asked.
 */
export function rowCells(row: CentreRow, n: number): RowCell[] {
  const { w, gap } = CENTRE_ROWS[row]
  const h = w * CARD_RATIO
  const count = Math.max(n, 1)
  const width = count * w + (count - 1) * gap
  return Array.from({ length: count }, (_, i) => ({
    dx: i * (w + gap) - width / 2 + w / 2,
    w,
    h,
  }))
}

/**
 * The whole style of the i-th place of the row — the pair to `centrePlaceStyle`,
 * and it reads the same: height, offset, width. No layer: a row's places stand
 * beside each other and never overlap, so declaring one would create a stacking
 * context the scene never had.
 */
export const rowPlaceStyle = (row: CentreRow, n: number, i: number): CSSProperties => {
  const cell = rowCells(row, n)[i] ?? rowCells(row, 1)[0]
  return {
    insetBlockStart: `${CENTRE_TOP}%`,
    insetInlineStart: '50%',
    inlineSize: `${cell.w}px`,
    transform: `translate(calc(-50% + ${cell.dx}px), -50%)`,
  }
}
