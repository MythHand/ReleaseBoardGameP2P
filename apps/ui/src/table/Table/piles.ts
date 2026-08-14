// How wide a draw pile is drawn, given how many are on the table. One value,
// two renderers — the kit's Table and the board's fork of it — because a number
// copied into both is a number that drifts in one of them.
//
// Git Branch plus Sudo can put three main piles out at once, and the row shares
// the table with the hand and the dock, so the width comes down as the count
// goes up. The single-pile width is the one the screen was designed at and does
// not move.
const PILE_W = [150, 120, 100]

export const pileWidthFor = (count: number): number => PILE_W[Math.min(count, 3) - 1] ?? 100
