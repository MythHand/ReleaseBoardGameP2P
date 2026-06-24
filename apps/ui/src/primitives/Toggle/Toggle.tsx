import type { ReactNode } from 'react'
import styles from './Toggle.module.css'

interface ToggleProps {
  on: boolean
  onChange?: (on: boolean) => void
  children: ReactNode
  className?: string
}

// Бинарный тоггл-пилюля (вкл/выкл). Подпись — через children (i18n-agnostic).
export default function Toggle({ on, onChange, children, className = '' }: ToggleProps) {
  return (
    <button
      type="button"
      className={`${styles.toggle} ${on ? styles.on : ''} ${className}`}
      onClick={() => onChange?.(!on)}
      aria-pressed={on}
    >
      {children}
    </button>
  )
}
