import type { RefObject } from 'react'
import { useRef, useState } from 'react'
import type { Card as CardType } from '@/cards/types'
import Card, { cardBoxIn } from '@/primitives/Card'
import { CARD_W, insertPath, slotPlacement } from '@/table/Hand/fan'
import type { Rect } from './scatter'
import { nextFrames, wait } from './timing'
import styles from './useHandArrival.module.css'

// THE step "cards arrive in the hand" — one movement, any number of cards.
//
// It replaces the split between "one card settles in" and "the staging comes back":
// on screen those were the same movement (the fan opens in the middle, the card
// shrinks to the fan's size and lands on the slot's pivot), written twice, so the
// abilities drifted apart — one could take a card resting at a tilt, the other could
// take several at once, neither could take a card that is already on screen.
//
// The rule it holds:
//   • they land in the MIDDLE of the fan by default, however many there are. That
//     is where every card ARRIVES — a draw comes from the deck and has no place of
//     its own, so the middle is the honest answer and a draw and an undo read as
//     the same event. A scene may name the slot instead (`at`), and exactly one
//     thing earns that: the player POINTED at a place. Dragging a card back off
//     the table into the fan is a placement, not an arrival, and putting it in the
//     middle would ignore what the hand just said.
//   • the fan opens room for ALL of them WHILE they travel, so they land in ready
//     space instead of shoving their neighbours aside on arrival.
//   • each card aims at the slot it will occupy and lands on that slot's bottom-centre
//     pivot — the fan's own pivot, so tilt and scale match instead of drifting.
//   • a card resting at a tilt is picked up from where it LOOKS like it is: the pivot
//     difference is compensated, or the first frame jumps before anything moves.
//   • it enters the fan by the FAN'S OWN RULE (`insertPath`): round from the left,
//     along one curve, changing layer partway. Being inserted between two cards is
//     the same thing whether the card was drawn from the deck or carried back off
//     the table by hand, so it is the same movement — the shape belongs to the fan,
//     the clock belongs here.
//   • it passes OVER the fan and tucks UNDER it partway — a card goes into the
//     hand, not onto it.
//   • a card that is already drawn on screen is not copied: the step measures it and
//     takes it off screen for the flight. It does NOT put it back — the card is in
//     the hand now; what happens to the empty source is the scene's business.

const START_HIGH_MS = 140 // how long the travel layer is held before tucking under the fan
const FLIGHT_MS = 480
// = --ease-soft. The animation takes a value, not a custom property.
const FLIGHT_EASE = 'cubic-bezier(0.4, 0, 0.2, 1)'

// A card on its way in. Where it starts is given in one of three ways:
//   `from`          — it stands at this rect (+ `rot` if it rests at a tilt)
//   `el`            — it IS this element on screen; the step measures and hides it
//   `el` + `anchor` — it is one half of a pair standing there
export interface Arriving {
  /** the card's identity in the scene's hand (its uid) — handed back on landing */
  key: string
  card: CardType
  /**
   * which side is up on the way in. A dealt card travels closed and is turned
   * over only once the whole hand is in (see Game Deal); a drawn or returned
   * card is already known to its owner and flies open, which is the default.
   */
  faceDown?: boolean
  from?: Rect
  rot?: number
  el?: HTMLElement | null
  anchor?: 'main' | 'aux'
}

/** what landed — the scene turns these back into its own hand items */
export interface Landed {
  key: string
  card: CardType
}

interface Flight {
  key: string
  card: CardType
  faceDown: boolean
  at: { left: number; top: number; width: number; rot: number }
  // the whole flight, as the positions the fan handed over (insertPath) turned
  // into poses — translate along the path, turning and resizing as it goes
  frames: Keyframe[]
  z: number // the slot's layer, taken once it has tucked under the fan
}

export function useHandArrival(
  handRef: RefObject<HTMLDivElement | null>,
  // the cards have landed in the slots the gap was holding — the scene puts them
  // into its hand at this index. What landed comes with the call: the step carried
  // them, so it is the one that knows (reading it off state here is the I8 trap —
  // a scene clears its staging the moment the flight starts).
  onLanded: (gap: number, landed: Landed[]) => void,
) {
  const [flights, setFlights] = useState<Flight[]>([])
  const [tucked, setTucked] = useState(false)
  const [gapAt, setGapAt] = useState<number | null>(null)
  const size = useRef(1)
  const timer = useRef<number | null>(null)
  const nodes = useRef(new Map<string, HTMLDivElement>())

  const reset = () => {
    if (timer.current) window.clearTimeout(timer.current)
    setFlights([])
    setTucked(false)
    setGapAt(null)
  }

  // where the card physically is right now, and at what tilt
  const boxOf = (it: Arriving): { box: Rect; rot: number } | undefined => {
    if (it.anchor && it.el) {
      const half = it.el.querySelector<HTMLElement>(`[data-${it.anchor}]`)
      // I6 — a tilted half's bounding rect is the box AROUND it; trim it back to a
      // card box, whose centre a pure rotation leaves in place
      if (half) return { box: cardBoxIn(half.getBoundingClientRect(), CARD_W), rot: 0 }
    }
    if (it.el) {
      const r = it.el.getBoundingClientRect()
      return { box: r, rot: it.rot ?? 0 }
    }
    return it.from ? { box: it.from, rot: it.rot ?? 0 } : undefined
  }

  // send any number of cards into a hand of `handLength` cards. `at` names the
  // slot they open at; without it, the middle.
  const arrive = async (items: Arriving[], handLength: number, at?: number) => {
    const hr = handRef.current?.getBoundingClientRect()
    if (items.length === 0 || !hr || flights.length > 0) return
    const gap = at == null ? Math.round(handLength / 2) : Math.max(0, Math.min(handLength, at))
    const total = handLength + items.length
    const list = items
      .map((it, i): Flight | null => {
        const src = boxOf(it)
        if (!src) return null
        // the flight pivots on the slot's bottom centre, a tilted card rests on its
        // own centre: same angle, different pivot, so the mount point is shifted by
        // the difference — or the very first frame jumps by ~h/2·sin(rot)
        const a = src.rot * (Math.PI / 180)
        const left = src.box.left - (a === 0 ? 0 : (src.box.height / 2) * Math.sin(a))
        const top = src.box.top - (a === 0 ? 0 : (src.box.height / 2) * (1 - Math.cos(a)))
        const place = slotPlacement(gap + i, total)
        // both points are the card's bottom centre — the pivot the flight turns
        // and scales about, and the point the slot's own placement is given for
        const fromPt = { x: left + src.box.width / 2, y: top + src.box.height }
        const toPt = { x: hr.left + hr.width / 2 + place.x, y: hr.bottom + place.y }
        const path = insertPath(fromPt, toPt, gap + i, total)
        const lastStep = path.length - 1
        const scale = CARD_W / src.box.width
        return {
          key: it.key,
          card: it.card,
          faceDown: it.faceDown ?? false,
          at: { left, top, width: src.box.width, rot: src.rot },
          frames: path.map((p, k) => {
            const t = k / lastStep
            return {
              transform:
                `translate(${p.x - fromPt.x}px, ${p.y - fromPt.y}px) ` +
                `rotate(${src.rot + (place.rotate - src.rot) * t}deg) ` +
                `scale(${1 + (scale - 1) * t})`,
            }
          }),
          z: place.z,
        }
      })
      .filter((f): f is Flight => f != null)
    if (list.length === 0) return
    // a card already drawn on screen is not copied — it steps aside for its flyer
    for (const it of items) if (it.el && !it.anchor) it.el.style.opacity = '0'

    size.current = list.length
    setFlights(list)
    setGapAt(gap) // the fan starts opening NOW, while the cards travel
    setTucked(false)
    await nextFrames() // I2 — let the flyers paint at their source before moving
    for (const f of list) {
      nodes.current
        .get(f.key)
        ?.animate(f.frames, { duration: FLIGHT_MS, easing: FLIGHT_EASE, fill: 'forwards' })
    }
    timer.current = window.setTimeout(() => setTucked(true), START_HIGH_MS)
    await wait(FLIGHT_MS)
    // they land in the slots the gap was holding: closing it and adding the cards is
    // the same layout, so nothing shifts on the last frame
    onLanded(
      gap,
      list.map((f) => ({ key: f.key, card: f.card })),
    )
    reset()
  }

  const overlay = flights.map((f) => (
    <div
      key={f.key}
      ref={(el) => {
        // the flight is played ON the node, so the step has to hold it
        if (el) nodes.current.set(f.key, el)
        else nodes.current.delete(f.key)
      }}
      className={styles.arriving}
      style={{
        left: f.at.left,
        top: f.at.top,
        inlineSize: f.at.width,
        // over the fan while it travels, the slot's own layer once it tucks under it
        zIndex: tucked ? f.z : 'var(--z-flight)',
        // the pose it stands in until the flight takes over (I2)
        transform: `rotate(${f.at.rot}deg)`,
      }}
    >
      <Card card={f.card} faceDown={f.faceDown} width={f.at.width} interactive={false} />
    </div>
  ))

  return {
    overlay,
    gapAt,
    gapSize: size.current,
    arrive,
    reset,
    busy: flights.length > 0,
    FLIGHT_MS,
  }
}
