import {
  type AnimationEvent,
  type CSSProperties,
  type ReactNode,
  startTransition,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import styles from './Drawer.module.css'

interface DrawerProps {
  open: boolean
  side?: 'right' | 'left'
  // ширина поверхности; меняется плавно (анимируется inline-size)
  width?: number | string
  // What the panel is showing — a tab id. Changed while the panel is open, the
  // old content fades out and the new one fades in, instead of one replacing
  // the other on the spot. Left out, the content is simply replaced.
  contentKey?: string | null
  // Tabs whose content is built AHEAD of time and kept, by the same ids as
  // `contentKey`, each at the width it is shown at. For content too heavy to
  // build in the frames the panel widens in — the rules, with a card inside
  // every other paragraph, stalled the widening they were built during (owner,
  // 25.09). Built once the page is idle, hidden until its id is the panel's,
  // never taken down. `children` carries nothing for these ids.
  prebuilt?: Record<string, { node: ReactNode; width?: number | string }>
  // Build the prebuilt tabs now — the player is reaching for the panel. Where
  // the browser cannot say when it is idle (Safari has no requestIdleCallback),
  // this is the only moment they are built ahead of being opened.
  warm?: boolean
  children: ReactNode
  className?: string
}

// One piece of content at the width it was shown at.
interface Layer {
  key: string | null | undefined
  node: ReactNode
  width: number | string | undefined
}

const sizeOf = (width: number | string | undefined): CSSProperties | undefined =>
  width == null ? undefined : { inlineSize: typeof width === 'number' ? `${width}px` : width }

// Тупая controlled-поверхность: знает только сторону, ширину и открыт/закрыт.
// Оркестрацию (что показывать, когда открывать) держит консьюмер.
//
// THE PANEL IS A MASK OVER ITS CONTENT (owner, 25.09). The width animates; the
// content does not follow it. Each piece of content sits in its own layer at
// the width it is shown at, pinned to the rail's side, so while the panel's
// edge travels the text stands still and is uncovered or covered by that edge —
// laid out against the moving width instead, every line re-wrapped on every
// frame of the slide.
export default function Drawer({
  open,
  side = 'right',
  width,
  contentKey,
  prebuilt,
  warm = false,
  children,
  className = '',
}: DrawerProps) {
  // What the last commit showed, and whether the panel was open for it. Written
  // after every commit, read during the render a tab change arrives in: the
  // content that was on screen becomes the layer that fades out.
  const shown = useRef<{ open: boolean; layer: Layer } | null>(null)
  const [leaving, setLeaving] = useState<Layer | null>(null)

  // Asked in RENDER, not in an effect: the leaving layer must be in the same
  // commit as the arriving one. One commit without it unmounts the old content,
  // and the fade would then start from a fresh copy of it — a scrolled list
  // back at its top.
  const last = shown.current
  if (open && last?.open && last.layer.key !== contentKey && leaving?.key !== last.layer.key) {
    setLeaving(last.layer)
  }
  // The commit the panel comes out in. A closed panel keeps the width of the
  // tab it last showed; opened onto a tab of another width, it used to change
  // width WHILE sliding out, and the content — pinned to the rail's side — sat
  // deeper than the panel's edge and drifted as the width settled (owner,
  // 25.09). Hidden behind the rail, it simply takes the new width at once: the
  // width travels only between tabs of a panel that is already out.
  const arriving = open && !last?.open
  useLayoutEffect(() => {
    shown.current = { open, layer: { key: contentKey, node: children, width } }
  })

  // The prebuilt tabs go up when the page has a moment — or when the player
  // reaches for the panel, whichever comes first — and as a transition, so React
  // builds them in slices between frames rather than in one block. There is no
  // "at once" fallback where the browser cannot tell idle: at once is during
  // the table's opening, and that is the stall this exists to avoid (and every
  // board test paid for it, 25.09).
  const hasPrebuilt = prebuilt != null
  const [built, setBuilt] = useState(false)
  useEffect(() => {
    if (!hasPrebuilt || built) return
    const build = () => startTransition(() => setBuilt(true))
    if (warm) {
      build()
      return
    }
    if (typeof requestIdleCallback !== 'function') return
    const id = requestIdleCallback(build)
    return () => cancelIdleCallback(id)
  }, [hasPrebuilt, built, warm])

  const isPrebuilt = (key: string | null | undefined) =>
    key != null && prebuilt != null && key in prebuilt
  // only the layer's own fade — content inside animates too, and bubbles
  const endLeaving = (e: AnimationEvent) => {
    if (e.target === e.currentTarget) setLeaving(null)
  }

  return (
    <div
      className={`${styles.drawer} ${styles[side]} ${open ? styles.open : ''} ${arriving ? styles.arriving : ''} ${className}`}
      style={sizeOf(width)}
      aria-hidden={!open}
      inert={!open}
    >
      {/* Keyed by the content, so the layer that was on screen stays the same
          instance while it fades: its scroll and state go with it. */}
      {leaving && !isPrebuilt(leaving.key) && (
        <div
          key={String(leaving.key)}
          className={`${styles.layer} ${styles.leaving}`}
          style={sizeOf(leaving.width)}
          aria-hidden
          inert
          onAnimationEnd={endLeaving}
        >
          {leaving.node}
        </div>
      )}
      {!isPrebuilt(contentKey) && (
        <div
          key={String(contentKey)}
          className={`${styles.layer} ${leaving ? styles.entering : ''}`}
          style={sizeOf(width)}
        >
          {children}
        </div>
      )}
      {prebuilt &&
        Object.entries(prebuilt).map(([key, tab]) => {
          const active = open && key === contentKey
          const fading = leaving?.key === key
          // asked for before the page had its moment: built now, as it always was
          if (!built && !active && !fading) return null
          const state = active
            ? leaving
              ? styles.entering
              : ''
            : fading
              ? styles.leaving
              : styles.waiting
          return (
            <div
              key={`prebuilt:${key}`}
              className={`${styles.layer} ${state}`}
              style={sizeOf(tab.width)}
              aria-hidden={!active}
              inert={!active}
              onAnimationEnd={fading ? endLeaving : undefined}
            >
              {tab.node}
            </div>
          )
        })}
    </div>
  )
}
