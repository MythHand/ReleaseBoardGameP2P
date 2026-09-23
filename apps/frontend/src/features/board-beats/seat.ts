import { CARD_W, cardBoxIn } from '@release/ui'
import type { Rect } from '@release/ui/animations'

// HOW SMALL A CARD IS INSIDE A SEAT.
//
// A seat draws its owner's hand as a closed stack, and a card arriving there
// sinks to that size. The number was `drawBeat`'s to begin with and had been
// copied into four more places, in two different spellings — `scale: 0.7` handed
// to the travel, and a target box shrunk by the same factor before the travel
// ever sees it (docs/animations/beat-copies.md).
//
// THE TWO SPELLINGS ARE NOT THE SAME MOTION, and this file does not pretend they
// are: one scales the card as it lands, the other lands it in a smaller box.
// What is shared, and all that is shared for now, is the factor itself — so a
// change to how big a card is in a seat is one edit rather than five. Bringing
// the two geometries together is a change to what is on screen and belongs to a
// pass that can be watched, not to a deduplication.
export const SEAT_SHRINK = 0.7

/** The seat's own card box, at the size a card rests there — the target the
 *  transfer's legs aim at. */
export const seatCardBox = (seat: Rect): Rect => cardBoxIn(seat, CARD_W * SEAT_SHRINK)
