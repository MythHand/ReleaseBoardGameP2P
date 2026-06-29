import type { ReactNode } from 'react'
import styles from './Menu.module.css'

interface MenuGroupProps {
  children: ReactNode
  className?: string
}

// Группа пунктов меню — плотная стопка; между группами Menu задаёт больший
// отступ. Чисто раскладочная обёртка: фокус регистрируется на самих MenuButton
// через MenuContext, поэтому навигация ↑/↓ идёт сквозь группы по порядку DOM.
export default function MenuGroup({ children, className = '' }: MenuGroupProps) {
  return <div className={`${styles.group} ${className}`}>{children}</div>
}
