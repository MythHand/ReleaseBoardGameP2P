import type { CSSProperties, ReactNode } from 'react'
import Typography from '../Typography'
import styles from './RingTimer.module.css'

interface RingTimerProps {
  // 0..1 of the time still left — drives the ring sweep
  progress: number
  // centered readout (e.g. seconds); omit for a bare ring
  value?: ReactNode
  size?: number
  strokeWidth?: number
  // accent colour of the progress arc + glow (any CSS colour / token)
  accent?: string
}

const VIEW = 128
const R = 54
const C = 2 * Math.PI * R

// RingTimer — circular countdown indicator: a depleting accent arc with an
// optional centered readout. Presentational; the value/progress are passed in.
export default function RingTimer({
  progress,
  value,
  size = 72,
  strokeWidth = 8,
  accent = 'var(--turn-accent)',
}: RingTimerProps) {
  const p = Math.min(Math.max(progress, 0), 1)
  const dash = C * (1 - p)

  return (
    <div
      className={styles.ring}
      style={{ '--ring-size': `${size}px`, '--ring-accent': accent } as CSSProperties}
    >
      <svg viewBox={`0 0 ${VIEW} ${VIEW}`} className={styles.svg} aria-hidden="true">
        <circle className={styles.track} cx="64" cy="64" r={R} strokeWidth={strokeWidth} />
        <circle
          className={styles.prog}
          cx="64"
          cy="64"
          r={R}
          strokeWidth={strokeWidth}
          strokeDasharray={C}
          strokeDashoffset={dash}
        />
      </svg>
      {value != null && (
        <Typography as="span" base="numeric-lg" className={styles.value} data-testid="ring-value">
          {value}
        </Typography>
      )}
    </div>
  )
}
