import { type RefObject, useRef, useState } from 'react'
import type { Card as CardType } from '@/cards/types'
import Card from '@/primitives/Card'
import { handStep } from '@/table/Hand/Hand'
import styles from './useHandInsert.module.css'

// Универсальный шаг «карта встаёт в руку» (вынесено из Card to Hand, переиспользуется).
// Рука раздвигается под карту (gapAt), карта адаптирует размер и опускается в
// промежуток; высокий travel-слой держим короткий старт, дальше — слот-слой
// (затыкается под правую половину веера), прилёт в bottom-center слота.
const HAND_CARD_W = 150 // ширина карты в руке (как внутри Hand)
const HAND_SPREAD_DEG = 4.5 // = SPREAD_DEG в Hand
const HAND_ARC_DROP = 6 // = ARC_DROP в Hand
const TRAVEL_Z = 500
const START_HIGH_MS = 140 // сколько держим высокий слой после старта
const FLIGHT_MS = 480 // = transition в .flying

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

  // запустить вставку карты из source-прямоугольника в руку (длиной handLength)
  function insert(card: CardType, source: InsertSource, handLength: number) {
    const handEl = handRef.current
    if (!handEl || flying) return

    const gap = Math.round(handLength / 2) // промежуток ~по центру веера
    const off = gap - handLength / 2
    const hr = handEl.getBoundingClientRect()
    // целимся в bottom-center слота веера (как у .slot Hand) — пивот совпадает
    const targetBcX = hr.left + hr.width / 2 + off * handStep(handLength + 1)
    const targetBcY = hr.bottom + off ** 2 * HAND_ARC_DROP
    const dx = targetBcX - (source.left + source.width / 2)
    const dy = targetBcY - (source.top + source.height)
    const rot = off * HAND_SPREAD_DEG
    const scale = HAND_CARD_W / source.width // адаптация размера к руке

    setGapAt(gap)
    setFlying({
      card,
      z: gap, // = индекс слота: правая половина веера остаётся над картой
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
