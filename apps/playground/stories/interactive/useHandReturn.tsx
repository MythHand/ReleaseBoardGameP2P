import type { RefObject } from 'react'
import { useRef, useState } from 'react'
import { nextFrames, type Rect, wait } from '@/animations'
import type { Card as CardType } from '@/cards/types'
import Card, { cardBoxIn } from '@/primitives/Card'
import { CARD_W, slotPlacement } from '@/table/Hand/fan'
import styles from './useHandReturn.module.css'

// THE step "the staging on the table goes back into the hand" — the undo of a
// play. Extracted because two scenes carried their own copy of it.
//
// The rule it holds:
//   • the whole staging comes back AT ONCE. The play was one act, so undoing it
//     is one act too — not a queue of single cards.
//   • it lands in the MIDDLE of the fan, never at its edge: that is where every
//     other card arrives (useHandInsert), so an undo does not read as some other
//     kind of insert.
//   • the fan opens the gap WHILE the cards travel, so they land in ready room
//     instead of shoving their neighbours aside after arrival.
//   • each card aims at the fan slot it will occupy and lands on that slot's
//     bottom-centre pivot — the same pivot Hand's slots use, so the tilt and the
//     scale match the fan exactly instead of drifting on the last frame.
//   • a PAIR standing at the centre is two cards again: each half starts from
//     where it actually is, measured off the pair's own anchors.

// how long the return takes — MUST equal the transition in .returning
const RETURN_MS = 480

// A card on its way back. Either it stands somewhere (`from`), or it is one half
// of a pair (`el` + `anchor`) and the step measures that half itself.
export interface Returning {
  key: string
  card: CardType
  from?: Rect
  el?: HTMLElement | null
  anchor?: 'main' | 'aux'
}

interface Flight {
  key: string
  card: CardType
  from: Rect
  to: string
}

export function useHandReturn(
  handRef: RefObject<HTMLDivElement | null>,
  // the cards have landed in the slots the gap was holding — the scene puts them
  // back into its hand at this index (it owns their identity)
  onLanded: (gap: number) => void,
) {
  const [flights, setFlights] = useState<Flight[]>([])
  const [started, setStarted] = useState(false)
  const [gapAt, setGapAt] = useState<number | null>(null)
  const size = useRef(1)

  const reset = () => {
    setFlights([])
    setStarted(false)
    setGapAt(null)
  }

  // where a card physically is right now
  const boxOf = (it: Returning, width: number): Rect | undefined => {
    if (!it.anchor) return it.from
    const half = it.el?.querySelector<HTMLElement>(`[data-${it.anchor}]`)
    if (!half) return it.from
    // I6 — the aux half is tilted, so its bounding rect is the box AROUND it;
    // trim it back to a card box, whose centre a pure rotation leaves in place
    return cardBoxIn(half.getBoundingClientRect(), width)
  }

  const send = async (items: Returning[], handLength: number) => {
    const hr = handRef.current?.getBoundingClientRect()
    if (items.length === 0 || !hr) return
    // the middle of the fan — the landing every other insert uses
    const gap = Math.round(handLength / 2)
    const total = handLength + items.length
    const list = items
      .map((it, i) => {
        const from = boxOf(it, CARD_W)
        if (!from) return null
        const place = slotPlacement(gap + i, total)
        const dx = hr.left + hr.width / 2 + place.x - (from.left + from.width / 2)
        const dy = hr.bottom + place.y - (from.top + from.height)
        return {
          key: it.key,
          card: it.card,
          from,
          to: `translate(${dx}px, ${dy}px) rotate(${place.rotate}deg) scale(${CARD_W / from.width})`,
        }
      })
      .filter((f): f is Flight => f != null)
    if (list.length === 0) return
    size.current = list.length
    setFlights(list)
    setGapAt(gap) // the fan starts spreading NOW, while the cards travel
    await nextFrames() // I2 — let the flyers paint at their source before moving
    setStarted(true)
    await wait(RETURN_MS)
    // they land in the slots the gap was holding: closing it and adding the cards
    // is the same layout, so nothing shifts on the last frame
    onLanded(gap)
    reset()
  }

  const overlay = flights.map((f) => (
    <div
      key={f.key}
      className={styles.returning}
      style={{
        left: f.from.left,
        top: f.from.top,
        inlineSize: f.from.width,
        transform: started ? f.to : 'none',
      }}
    >
      <Card card={f.card} width={f.from.width} interactive={false} />
    </div>
  ))

  return { overlay, gapAt, gapSize: size.current, send, reset, RETURN_MS }
}
