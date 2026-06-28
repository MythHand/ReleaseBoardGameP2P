import type { ReactNode } from 'react'
import styles from './TabRail.module.css'

export interface TabRailItem {
  id: string
  label: string
  // если задана — вкладка рендерит иконку (квадратная), а не вертикальный текст
  icon?: ReactNode
}

interface TabRailProps {
  items: TabRailItem[]
  // активная вкладка или null (ничего не выбрано)
  active: string | null
  onSelect: (id: string) => void
  side?: 'right' | 'left'
  className?: string
}

// Controlled вертикальный таб-рейл. «Клик по активной → закрыть» решает
// консьюмер в onSelect (рейл лишь сообщает, по какой вкладке кликнули).
export default function TabRail({
  items,
  active,
  onSelect,
  side = 'right',
  className = '',
}: TabRailProps) {
  return (
    <div className={`${styles.rail} ${styles[side]} ${className}`}>
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          className={`${styles.tab} ${it.icon ? styles.square : ''} ${
            active === it.id ? styles.tabOn : ''
          }`}
          aria-label={it.icon ? it.label : undefined}
          onClick={() => onSelect(it.id)}
        >
          {it.icon ?? it.label}
        </button>
      ))}
    </div>
  )
}
