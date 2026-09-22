import { Fragment, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { cardById } from '@/cards/catalogue'
import type { Card as CardType } from '@/cards/types'
import Card from '@/primitives/Card'
import styles from './CardPreview.module.css'

// Reading a card that stands on the table — the one at the centre while a 503
// comes out of the deck, an AI card resolves, or somebody attacks you.
//
// It is a block and not scene-local code on purpose: eight scenes already hold a
// card at the centre and the real Table will hold one too, so written per scene
// this becomes the same thing written nine times.
//
// The preview shows at ONE fixed place on the right, never at the cursor: a
// place the player learns, and one that cannot cover the centre where the game
// is happening. It shows the instant the pointer is on a card — there is nothing
// to wait for, the card is already on the table and already being looked at.

// The hand's own hover zoom tops out at 460; this one is read across the table
// rather than right above the fan, so it starts 15% larger and then comes back
// down a tenth — the size that sits right next to the discard without shouting.
const PREVIEW_H = Math.round(460 * 1.15 * 0.9)
const CARD_WH = 368 / 515
const PREVIEW_W = Math.round(PREVIEW_H * CARD_WH)

// Slots stand side by side with a few px of table between them. Crossing that
// gap is two frames, and closing on it would blink the preview off and straight
// back on. So leaving a slot waits this long before closing — long enough to
// reach the neighbouring card, short enough to read as "gone". It delays only
// the LEAVING; showing is immediate.
const GAP_MS = 90

// Marks what the preview belongs to. It closes when the pointer moves somewhere
// that is neither a readable slot nor the preview itself, so both need to be
// findable from an event target.
const SRC_ATTR = 'data-card-preview-src'
const OWN_ATTR = 'data-card-preview'
const KEEP = `[${SRC_ATTR}], [${OWN_ATTR}]`

export interface CardPreviewSlotProps {
  onMouseEnter: (e: { currentTarget: HTMLElement }) => void
  [SRC_ATTR]: true
}

// THE CARD STANDING IN A SLOT, read off what is actually drawn in it. The LAST
// one, because document order is paint order: a pair draws the tucked half
// first and the card it belongs to over it, and the one on top is the one being
// looked at. A back is skipped — `Card` says which side it shows, and an id
// alone would hand out a face nobody at this seat has been shown.
const standingIn = (slot: HTMLElement): CardType | null => {
  const faces = slot.querySelectorAll<HTMLElement>('[data-card]:not([data-face-down])')
  const id = faces[faces.length - 1]?.dataset.card
  return (id ? cardById(id) : null) ?? null
}

export interface CardPreview {
  /**
   * Spread on a slot that holds a readable card. Three ways to answer, and the
   * difference between the last two is the point:
   *   • a card — read THIS one;
   *   • `null` — nothing to read here;
   *   • nothing at all — read WHATEVER IS STANDING in the slot, off the card
   *     actually rendered inside it.
   *
   * The third exists because a slot that several different renders take turns
   * filling was being told what it holds by a list kept next to them, and a list
   * is something a new render can be added without. That is exactly what
   * happened on the board: the centre named an attack and an alarm, and the git
   * operations standing in the same slot could not be read by anybody (#168).
   * A slot that answers for itself cannot fall behind what it draws.
   */
  slotProps: (card?: CardType | null, faceDown?: boolean) => CardPreviewSlotProps
  /** Render inside the scene. */
  overlay: ReactNode
}

export interface CardPreviewOptions {
  /**
   * NOTHING IS READ WHILE THE TABLE IS MOVING. A card at the centre is read by
   * standing still and looking at it; while cards are flying in and out of that
   * same place, slots mount and unmount under a cursor that has not moved, and
   * every one of them fires an enter. The preview then opens and closes on its
   * own, which reads as a blink rather than as a reading (owner, 22.09).
   *
   * The consumer is what knows the table is busy — it owns the queue that makes
   * it busy — so it says so, and this stays quiet: it opens nothing, and what
   * is already open closes.
   */
  quiet?: boolean
}

export function useCardPreview({ quiet = false }: CardPreviewOptions = {}): CardPreview {
  const [card, setCard] = useState<CardType | null>(null)
  const closing = useRef<number | null>(null)
  // read inside the enter handler, which is created once and must see the
  // CURRENT answer rather than the one that was true when it was made
  const quietRef = useRef(quiet)
  quietRef.current = quiet

  const stop = useCallback(() => {
    if (closing.current) {
      clearTimeout(closing.current)
      closing.current = null
    }
  }, [])

  const close = useCallback(() => {
    stop()
    closing.current = window.setTimeout(() => setCard(null), GAP_MS)
  }, [stop])

  const slotProps = useCallback(
    (...given: [card?: CardType | null, faceDown?: boolean]): CardPreviewSlotProps => {
      const [c, faceDown] = given
      // told nothing is NOT the same as told there is nothing: the first means
      // "read what is standing here", the second means "here stands nothing"
      const askTheSlot = given.length === 0
      return {
        [SRC_ATTR]: true,
        onMouseEnter: (e) => {
          // a back has nothing to read, and somebody else's closed card has no
          // identity to read even if we wanted one
          if (faceDown || quietRef.current) return
          const read = c ?? (askTheSlot ? standingIn(e.currentTarget) : null)
          if (!read) return
          stop()
          setCard(read)
        },
      }
    },
    [stop],
  )

  // …and it closes the moment the table starts moving, whatever the pointer is
  // doing: the card being read is about to be somewhere else.
  useEffect(() => {
    if (quiet) {
      stop()
      setCard(null)
    }
  }, [quiet, stop])

  // ONE rule closes it: the pointer moved somewhere that is neither a readable
  // slot nor the preview. It replaces a pile of mouseleave handlers and covers
  // the two cases that matter on their own —
  //   • the card flies off to the discard while it is being read: its slot
  //     unmounts under a still cursor, no mouseleave is ever fired, and the
  //     preview simply stays until the hand moves. Deliberately the opposite of
  //     the hand's zoom, which must leave WITH its card so it stops covering the
  //     table; here the card left and the reading is what remains;
  //   • the pointer is on the preview itself: it stays, however long. Without
  //     that, a preview standing over the discard would close the moment the
  //     pointer reached it and reopen the moment it did — a flicker, not a read.
  useEffect(() => {
    if (!card) return
    const onMove = (e: MouseEvent) => {
      const t = e.target
      if (t instanceof Element && t.closest(KEEP)) {
        stop()
        return
      }
      close()
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [card, close, stop])

  const overlay = card ? (
    <div {...{ [OWN_ATTR]: true }} className={styles.preview} aria-hidden="true">
      {/* keyed by the card, so every card mounts a fresh face instead of easing
          over from the previous one's values (the hand's zoom does the same) */}
      <Fragment key={card.id}>
        <Card card={card} interactive={false} width={PREVIEW_W} />
      </Fragment>
    </div>
  ) : null

  return { slotProps, overlay }
}
