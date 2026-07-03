import type { CSSProperties, ReactNode } from 'react'
import styles from './HudSurface.module.css'

interface HudSurfaceProps {
  children: ReactNode
  // accent colour of the border / bloom (any CSS colour / token)
  accent?: string
  // soft accent bloom in the top-left corner
  glow?: boolean
  className?: string
}

// HudSurface — the game-HUD panel surface: deep base, faint techno grid, a thin
// accent border and an optional corner bloom. A container for HUD content.
export default function HudSurface({
  children,
  accent = 'var(--turn-accent)',
  glow = true,
  className = '',
}: HudSurfaceProps) {
  return (
    <div
      className={`${styles.surface} ${className}`}
      style={{ '--hud-accent': accent } as CSSProperties}
    >
      <div className={styles.grid} aria-hidden="true" />
      {glow && <div className={styles.glow} aria-hidden="true" />}
      <div className={styles.content}>{children}</div>
    </div>
  )
}
