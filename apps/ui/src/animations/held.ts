/**
 * A CARD IN A GESTURE'S HANDS — under the cursor, or in a flight the gesture
 * itself started — offered to whatever has to carry it on when the decision it
 * belongs to is answered by someone else: the keeper, on a clock that ran out.
 *
 * The card goes on from where it IS to where that answer puts it. Not back
 * through a place it never stopped at, and never drawn twice (I12): the gesture
 * keeps its node on screen until the one carrying it on lets it go, in the same
 * commit the card is drawn where it went. A flight reads its point A off the
 * node itself (`presets.ts`, `standing`), so handing the node over is all a
 * gesture has to do — under a cursor or halfway through a flight alike.
 */
export interface HeldCard {
  uid: string
  /** the node drawing the card right now */
  el: () => HTMLElement | null
  /**
   * The gesture stops carrying it: it no longer follows the cursor, lands
   * nowhere of its own and sends no answer of its own. Its node stays up.
   */
  take: () => void
  /** the gesture takes its node down — called in the commit the card lands elsewhere */
  release: () => void
  /** the gesture carries it home itself, from where it is — for a card the answer did not take */
  home: () => void
}
