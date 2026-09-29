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
  // the pointer has come onto the rail — the player reaching for a panel, a
  // moment before the click. The table warms its heaviest tab on it.
  onPointerEnter?: () => void
  className?: string
}

// Controlled вертикальный таб-рейл. «Клик по активной → закрыть» решает
// консьюмер в onSelect (рейл лишь сообщает, по какой вкладке кликнули).
// A tab is as long as its own label, not a share of the rail: a short label
// makes a short tab, and what the tabs leave free stays empty at the rail's end
// (owner, 27.09). Tabs used to split the rail evenly, and a tab that wanted its
// own size had to be given a height — which went on matching the others by
// chance, whenever the rail's height made the shares come out close to it.
export default function TabRail({
  items,
  active,
  onSelect,
  side = 'right',
  onPointerEnter,
  className = '',
}: TabRailProps) {
  return (
    <div className={`${styles.rail} ${styles[side]} ${className}`} onPointerEnter={onPointerEnter}>
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
