import { useState } from 'react'
import type { Card as CardType } from '@/cards/types'
import Card from '@/primitives/Card'
import styles from './Hand.module.css'

// Геометрия веера — тюнингуется.
const SPREAD_DEG = 4.5 // наклон между соседними картами
const X_GAP = 82 // горизонтальный шаг (шире веер)
const ARC_DROP = 6 // насколько «провисают» края дуги
const HOVER_LIFT = 36 // подъём наведённой карты
const HOVER_SCALE = 1.75 // для читаемости
const NEIGHBOR_PUSH = 64 // насколько соседи расступаются
const CARD_W = '150px'

export interface HandItem {
  uid: string
  card: CardType
}

interface HandProps {
  items: HandItem[]
  faceDown?: boolean
}

/**
 * Рука веером. Ховер поднимает/читает карту и раздвигает соседей;
 * добавление/удаление карт плавно переукладывает веер (CSS-transition).
 */
export default function Hand({ items, faceDown = false }: HandProps) {
  const [hovered, setHovered] = useState<number | null>(null)
  const n = items.length
  const mid = (n - 1) / 2

  return (
    <div className={styles.hand}>
      {items.map((item, i) => {
        const off = i - mid
        let rotate = off * SPREAD_DEG
        let x = off * X_GAP
        let y = Math.abs(off) ** 2 * ARC_DROP
        let scale = 1
        let z = i

        if (hovered != null) {
          if (hovered === i) {
            rotate = 0
            y -= HOVER_LIFT
            scale = HOVER_SCALE
            z = 1000
          } else {
            const dir = i < hovered ? -1 : 1
            const dist = Math.abs(i - hovered)
            x += dir * (NEIGHBOR_PUSH / dist)
          }
        }

        const transform =
          `translateX(-50%) translateX(${x}px) translateY(${y}px) ` +
          `rotate(${rotate}deg) scale(${scale})`

        return (
          <div
            key={item.uid}
            className={styles.slot}
            style={{ transform, zIndex: z }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
          >
            <Card
              card={item.card}
              faceDown={faceDown}
              interactive={false}
              tilt={hovered === i}
              width={CARD_W}
            />
          </div>
        )
      })}
    </div>
  )
}
