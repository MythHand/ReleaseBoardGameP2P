import type { RefObject } from 'react'
import { useRef, useState } from 'react'
import {
  jitter,
  nextFrames,
  play,
  type Rect,
  type Scatter,
  toDiscardParams,
  wait,
} from '@/animations'
import type { Card as CardType } from '@/cards/types'
import Card, { cardAreaOf, cardBoxIn } from '@/primitives/Card'
import { PAIR_AUX } from '@/primitives/CardPair'
import type { HeapCard } from '@/primitives/Pile/Pile'
import styles from './useDiscardExit.module.css'

// THE step "cards leave the table for the discard" — the discard counterpart of
// useHandArrival. Extracted because three scenes were each carrying their own copy
// of it, and the copies drifted.
//
// The rule it holds:
//   • cards go to the discard ONE BY ONE, but ALL AT ONCE. Whatever the count,
//     the logic is the same; the simultaneity is what reads as "the pile went to
//     the discard". Nothing special for two, three or four cards.
//   • a PAIR is one play on the table but two cards in the heap, so it leaves as
//     two singles — each from where it actually stands.
//   • one scatter per card drives BOTH its flight and its rest (I7), so it lands
//     exactly where it will lie — no position swap on the last frame.
//   • the table tilt unwinds DURING the flight, not on arrival.
//   • the layer a card had on the table is carried through and decides the order
//     it is appended to the heap (I9) — bottom-up, or the stack lands inverted.

// how long a card travels — matches the centerToDiscard preset, so the tilt
// finishes unwinding exactly as the card lands
const FLIGHT_MS = 420

interface Pose {
  rot: number
  dx: number
  dy: number
}

// A card on its way out. Two ways to give it:
//   • `from` — it stands in a slot: the step raises its own flyer there;
//   • `node` — it is ALREADY its own element on screen (a card sitting in an open
//     grid, or a flyer that just finished an earlier leg): that element flies,
//     and nothing is mounted or swapped.
// `aux` + `el` describe a pair — it is split here, and only in `from` form (a live
// element cannot be split in two).
export interface Leaving {
  key: string
  card: CardType
  aux?: CardType | null
  // the pair's element — the aux card is measured from it
  el?: HTMLElement | null
  from?: Rect // where it stands NOW — measured before it is unmounted (I1)
  node?: HTMLElement | null // …or the element that IS the card, flown as it is
  pose?: Pose // the table tilt it starts from
  layer?: number // its layer on the table; 0 is the bottom
  // the scatter it must land on. Omitted → a fresh one. Given when the card has a
  // place of its own in the heap already (it was taken out of it and goes back).
  scatter?: Scatter
  // it will sink below the visible top of the heap — dissolve on the way instead
  // of vanishing on arrival
  fade?: boolean
  // leave later than the others: a heap emptying card by card, not all at once
  delay?: number
}

interface Flight {
  key: string
  card: CardType
  from: Rect
  node?: HTMLElement | null
  pose: string
  scatter: Scatter
  fade: boolean
  delay: number
  z: number
}

const poseOf = (p?: Pose): string =>
  p ? `translate(${p.dx}px, ${p.dy}px) rotate(${p.rot}deg)` : 'none'

export function useDiscardExit(
  boxRef: RefObject<HTMLDivElement | null>,
  // called with the landed cards, bottom-up. Omitted when the scene keeps its own
  // books on the heap (cards taken OUT of it and going back).
  onLanded?: (cards: HeapCard[]) => void,
) {
  const [flights, setFlights] = useState<Flight[]>([])
  const [straight, setStraight] = useState(false)
  const refs = useRef<Record<string, HTMLDivElement | null>>({})

  const reset = () => {
    setFlights([])
    setStraight(false)
    refs.current = {}
  }

  // a pair becomes two singles: the aux keeps its own place and tilt, and sits
  // one layer under its main card — exactly as they lay on the table
  const expand = (it: Leaving): Flight[] => {
    const layer = (it.layer ?? 0) * 2
    // where it is: its own element's box, or the rect the caller measured
    const box = it.node?.getBoundingClientRect() ?? it.from
    if (!box) return []
    const main: Flight = {
      key: it.key,
      card: it.card,
      from: box,
      node: it.node,
      pose: poseOf(it.pose),
      scatter: it.scatter ?? jitter(),
      fade: it.fade ?? false,
      delay: it.delay ?? 0,
      z: layer + 1,
    }
    if (!it.aux || it.node) return [main]
    // I6 — the aux is tilted, so its bounding rect is the box AROUND it; trim it
    // back to a card box. A pure rotation keeps the centre, which is what places it.
    const auxEl = it.el?.querySelector<HTMLElement>('[data-aux]')
    return [
      {
        key: `${it.key}-aux`,
        card: it.aux,
        from: auxEl ? cardBoxIn(auxEl.getBoundingClientRect(), box.width) : box,
        // its place is already in `from`; only the tilt CardPair gives it —
        // taken from the pair's own pose, so the two cannot drift apart
        pose: poseOf({ rot: (it.pose?.rot ?? 0) + PAIR_AUX.rot, dx: 0, dy: 0 }),
        scatter: jitter(),
        fade: main.fade,
        delay: main.delay,
        z: layer,
      },
      main,
    ]
  }

  const send = async (items: Leaving[]) => {
    const to = boxRef.current?.getBoundingClientRect()
    const list = items.flatMap(expand)
    if (list.length === 0) return
    // only the ones that need a flyer of their own get mounted
    const mounted = list.filter((f) => !f.node)
    setFlights(mounted)
    setStraight(false)
    await nextFrames() // I2 — let them paint at their source before moving
    setStraight(true) // the table tilt unwinds while they travel
    await Promise.all(
      list.map(async (f) => {
        const el = f.node ?? refs.current[f.key]
        // a card handed over as a rect flies on a flyer this step MOUNTS — which
        // only exists if the scene renders `overlay`. Without it the cards would
        // simply appear in the heap with no flight and no error at all.
        if (!el && !f.node)
          console.error('useDiscardExit: no flyer for %s — is `overlay` rendered?', f.key)
        if (!el || !to) return
        if (f.delay) await wait(f.delay)
        const anim = play(
          'centerToDiscard',
          el,
          toDiscardParams(f.from, cardAreaOf(to), f.scatter, f.fade),
        )
        if (anim) await anim.finished
      }),
    )
    // BOTTOM-UP: the card that lay under the others has to reach the heap first,
    // or the stack lands inverted
    const bottomUp = [...list].sort((a, b) => a.z - b.z)
    onLanded?.(bottomUp.map((f) => ({ card: f.card, ...f.scatter })))
    reset()
  }

  const overlay = flights.map((f) => (
    <div
      key={f.key}
      className={styles.flyer}
      // the table layer travels with the card — without it two flyers share one z
      // and paint in array order, which is not the stacking order. The base is the
      // flight rung of the ladder; the card's own layer is added on top of it.
      style={{
        left: f.from.left,
        top: f.from.top,
        inlineSize: f.from.width,
        zIndex: `calc(var(--z-flight) + ${f.z})`,
      }}
      ref={(el) => {
        refs.current[f.key] = el
      }}
    >
      <div
        className={styles.pose}
        data-straight={straight}
        style={{ transform: straight ? 'none' : f.pose }}
      >
        <Card card={f.card} interactive={false} width="100%" />
      </div>
    </div>
  ))

  return { overlay, send, reset, FLIGHT_MS }
}
