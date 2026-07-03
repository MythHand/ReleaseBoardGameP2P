import type { ReactNode } from 'react'
import styles from './HudBackground.module.css'

export type HudBackgroundTone = 'neutral' | 'positive' | 'grid'

interface HudBackgroundProps {
  // optional — omit to use it as a bare background layer
  children?: ReactNode
  // semantic state — neutral (grey, NOT white), positive (green), or grid
  // (fully transparent — only the techno grid, no fill/border)
  tone?: HudBackgroundTone
  // draft accent bloom — mainly for the positive state
  glow?: boolean
  className?: string
}

// HudBackground — a lighter sibling of HudSurface: same techno-grid language,
// toned right down (translucent fill, faint grid + border, no drop shadow) so it
// reads as a background fill. Its own semantic tones, not the turn-dock accents.
export default function HudBackground({
  children,
  tone = 'neutral',
  glow = false,
  className = '',
}: HudBackgroundProps) {
  return (
    <div className={`${styles.bg} ${className}`} data-tone={tone}>
      <div className={styles.grid} aria-hidden="true" />
      {glow && <div className={styles.glow} aria-hidden="true" />}
      <div className={styles.content}>{children}</div>
    </div>
  )
}
