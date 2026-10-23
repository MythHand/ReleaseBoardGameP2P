import type { BoardAnchors } from '~/entities/game/board'

/** A card taken over from the gesture that held it: its node, and how to let it go. */
export interface Taken {
  uid: string
  el: HTMLElement
  /** the gesture's node comes down — in the commit the card is drawn where it went (I12) */
  release: () => void
}

// THE CARD OUR GESTURE IS HOLDING, carried on by the answer someone else gave.
//
// When the keeper answers a decision for us because our time ran out, a card of
// that decision may still be in our hands: under the cursor, or in a flight the
// gesture started. The answer does not raise a second copy of it somewhere
// else — it takes THAT node and flies it on, from where it is to where the
// answer puts it (`HeldCard`). A travel preset reads point A off the node, so a
// card under the cursor and one halfway to its cell go on the same way.
export function takeHeld(anchors: BoardAnchors, uid: string | undefined): Taken | null {
  if (!uid) return null
  const held = anchors.heldCard(uid)
  const el = held?.el()
  if (!held || !el) return null
  held.take()
  return { uid, el, release: held.release }
}

/**
 * Every card of ours still held that the answer did not take goes home, from
 * where it is: `uids` are the cards this decision could have moved, `taken`
 * those the answer carried on.
 */
export function sendHeldHome(
  anchors: BoardAnchors,
  uids: readonly string[],
  taken: readonly Taken[],
): void {
  for (const uid of uids) {
    if (taken.some((t) => t.uid === uid)) continue
    anchors.heldCard(uid)?.home()
  }
}
