import type { CSSProperties } from 'react'
import styles from './StatusDot.module.css'

interface StatusDotProps {
  // dot colour (any CSS colour / token)
  accent?: string
  // gentle opacity pulse (live-status feel)
  pulse?: boolean
  size?: number
  className?: string
}

// StatusDot — a small glowing status indicator, optionally pulsing. Decorative.
export default function StatusDot({
  accent = 'var(--turn-accent)',
  pulse = true,
  size = 8,
  className = '',
}: StatusDotProps) {
  return (
    <span
      className={`${styles.dot} ${pulse ? styles.pulse : ''} ${className}`}
      style={{ '--dot': accent, '--dot-size': `${size}px` } as CSSProperties}
      aria-hidden="true"
    />
  )
}
