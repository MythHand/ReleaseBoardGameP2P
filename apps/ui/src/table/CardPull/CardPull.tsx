import { type CSSProperties, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { play } from '@/animations/play'
import type { Card as CardType } from '@/cards/types'
import Card from '@/primitives/Card'
import type { HandPlayDrop } from '@/table/Hand/Hand'
import styles from './CardPull.module.css'

export interface CardPullProps {
  card: CardType
  label: string
  faceDown?: boolean
  width?: number
  disabled?: boolean
  selected?: boolean
  className?: string
  style?: CSSProperties
  onDrop: (drop: HandPlayDrop) => boolean
  onKeyboardPick?: () => void
}

// Card choices use the same pointer gesture in a catalogue and a closed fan.
// The carrier lives outside transformed/scrolling parents, in viewport coords.
export default function CardPull(props: CardPullProps) {
  const { card, label, faceDown, width = 150, disabled, selected, className, style } = props
  const latest = useRef(props)
  latest.current = props
  const cleanup = useRef<(() => void) | null>(null)
  const carrier = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ rect: DOMRect; returning?: boolean } | null>(null)
  const epoch = useRef(0)
  useEffect(() => {
    if (disabled) {
      epoch.current += 1
      cleanup.current?.()
      setDrag(null)
    }
  }, [disabled])
  useEffect(
    () => () => {
      epoch.current += 1
      cleanup.current?.()
    },
    [],
  )

  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-pressed={Boolean(selected)}
        disabled={disabled}
        className={`${styles.pick} ${className ?? ''}`}
        style={{ ...style, opacity: drag ? 0 : style?.opacity }}
        onKeyDown={(e) => {
          if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            latest.current.onKeyboardPick?.()
          }
        }}
        onPointerDown={(e) => {
          if (disabled || drag || cleanup.current || e.button !== 0) return
          e.preventDefault()
          e.stopPropagation()
          const pointer = e.pointerId
          const down = { x: e.clientX, y: e.clientY }
          const from = e.currentTarget.getBoundingClientRect()
          const token = ++epoch.current
          let moved = false
          const at = (x: number, y: number) =>
            new DOMRect(from.x + x - down.x, from.y + y - down.y, from.width, from.height)
          const stop = () => {
            window.removeEventListener('pointermove', move)
            window.removeEventListener('pointerup', up)
            window.removeEventListener('pointercancel', cancel)
            cleanup.current = null
          }
          const move = (event: PointerEvent) => {
            if (event.pointerId !== pointer || latest.current.disabled) return
            moved ||= Math.hypot(event.clientX - down.x, event.clientY - down.y) >= 6
            if (moved) setDrag({ rect: at(event.clientX, event.clientY) })
          }
          const cancel = () => {
            stop()
            setDrag(null)
          }
          const up = (event: PointerEvent) => {
            if (event.pointerId !== pointer) return
            stop()
            const rect = at(event.clientX, event.clientY)
            if (!moved || latest.current.disabled) {
              setDrag(null)
              return
            }
            if (latest.current.onDrop({ x: event.clientX, y: event.clientY, rect })) {
              setDrag(null)
              return
            }
            setDrag({ rect, returning: true })
            const animation =
              carrier.current && play('playToCenter', carrier.current, { from: rect, to: from })
            void Promise.resolve(animation?.finished)
              .catch(() => {})
              .then(() => {
                if (epoch.current === token) setDrag(null)
              })
          }
          cleanup.current = stop
          window.addEventListener('pointermove', move)
          window.addEventListener('pointerup', up)
          window.addEventListener('pointercancel', cancel)
        }}
      >
        <Card
          card={card}
          faceDown={faceDown}
          width={width}
          interactive={false}
          state={selected ? 'selected' : 'idle'}
          accent="var(--select-accent)"
        />
      </button>
      {drag &&
        createPortal(
          <div
            ref={carrier}
            className={styles.carrier}
            style={{ left: drag.rect.left, top: drag.rect.top, width: drag.rect.width }}
            aria-hidden="true"
          >
            <Card card={card} faceDown={faceDown} width="100%" interactive={false} />
          </div>,
          document.body,
        )}
    </>
  )
}
