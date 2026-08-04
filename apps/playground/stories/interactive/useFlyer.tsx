import { useRef, useState } from 'react'
import { nextFrames, type Rect } from '@/animations'
import type { Card as CardType } from '@/cards/types'
import Card from '@/primitives/Card'
import styles from './useFlyer.module.css'

// THE carrier of a card in the air — the half of a flight that is NOT the rule.
//
// The three named steps own the rules of a movement (where to aim, which scatter,
// in what order to land, what to do with a pair). Underneath all of them, and under
// every scene's own flight, there is the same node: a fixed card hanging over the
// table. That node kept being written from scratch per scene, and with it the five
// invariants that belong to it — each broken at least once:
//
//   • I10 — it paints where it MOUNTS. Coordinates live in state and are rendered
//     inline; a fixed node without them paints at its flow position (the bottom of
//     the page) for every frame until the code assigns them.
//   • I5  — a fresh node per flight (`key={seq}`), so React never reuses a Card and
//     turns a `faceDown` change into a spurious flip mid-flight.
//   • I2  — it has painted at its source before anything starts moving.
//   • I3  — leftover WAAPI transforms are cancelled before it is repositioned.
//   • I4  — after landing it is PINNED to where it visually is, so the next flight
//     starts from there and not from the old origin.
//
// What it does NOT know: where to fly, which preset, in what order, what to do with
// a pair. That stays with the step or with the scene.
//
//   const [el] = await raise([{ key: 'draw', card, at: from, faceDown: true }])
//   await play('drawToCenter', el, { from, to })?.finished
//   pin('draw', to)              // identity for the next flight
//   patch('draw', { faceDown: false })
//   drop('draw')

export interface Raise {
  key: string // the scene's own name for this flyer — pin/patch/drop take it
  card: CardType
  at: Rect // where it mounts: its FIRST painted frame is here (I10)
  faceDown?: boolean
  /** its layer on the table, when several are in the air at once (I9) */
  layer?: number
}

interface Held extends Raise {
  seq: number // React key — a fresh node per flight (I5)
}

export function useFlyer() {
  const [held, setHeld] = useState<Held[]>([])
  const els = useRef<Record<string, HTMLDivElement | null>>({})
  const seq = useRef(0)

  const elOf = (key: string) => els.current[key] ?? null

  // put N cards in the air at their own rects and let them paint there before
  // anything moves. Returns their elements, in the order they were given.
  const raise = async (items: Raise[]): Promise<(HTMLDivElement | null)[]> => {
    if (items.length === 0) return []
    setHeld((h) => [...h, ...items.map((it) => ({ ...it, seq: ++seq.current }))])
    await nextFrames() // I2 — painted at `at`, and mounted, before the caller measures
    return items.map((it) => {
      const el = elOf(it.key)
      if (el) for (const a of el.getAnimations()) a.cancel() // I3
      return el
    })
  }

  // I4 — the card has landed: it now IS at `rect`. Written to the DOM at once (no
  // frame at the old transform) AND to the state, or the next render would put it
  // back at the rect it was raised from.
  const pin = (key: string, rect: Rect) => {
    const el = elOf(key)
    if (el) {
      for (const a of el.getAnimations()) a.cancel()
      el.style.left = `${rect.left}px`
      el.style.top = `${rect.top}px`
      el.style.width = `${rect.width}px`
      el.style.transform = ''
    }
    setHeld((h) => h.map((it) => (it.key === key ? { ...it, at: rect } : it)))
  }

  // change what the card shows without touching where it is — the flip in place
  const patch = (key: string, next: Partial<Pick<Raise, 'card' | 'faceDown'>>) =>
    setHeld((h) => h.map((it) => (it.key === key ? { ...it, ...next } : it)))

  // take one down, or all of them
  const drop = (key?: string) => {
    if (key == null) {
      els.current = {}
      setHeld([])
      return
    }
    delete els.current[key]
    setHeld((h) => h.filter((it) => it.key !== key))
  }

  const overlay = held.map((h) => (
    <div
      key={h.seq}
      className={styles.flyer}
      ref={(el) => {
        els.current[h.key] = el
      }}
      style={{
        left: h.at.left,
        top: h.at.top,
        inlineSize: h.at.width,
        // the layer travels with the card (I9); without one it rides the rung
        zIndex: h.layer == null ? undefined : `calc(var(--z-flight) + ${h.layer})`,
      }}
    >
      <Card card={h.card} faceDown={h.faceDown} interactive={false} width="100%" />
    </div>
  ))

  return { overlay, raise, pin, patch, drop, elOf }
}
