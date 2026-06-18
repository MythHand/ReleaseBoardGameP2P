import Card from '@/primitives/Card'
import styles from './ReleaseZone.module.css'

const SLOTS = [
  ['frontend', 'Frontend'],
  ['backend', 'Backend'],
  ['database', 'Database'],
]

// Зона релиза игрока: по одному слоту на тип. Пустой слот — место под релиз.
export default function ReleaseZone({ release = {}, size = '84px' }) {
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
