import type { Card as CardType } from '@/cards/types'
import Card from '@/primitives/Card'
import styles from './ReleaseZone.module.css'

export interface ReleaseSlots {
  frontend?: CardType | null
  backend?: CardType | null
  database?: CardType | null
  // отдельный слот под защитную карту Monitoring (в зоне релиза, но не Release)
  monitoring?: CardType | null
}

interface ReleaseZoneProps {
  release?: ReleaseSlots
  size?: string
  // compact — карты в 1.4× меньше, подпись пустого слота вертикальная
  variant?: 'default' | 'compact'
  // per-slot DOM node — so a consumer can measure a slot and fly a card into it
  // (e.g. an AI Release / Monitoring landing in its slot). Purely a position hook;
  // no visual effect.
  slotRef?: (key: keyof ReleaseSlots, el: HTMLDivElement | null) => void
  // упрощённое чтение карт в зоне (LOD). Решает ПОТРЕБИТЕЛЬ: чужая зона —
  // мебель, её карты читать не нужно; своя зона по умолчанию остаётся полной.
  lod?: boolean
}

const SLOTS: [keyof ReleaseSlots, string][] = [
  ['frontend', 'Frontend'],
  ['backend', 'Backend'],
  ['database', 'Database'],
  ['monitoring', 'Monitoring'],
]

// Зона релиза игрока: по одному слоту на тип. Пустой слот — место под релиз.
// compact-вариант: карты в 1.4× меньше, подпись пустого слота повёрнута вертикально.
export default function ReleaseZone({
  release = {},
  size = '84px',
  variant = 'default',
  slotRef,
  lod = false,
}: ReleaseZoneProps) {
  const compact = variant === 'compact'
  const slotSize = compact ? `calc(${size} / 1.4)` : size
  return (
    <div className={`${styles.zone} ${compact ? styles.compact : ''}`}>
      {SLOTS.map(([key, label]) => {
        const card = release[key]
        return (
          <div
            key={key}
            className={styles.slot}
            style={{ width: slotSize }}
            ref={(el) => slotRef?.(key, el)}
          >
            {card ? (
              <Card card={card} interactive={false} width="100%" lod={lod} />
            ) : (
              <div className={styles.empty}>{label}</div>
            )}
          </div>
        )
      })}
    </div>
  )
}
