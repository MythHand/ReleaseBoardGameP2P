// Card art proportion as height / width (≈ 515 / 368 = 1.4).
// This is the reciprocal of the `--card-aspect` CSS token (368 / 515, width / height)
// that drives `aspect-ratio` in Card/Pile/CardPair. Use this constant for layout math
// that derives a card's height from its width (e.g. aiming a flight at the card box).
export const CARD_RATIO = 1.4

interface RectLike {
  left: number
  top: number
  width: number
  height: number
}

// I6: trim a Pile cell to its top card area. A Pile renders a label under the card, so
// the cell is taller than the card — keep left/top/width, derive height from the ratio,
// and aim flights at this box (not the cell center).
export function cardAreaOf(cell: RectLike) {
  return { left: cell.left, top: cell.top, width: cell.width, height: cell.width * CARD_RATIO }
}

// A card-sized box of `width`, centered inside `rect` (e.g. a Seat, whose rect is larger
// than a card). Height follows the card ratio. Pass a width measured from the real card
// element where possible, so the box tracks the card's actual display size.
export function cardBoxIn(rect: RectLike, width: number) {
  const height = width * CARD_RATIO
  return {
    left: rect.left + rect.width / 2 - width / 2,
    top: rect.top + rect.height / 2 - height / 2,
    width,
    height,
  }
}
