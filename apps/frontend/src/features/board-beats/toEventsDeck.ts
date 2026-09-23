import { cardAreaOf } from '@release/ui'
import type { Rect } from '@release/ui/animations'
import { FLIP_MS, play, wait } from '@release/ui/animations'

// A CARD GOING HOME TO THE EVENTS DECK.
//
// A card that came out of the events deck never reaches the discard: it goes
// back to the deck it came from, whatever took it off the table — destroyed,
// sacrificed, knocked out by a DDoS, or carried off with an eliminated owner.
// That road is a flip and a travel, and four beats had written it out for
// themselves (docs/animations/beat-copies.md).
//
// IT TAKES A NODE, NOT A CARRIER. The card is always already in the air by the
// time this runs — it has just been shown at the centre, or stands where a
// static render put it — so raising it belongs to whoever owns that carrier, and
// a carrier passed between files is how two runners end up sharing one overlay.
// What the caller lends is one action: the way to turn ITS card face down.

export interface Homeward {
  /** the card in the air — the caller's own carrier node */
  node: HTMLElement | null
  /** where it is right now (I1) */
  from: Rect | null
  /** the events pile's box — `anchors.eventsBox.current` */
  deck: Element | null
  /**
   * Turn it face down, by whatever the caller's carrier calls that (`patch`).
   * A deck holds cards face down, so the card turns over before it goes in —
   * and the flip belongs to the CARD (`Card` plays it on a `faceDown` change),
   * so there is no handle to await and the wait is the flip's own duration.
   *
   * Omitted when the card is already closed: nothing turns, nothing is waited.
   */
  turnFaceDown?: () => void
}

export async function toEventsDeck({ node, from, deck, turnFaceDown }: Homeward): Promise<void> {
  if (turnFaceDown) {
    turnFaceDown()
    await wait(FLIP_MS)
  }
  const box = deck?.getBoundingClientRect()
  if (!node || !from || !box) return
  const anim = play('returnToDeck', node, { from, to: cardAreaOf(box) })
  if (anim) await anim.finished
}
