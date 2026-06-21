import type { Card as CardType } from '@/cards/types'
import Card from '@/primitives/Card'
import styles from './ReleaseZone.module.css'

interface ReleaseSlots {
  frontend?: CardType | null
  backend?: CardType | null
  database?: CardType | null
}

interface ReleaseZoneProps {
  release?: ReleaseSlots
  size?: string
}

const SLOTS: Array<[keyof ReleaseSlots, string]> = [
  ['frontend', 'Frontend'],
  ['backend', 'Backend'],
  ['database', 'Database'],
]

// Зона релиза игрока: по одному слоту на тип. Пустой слот — место под релиз.
export default function ReleaseZone({ release = {}, size = '84px' }: ReleaseZoneProps) {
  return (
    <div className={styles.zone}>
      {SLOTS.map(([key, label]) => {
        const card = release[key]
        return (
          <div key={key} className={styles.slot} style={{ width: size }}>
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
