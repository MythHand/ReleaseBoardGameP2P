import type { ReactNode } from 'react'
import styles from './TabRail.module.css'

export interface TabRailItem {
  id: string
  label: string
  // если задана — вкладка рендерит иконку (квадратная), а не вертикальный текст
  icon?: ReactNode
  // фиксированная высота вкладки в px. Без неё вкладки делят полосу поровну;
  // с ней вкладка занимает ровно своё, а остаток делят прочие. Нужна тем, кто
  // в общий ряд не встаёт по смыслу, — их размер задаёт консьюмер, а не рейл.
  height?: number
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
            it.height ? styles.fixed : ''
          } ${active === it.id ? styles.tabOn : ''}`}
          // высота — физическая, и это осознанно: у текстовой вкладки
          // writing-mode вертикальный, а значит её block-size идёт ПОПЕРЁК
          // полосы. Логическое свойство здесь задало бы ширину вместо высоты.
          style={it.height ? { height: `${it.height}px` } : undefined}
          aria-label={it.icon ? it.label : undefined}
          onClick={() => onSelect(it.id)}
        >
          {it.icon ?? it.label}
        </button>
      ))}
    </div>
  )
}
