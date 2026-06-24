import type { ReactNode } from 'react'
import styles from './Badge.module.css'

export type BadgeTone = 'success' | 'muted' | 'danger' | 'warning' | 'info'

interface BadgeProps {
  children: ReactNode
  // цвет: success — зелёный, muted — серый, danger — красный, warning — янтарь, info — синий
  tone?: BadgeTone
  // обведённый бейдж (как роль host)
  outlined?: boolean
  size?: 'sm' | 'md'
  className?: string
}

// Моно-бейдж статуса/роли. Тон задаёт цвет, outlined — рамку, size — кегль.
export default function Badge({
  children,
  tone = 'muted',
  outlined = false,
  size = 'md',
  className = '',
}: BadgeProps) {
  return (
    <span
      className={`${styles.badge} ${styles[tone]} ${styles[size]} ${
        outlined ? styles.outlined : ''
      } ${className}`}
    >
      {children}
    </span>
  )
}
