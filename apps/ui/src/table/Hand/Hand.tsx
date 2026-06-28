import type React from 'react'
import { useState } from 'react'
import type { Card as CardType } from '@/cards/types'
import Card from '@/primitives/Card'
import styles from './Hand.module.css'

// Геометрия веера — тюнингуется.
const SPREAD_DEG = 4.5 // наклон между соседними картами
const ARC_DROP = 6 // насколько «провисают» края дуги
const HOVER_LIFT = 36 // подъём наведённой карты
const HOVER_SCALE = 1.75 // для читаемости
const NEIGHBOR_PUSH = 64 // насколько соседи расступаются
const CARD_W = '150px'

// Шаг между картами плавно ужимается с ростом руки — гладкая (квадратичная)
// кривая через опорные точки [кол-во, шаг_px]. Меньше шаг → плотнее нахлёст.
const STEP_ANCHORS: [number, number][] = [
  [2, 124],
  [8, 82],
  [20, 48],
]

export function handStep(n: number): number {
  const [[x0, y0], [x1, y1], [x2, y2]] = STEP_ANCHORS
  const l0 = ((n - x1) * (n - x2)) / ((x0 - x1) * (x0 - x2))
  const l1 = ((n - x0) * (n - x2)) / ((x1 - x0) * (x1 - x2))
  const l2 = ((n - x0) * (n - x1)) / ((x2 - x0) * (x2 - x1))
  return y0 * l0 + y1 * l1 + y2 * l2
}

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
  const total = gapAt != null ? n + 1 : n
  const mid = (total - 1) / 2
  const xGap = handStep(total) // шаг зависит от кол-ва карт

  return (
    <div className={styles.hand}>
      {items.map((item, i) => {
        // карты после промежутка съезжают на слот вперёд
        const slot = gapAt != null && i >= gapAt ? i + 1 : i
        const off = slot - mid
        let rotate = off * SPREAD_DEG
        let x = off * xGap
        let y = Math.abs(off) ** 2 * ARC_DROP
        let scale = 1
        let z = slot

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
              width={CARD_W}
              state={accentAt?.(i) ? 'selected' : 'idle'}
              accent={accentAt?.(i)}
            />
          </div>
        )
      })}
    </div>
  )
}
