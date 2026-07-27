import type { ReactNode } from 'react'
import styles from './HudBackground.module.css'

export type HudBackgroundTone = 'neutral' | 'positive' | 'problem' | 'grid'

interface HudBackgroundProps {
  // optional — omit to use it as a bare background layer
  children?: ReactNode
  // semantic state — neutral (grey, NOT white), positive (green), problem
  // (amber caution — e.g. a player offline), or grid (fully transparent — only
  // the techno grid, no fill/border)
  tone?: HudBackgroundTone
  className?: string
}

// HudBackground — a lighter sibling of HudSurface: same techno-grid language,
// toned right down (translucent fill, faint grid + border, no drop shadow) so it
// reads as a background fill. Its own semantic tones, not the turn-dock accents.
export default function HudBackground({
  children,
  tone = 'neutral',
  className = '',
}: HudBackgroundProps) {
  return (
    <div className={`${styles.bg} ${className}`} data-tone={tone}>
      <div className={styles.grid} aria-hidden="true" />
      <div className={styles.content}>{children}</div>
    </div>
  )
}
