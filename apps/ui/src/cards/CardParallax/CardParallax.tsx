import { type CSSProperties, type MouseEvent, useState } from 'react'
import styles from './CardParallax.module.css'
import {
  BASE_W,
  CARD_FONT,
  FRONTEND,
  type ImageLayer,
  LOD,
  type ParallaxCardConfig,
  type TextLayer,
} from './config'

// CardParallax — the code-composed, layered card face. A STANDALONE alternative
// to the flat-PNG `Card` primitive (it does not touch Card/CardFace). Layers are
// stacked at their native size and centered; parallax runs only while the card
// is hovered (interactive), everything else is a static, calm state.

export interface CardParallaxContent {
  // language-agnostic name (proper noun) — the consumer passes it in
  title: string
  // localized effect text — picked by the consumer, so this stays i18n-agnostic
  description: string
}

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

// how far (in cqw) a depth-1 layer shifts at full pointer deflection
const SHIFT = 7
// Figma layer-blur on the panel, authored against the 368-wide frame
const PANEL_BLUR = 14

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

  // design px → cqw against the frame width, so everything scales as one unit
  const cqw = (px: number) => `${((px / BASE_W) * 100).toFixed(3)}cqw`
  // per-layer parallax offset, exposed as cqw custom props for the transform
  const shift = (depth: number): CSSProperties =>
    ({
      '--dx': `${(-p.x * depth * SHIFT).toFixed(3)}cqw`,
      '--dy': `${(-p.y * depth * SHIFT).toFixed(3)}cqw`,
    }) as CSSProperties

  const imgStyle = (l: ImageLayer): CSSProperties => ({
    width: cqw(l.w),
    height: cqw(l.h),
    marginLeft: cqw(l.x ?? 0),
    marginTop: cqw(l.y ?? 0),
    ...shift(l.depth),
  })

  // text vertical anchor — from the bottom edge when `bottom` is set, else top;
  // size comes from the shared CARD_FONT so every card stays consistent
  const textStyle = (l: TextLayer, sizePx: number): CSSProperties => ({
    ...(l.bottom == null ? { top: cqw(l.top ?? 0) } : { bottom: cqw(l.bottom) }),
    left: cqw(l.padX),
    right: cqw(l.padX),
    fontSize: cqw(sizePx),
    ...shift(l.depth),
  })

  // blur is a px filter (no cqw), so scale it with the display width to keep
  // the look consistent across authoring and small previews
  const blurScale = width / BASE_W
  const rootStyle = {
    width: `${width}px`,
    '--blur': `${(PANEL_BLUR * blurScale).toFixed(2)}px`,
  } as CSSProperties

  // LOD enlarges the illustration and drops it lower; everything else is shared
  const illustration: ImageLayer = lod
    ? {
        ...config.illustration,
        w: config.illustration.w * LOD.illustrationScale,
        h: config.illustration.h * LOD.illustrationScale,
        y: (config.illustration.y ?? 0) + LOD.illustrationYDrop,
      }
    : config.illustration
  // LOD also enlarges the title
  const titleSize = lod ? CARD_FONT.title * LOD.titleScale : CARD_FONT.title

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
          <img
            className={styles.img}
            src={config.background.src}
            alt=""
            style={imgStyle(config.background)}
          />
          <div className={styles.panel} style={shift(config.panel.depth)} />
          <div className={styles.noise} style={shift(config.panel.depth)} />
          <img className={styles.img} src={config.grid.src} alt="" style={imgStyle(config.grid)} />
          <img
            className={styles.img}
            src={illustration.src}
            alt=""
            style={imgStyle(illustration)}
          />
          {!lod && (
            <div
              className={styles.category}
              style={{
                top: cqw(config.category.top),
                left: cqw(config.category.left),
                color: config.category.accent,
                ...shift(config.category.depth),
              }}
            >
              <img
                className={styles.catIcon}
                src={config.category.icon}
                alt=""
                style={{ width: cqw(config.category.w), height: cqw(config.category.h) }}
              />
              <span className={styles.catLabel} style={{ fontSize: cqw(CARD_FONT.category) }}>
                {config.category.label}
              </span>
            </div>
          )}
          <div className={styles.title} style={textStyle(config.title, titleSize)}>
            {content.title}
          </div>
          {!lod && (
            <div
              className={styles.desc}
              style={textStyle(config.description, CARD_FONT.description)}
            >
              {content.description}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
