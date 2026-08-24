// How wide a draw pile is drawn. One number, because a draw pile is one size
// everywhere the game shows it — the size the screen was designed at.
//
// There was a ramp here: 150 at one pile, 120 at two, 100 at three or more,
// meant for the row Git Branch + Sudo can put out. It was invented for that
// task and never approved, and nothing in the playground ever showed it — the
// kit's `Piles` page draws single piles only, and no scene can lay out more
// than one draw pile, so a row of three at 100px existed in the code and
// nowhere on screen. Removed at the designer's word: the piles are one size on
// the Table and on every other scene, and if a row of three crowds the hand,
// that is a layout question for the row, not a reason to shrink the cards.
export const PILE_WIDTH = 150

// Kept as a function, and its argument deliberately ignored, only because the
// board's fork of this row (`_Board.tsx`) still calls it and that file is being
// rewritten in another branch — collapsing its call site from here would
// conflict with that work. Its owner should read `PILE_WIDTH` directly and this
// should go.
export const pileWidthFor = (_count: number): number => PILE_WIDTH
