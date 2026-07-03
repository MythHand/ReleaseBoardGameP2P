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
}: ReleaseZoneProps) {
  const compact = variant === 'compact'
  const slotSize = compact ? `calc(${size} / 1.4)` : size
  return (
    <div className={`${styles.zone} ${compact ? styles.compact : ''}`}>
      {SLOTS.map(([key, label]) => {
        const card = release[key]
        return (
          <div key={key} className={styles.slot} style={{ width: slotSize }}>
            {card ? (
              <Card card={card} interactive={false} width="100%" />
            ) : (
              <div className={styles.empty}>{label}</div>
            )}
          </div>
        )
      })}
    </div>
  )
}
