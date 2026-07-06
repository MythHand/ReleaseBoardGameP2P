import type { CSSProperties } from 'react'
import { useEffect, useRef, useState } from 'react'
import { play } from '@/animations'
import { CATEGORIES } from '@/cards'
import type { Card as CardType } from '@/cards/types'
import styles from './Card.module.css'
import CardBack from './CardBack'
import CardFace from './CardFace'

// Скромный наклон, чтобы не «кринж» в вебе. Тюнингуется.
const TILT_MAX = 7

interface CardProps {
  card: CardType
  faceDown?: boolean
  state?: 'idle' | 'playable' | 'selected' | 'disabled'
  tilt?: boolean
  interactive?: boolean
  // number → px (formatted here); string passes through (e.g. '100%' to fill the parent)
  width?: number | string
  onClick?: () => void
  // переопределить цвет свечения (по умолчанию — акцент категории карты)
  accent?: string
  // force the flat PNG face instead of the composed one (OG-card showcase)
  png?: boolean
}

/**
 * Атом карты. Рендер лица — за абстракцией CardFace (image сейчас, composed позже).
 */
export default function Card({
  card,
  faceDown = false,
  state = 'idle',
  tilt, // undefined → следует за interactive; Рука передаёт явно для наведённой карты
  interactive = true,
  width,
  onClick,
  accent: accentProp,
  png,
}: CardProps) {
  const ref = useRef<HTMLDivElement>(null)
  const flipRef = useRef<HTMLDivElement>(null)
  const initialDown = useRef(faceDown)
  const prevDown = useRef(faceDown)
  const [hover, setHover] = useState(false)
  const [p, setP] = useState({ x: 0, y: 0 })

  // Флип лицо↔рубашка — через словарь анимаций (play('flipCard')).
  // Начальное положение задано инлайн-стилем (без мигания); все последующие
  // перевороты ведёт WAAPI с fill:forwards.
  useEffect(() => {
    if (prevDown.current === faceDown) return
    prevDown.current = faceDown
    play('flipCard', flipRef.current, { faceDown })
  }, [faceDown])

  const disabled = state === 'disabled'
  // controlled-режим (interactive=false) — ховером/подъёмом управляет родитель (напр. Рука)
  const canInteract = interactive && !disabled
  // параллакс: по умолчанию следует за interactive, но Рука включает его точечно
  // для наведённой (увеличенной) карты — tilt={true}
  const tiltOn = (tilt ?? interactive) && !disabled
  const accent = accentProp ?? CATEGORIES[card?.category]?.accent ?? 'var(--brand-green)'

  // сбрасываем наклон, когда параллакс выключается (карта ушла из наведения)
  useEffect(() => {
    if (!tiltOn) setP({ x: 0, y: 0 })
  }, [tiltOn])

  function handleMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!tiltOn) return
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width - 0.5
    const py = (e.clientY - r.top) / r.height - 0.5
    setP({ x: px, y: py })
  }

  function handleEnter() {
    if (canInteract) setHover(true)
  }

  function handleLeave() {
    setHover(false)
    setP({ x: 0, y: 0 })
  }

  const lifted = hover
  const transform =
    `translateY(${lifted ? -10 : 0}px) scale(${lifted ? 1.04 : 1}) ` +
    `rotateX(${-p.y * TILT_MAX * 2}deg) rotateY(${p.x * TILT_MAX * 2}deg)`

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: mouse handlers drive decorative hover-lift/parallax only; actionable cards (onClick) get role=button + onKeyDown + tabIndex below
    <div
      ref={ref}
      className={styles.root}
      data-state={state}
      style={
        {
          '--accent': accent,
          width: typeof width === 'number' ? `${width}px` : (width ?? 'var(--card-w)'),
          zIndex: lifted ? 'var(--z-card-lifted)' : 'auto',
        } as CSSProperties
      }
      onMouseEnter={handleEnter}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      onClick={disabled ? undefined : onClick}
      onKeyDown={
        !disabled && onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') onClick()
            }
          : undefined
      }
      role={onClick ? 'button' : undefined}
      tabIndex={onClick && !disabled ? 0 : undefined}
    >
      <div className={styles.tilt} style={{ transform }}>
        <div
          className={styles.flip}
          ref={flipRef}
          style={{ transform: `rotateY(${initialDown.current ? 180 : 0}deg)` }}
        >
          <div className={styles.face}>
            <CardFace card={card} p={p} png={png} />
          </div>
          <div className={`${styles.face} ${styles.back}`}>
            <CardBack deck={card?.deck} />
          </div>
        </div>
        {/* подсветка внутри наклоняемого слоя — привязана к краям карты */}
        <div className={styles.glow} aria-hidden="true" />
      </div>
    </div>
  )
}
