import type { CSSProperties } from 'react'
import { useCardTilt } from '../useCardTilt'
import styles from './CardParallax.module.css'
import ComposedFace, { type CardParallaxContent } from './ComposedFace'
import { BASE_W, FRONTEND, type ParallaxCardConfig } from './config'

// CardParallax — the display-only composed card: no flip / states / click, just the
// face + tilt. It drives the shared ComposedFace (the layers) with the shared
// useCardTilt engine. The interactive primitive Card renders the SAME face with the
// SAME engine — one face, one tilt engine, no copies. Used for previews and the
// Rules hover-zoom overlay; Card is the full game-table card.

// re-exported so existing consumers keep importing the content type from here
export type { CardParallaxContent, CardParallaxParagraph } from './ComposedFace'

interface CardParallaxProps {
  content: CardParallaxContent
  config?: ParallaxCardConfig
  // display width in px — the component formats the unit and scales everything in cqw
  width?: number
  // false → no pointer parallax, the calm static state (previews, table, piles)
  interactive?: boolean
  // simplified variant for the release zone: no category / description, larger
  // and lower illustration
  lod?: boolean
}

export default function CardParallax({
  content,
  config = FRONTEND,
  width = BASE_W,
  interactive = true,
  lod = false,
}: CardParallaxProps) {
  // shared tilt engine — previews tie both parallax and hover-lift to `interactive`
  const { p, transform, onMouseEnter, onMouseMove, onMouseLeave } = useCardTilt({
    tilt: interactive,
    lift: interactive,
  })

  const rootStyle = { width: `${width}px` } as CSSProperties

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: mouse handlers drive the decorative hover parallax only; no actionable behaviour
    <div
      className={styles.root}
      style={rootStyle}
      onMouseEnter={onMouseEnter}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      <div className={styles.tilt} style={{ transform }}>
        <div className={styles.face}>
          <ComposedFace config={config} content={content} p={p} lod={lod} />
        </div>
      </div>
    </div>
  )
}
