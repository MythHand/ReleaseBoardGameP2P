import { type CSSProperties, type MouseEvent, useState } from 'react'
import styles from './CardParallax.module.css'
import ComposedFace, { type CardParallaxContent } from './ComposedFace'
import { BASE_W, FRONTEND, type ParallaxCardConfig } from './config'

// CardParallax — the standalone, self-tilting composed card: it owns the pointer
// tilt engine and renders the shared ComposedFace (the layers). The SAME face also
// renders under Card/CardFace, driven by Card's tilt — so there is one face and no
// duplicated engine. Kept standalone for previews and the Rules hover-zoom overlay.

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
  const [p, setP] = useState({ x: 0, y: 0 })
  const [hover, setHover] = useState(false)

  function handleMove(e: MouseEvent<HTMLDivElement>) {
    if (!interactive) return
    const r = e.currentTarget.getBoundingClientRect()
    setP({
      x: (e.clientX - r.left) / r.width - 0.5,
      y: (e.clientY - r.top) / r.height - 0.5,
    })
  }
  function enter() {
    if (interactive) setHover(true)
  }
  function reset() {
    setHover(false)
    setP({ x: 0, y: 0 })
  }

  // whole-card hover tilt/lift — ported 1:1 from the PNG Card (TILT_MAX 7 → ±7°)
  const tilt =
    `translateY(${hover ? -10 : 0}px) scale(${hover ? 1.04 : 1}) ` +
    `rotateX(${(-p.y * 14).toFixed(2)}deg) rotateY(${(p.x * 14).toFixed(2)}deg)`

  const rootStyle = { width: `${width}px` } as CSSProperties

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: mouse handlers drive the decorative hover parallax only; no actionable behaviour
    <div
      className={styles.root}
      style={rootStyle}
      onMouseEnter={enter}
      onMouseMove={handleMove}
      onMouseLeave={reset}
    >
      <div className={styles.tilt} style={{ transform: tilt }}>
        <div className={styles.face}>
          <ComposedFace config={config} content={content} p={p} lod={lod} />
        </div>
      </div>
    </div>
  )
}
