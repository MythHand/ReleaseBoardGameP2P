import { type RefObject, useRef, useState } from 'react'
import type { Card as CardType } from '@/cards/types'
import Card from '@/primitives/Card'
import { CARD_W, slotPlacement } from '@/table/Hand/fan'
import styles from './useHandInsert.module.css'

// The universal "card settles into the hand" step (extracted from Card to Hand, reused).
// The hand opens a gap for the card (gapAt), the card adapts its size and drops into
// the gap; the high travel layer holds a short start, then the slot layer takes over
// (tucks under the right half of the fan), landing at the slot bottom-center.
// The slot position comes from the single source of fan geometry (@/table/Hand/fan).
const TRAVEL_Z = 500
const START_HIGH_MS = 140 // how long the high layer is held after start
const FLIGHT_MS = 480 // = the transition in .flying

export interface InsertSource {
  left: number
  top: number
  width: number
  height: number
}

interface Flying {
  card: CardType
  z: number
  from: { left: number; top: number; width: number }
  to: string
}

export function useHandInsert(
  handRef: RefObject<HTMLDivElement | null>,
  onInserted: (card: CardType, gapIndex: number) => void,
) {
  const [gapAt, setGapAt] = useState<number | null>(null)
  const [flying, setFlying] = useState<Flying | null>(null)
  const [started, setStarted] = useState(false)
  const [tucked, setTucked] = useState(false)
  const timer = useRef<number | null>(null)

  function reset() {
    if (timer.current) window.clearTimeout(timer.current)
    setGapAt(null)
    setFlying(null)
    setStarted(false)
    setTucked(false)
  }

  // start inserting a card from the source rect into the hand (of length handLength)
  function insert(card: CardType, source: InsertSource, handLength: number) {
    const handEl = handRef.current
    if (!handEl || flying) return

    const gap = Math.round(handLength / 2) // a gap ~at the fan center
    // the gap-slot position — from the single source (layout as for handLength+1 slots)
    const place = slotPlacement(gap, handLength + 1)
    const hr = handEl.getBoundingClientRect()
    // aim at the fan slot bottom-center (like Hand's .slot) — the pivot matches
    const targetBcX = hr.left + hr.width / 2 + place.x
    const targetBcY = hr.bottom + place.y
    const dx = targetBcX - (source.left + source.width / 2)
    const dy = targetBcY - (source.top + source.height)
    const rot = place.rotate
    const scale = CARD_W / source.width // adapt size to the hand

    setGapAt(gap)
    setFlying({
      card,
      z: place.z, // = the slot index: the right half of the fan stays over the card
      from: { left: source.left, top: source.top, width: source.width },
      to: `translate(${dx}px, ${dy}px) rotate(${rot}deg) scale(${scale})`,
    })
    setStarted(false)
    setTucked(false)
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setStarted(true)
        timer.current = window.setTimeout(() => setTucked(true), START_HIGH_MS)
      }),
    )
  }

  function settle(e: React.TransitionEvent) {
    if (!flying || e.propertyName !== 'transform' || gapAt == null) return
    onInserted(flying.card, gapAt)
    reset()
  }

  const overlay = flying ? (
    <div
      className={styles.flying}
      style={{
        left: flying.from.left,
        top: flying.from.top,
        inlineSize: flying.from.width,
        zIndex: tucked ? flying.z : TRAVEL_Z,
        transform: started ? flying.to : 'none',
      }}
      onTransitionEnd={settle}
    >
      <Card card={flying.card} width={`${flying.from.width}px`} interactive={false} />
    </div>
  ) : null

  return { gapAt, overlay, insert, reset, flyingCard: flying?.card ?? null, FLIGHT_MS }
}
