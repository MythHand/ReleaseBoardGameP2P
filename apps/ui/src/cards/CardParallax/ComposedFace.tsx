import type { CSSProperties, ReactNode } from 'react'
import styles from './CardParallax.module.css'
import {
  BASE_W,
  CARD_FONT,
  CAT_ICON_BOX,
  type ImageLayer,
  LOD,
  type ParallaxCardConfig,
  type TextLayer,
} from './config'

// how far (in cqw) a depth-1 layer shifts at full pointer deflection
const SHIFT = 7

// One paragraph of the description. `highlight` renders a coloured callout;
// `divider` renders `text` centred between two thin rules (e.g. "ИЛИ").
export interface CardParallaxParagraph {
  text: string
  bold?: string[]
  highlight?: 'sudo' | 'defense'
  divider?: boolean
}

export interface CardParallaxContent {
  // language-agnostic name (proper noun) — the consumer passes it in
  title: string
  // localized description — picked by the consumer, so this stays i18n-agnostic
  description: CardParallaxParagraph[]
}

// Glue short prepositions / conjunctions (1–2 letters) to the next word with a
// non-breaking space so they never dangle at the end of a line. Two passes catch
// back-to-back short words (a nbsp counts as whitespace for the next pass).
const SHORT_WORD = /(\s|^)([a-zA-Zа-яёА-ЯЁ]{1,2})\s+/g
function noOrphans(text: string): string {
  return text.replace(SHORT_WORD, '$1$2 ').replace(SHORT_WORD, '$1$2 ')
}

// Render a paragraph's text, bolding any of the given terms (other card names).
function renderBold(text: string, bold?: string[]): ReactNode {
  if (bold == null || bold.length === 0) return noOrphans(text)
  // longest first so "Error 503" wins over a shorter overlapping term
  const escaped = [...bold]
    .sort((a, b) => b.length - a.length)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const re = new RegExp(`(${escaped.join('|')})`, 'g')
  // split on the original text (bold terms use plain spaces); fix orphans only
  // in the non-bold segments so the bold terms are never altered
  return text.split(re).map((part, i) =>
    bold.includes(part) ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: static one-shot render; parts never reorder
      <b key={i}>{part}</b>
    ) : (
      noOrphans(part)
    ),
  )
}

// CSS class for a paragraph — a coloured callout when highlighted, else plain.
function paragraphClass(highlight?: 'sudo' | 'defense'): string {
  if (highlight === 'sudo') return styles.calloutSudo
  if (highlight === 'defense') return styles.calloutDefense
  return styles.para
}

// The layered composed card face. Driven by an EXTERNAL pointer deflection `p`
// (from the owner's tilt engine) and holds no state of its own — so the same face
// renders under CardParallax (standalone) and under Card/CardFace (unified tilt).
// At p = {0,0} every layer sits at its neutral position (flat, calm state).
export default function ComposedFace({
  config,
  content,
  p = { x: 0, y: 0 },
  lod = false,
}: {
  config: ParallaxCardConfig
  content: CardParallaxContent
  p?: { x: number; y: number }
  lod?: boolean
}) {
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
  // category glyph — an svgr component tinted via currentColor (it inherits the
  // accent set on the .category container); capitalised for use as a JSX element
  const CategoryIcon = config.category?.icon

  // renders ONLY the layers — the `.face` container (clip + base bg + isolation +
  // the cqw context on the card `.root`) is provided by the host (CardParallax or
  // Card via CardFace), so there is one face element and no double clip/shadow.
  return (
    <>
      <img
        className={styles.img}
        src={config.background.src}
        alt=""
        style={imgStyle(config.background)}
      />
      <div
        className={styles.panel}
        style={{ ...shift(config.panel.depth), opacity: config.panel.opacity }}
      />
      {config.decor && (
        <img className={styles.img} src={config.decor.src} alt="" style={imgStyle(config.decor)} />
      )}
      <img className={styles.img} src={config.grid.src} alt="" style={imgStyle(config.grid)} />
      <img className={styles.img} src={illustration.src} alt="" style={imgStyle(illustration)} />
      {!lod && config.category && CategoryIcon && (
        <div
          className={styles.category}
          style={{
            top: cqw(config.category.top),
            left: cqw(config.category.left),
            color: config.category.accent,
            ...shift(config.category.depth),
          }}
        >
          <span className={styles.iconBox} style={{ height: cqw(CAT_ICON_BOX) }}>
            <CategoryIcon
              className={styles.catIcon}
              style={{ width: cqw(config.category.w), height: cqw(config.category.h) }}
            />
          </span>
          <span className={styles.catLabel} style={{ fontSize: cqw(CARD_FONT.category) }}>
            {config.category.label}
          </span>
        </div>
      )}
      {!lod && config.fast && (
        <span
          className={styles.fastBox}
          style={{
            top: cqw(config.fast.top),
            right: cqw(config.fast.right),
            height: cqw(CAT_ICON_BOX),
            ...shift(config.fast.depth),
          }}
        >
          <img
            className={styles.catIcon}
            src={config.fast.icon}
            alt=""
            style={{ width: cqw(config.fast.w), height: cqw(config.fast.h) }}
          />
        </span>
      )}
      <div className={styles.title} style={textStyle(config.title, titleSize)}>
        {content.title}
      </div>
      {!lod && (
        <div className={styles.desc} style={textStyle(config.description, CARD_FONT.description)}>
          {content.description.map((para) =>
            para.divider ? (
              <div key={para.text} className={styles.divider}>
                <span>{para.text}</span>
              </div>
            ) : (
              <p key={para.text} className={paragraphClass(para.highlight)}>
                {renderBold(para.text, para.bold)}
              </p>
            ),
          )}
        </div>
      )}
    </>
  )
}
