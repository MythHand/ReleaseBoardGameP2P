import type React from 'react'
import { useState } from 'react'
import type { Card as CardType } from '@/cards/types'
import Card from '@/primitives/Card'
import { CARD_W, slotPlacement } from './fan'
import styles from './Hand.module.css'

// Геометрия веера (наклон/дуга/шаг/ширина) — в едином модуле ./fan.
// handStep ре-экспортируем, чтобы потребители не зависели от пути модуля.
export { handStep } from './fan'

// Ховер-ручки — только к наведению, к раскладке слота отношения не имеют.
const HOVER_LIFT = 36 // подъём наведённой карты
const HOVER_SCALE = 1.75 // для читаемости
const NEIGHBOR_PUSH = 64 // насколько соседи расступаются

export interface HandItem {
  uid: string
  card: CardType
}

interface HandProps {
  items: HandItem[]
  faceDown?: boolean
  // индекс «вставочного» промежутка: веер раскладывается как на n+1 карт,
  // оставляя слот gapAt пустым (под прилетающую карту). null — обычная рука.
  gapAt?: number | null
  // клик по карте (для розыгрыша): отдаёт индекс, DOM-элемент слота и событие
  onCardClick?: (index: number, el: HTMLElement, e: React.MouseEvent) => void
  // подсветка карты по индексу: вернуть цвет свечения (цель стрелки) или undefined
  accentAt?: (index: number) => string | undefined
}

/**
 * Рука веером. Ховер поднимает/читает карту и раздвигает соседей;
 * добавление/удаление карт плавно переукладывает веер (CSS-transition).
 * gapAt открывает промежуток под вставку — сосед­ние карты разъезжаются.
 */
export default function Hand({
  items,
  faceDown = false,
  gapAt = null,
  onCardClick,
  accentAt,
}: HandProps) {
  const [hovered, setHovered] = useState<number | null>(null)
  const n = items.length
  // при открытом промежутке раскладываем как на n+1 слотов
  const total = gapAt == null ? n : n + 1

  return (
    <div className={styles.hand}>
      {items.map((item, i) => {
        // карты после промежутка съезжают на слот вперёд
        const slot = gapAt != null && i >= gapAt ? i + 1 : i
        // базовое место слота — из единого источника геометрии веера
        const base = slotPlacement(slot, total)
        let rotate = base.rotate
        let x = base.x
        let y = base.y
        let scale = 1
        let z = base.z

        // ховер-раздвижка только у обычной руки (не во время вставки)
        if (hovered != null && gapAt == null) {
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
          // biome-ignore lint/a11y/noStaticElementInteractions: hover only drives the decorative fan-spread (lift/read the hovered card); cards are non-interactive here, no keyboard affordance implied
          <div
            key={item.uid}
            className={`${styles.slot} ${onCardClick ? styles.clickable : ''}`}
            style={{ transform, zIndex: z }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
            onMouseDown={onCardClick ? (e) => onCardClick(i, e.currentTarget, e) : undefined}
          >
            <Card
              card={item.card}
              faceDown={faceDown}
              interactive={false}
              tilt={hovered === i}
              width={`${CARD_W}px`}
              state={accentAt?.(i) ? 'selected' : 'idle'}
              accent={accentAt?.(i)}
            />
          </div>
        )
      })}
    </div>
  )
}
