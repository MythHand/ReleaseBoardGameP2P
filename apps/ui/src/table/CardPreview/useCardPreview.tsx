import { Fragment, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
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
  onMouseEnter: () => void
  [SRC_ATTR]: true
}

export interface CardPreview {
  /** Spread on a slot that holds a readable card. `null` — nothing to read. */
  slotProps: (card: CardType | null | undefined, faceDown?: boolean) => CardPreviewSlotProps
  /** Render inside the scene. */
  overlay: ReactNode
}

export function useCardPreview(): CardPreview {
  const [card, setCard] = useState<CardType | null>(null)
  const closing = useRef<number | null>(null)

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
    (c: CardType | null | undefined, faceDown?: boolean): CardPreviewSlotProps => ({
      [SRC_ATTR]: true,
      onMouseEnter: () => {
        // a back has nothing to read, and somebody else's closed card has no
        // identity to read even if we wanted one
        if (!c || faceDown) return
        stop()
        setCard(c)
      },
    }),
    [stop],
  )

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
