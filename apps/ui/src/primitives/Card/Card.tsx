import type { CSSProperties } from 'react'
import { useEffect, useRef } from 'react'
// The leaf module, not the barrel: the barrel also carries the flight steps,
// and those render a Card. Importing it here would close a cycle
// (animations → useFlyer → Card → animations). The vocabulary is a leaf that
// components may use; the steps sit above components and compose them.
import { play } from '@/animations/play'
import { CATEGORIES } from '@/cards'
import { useCardMotion } from '@/cards/cardMotion'
import type { Card as CardType } from '@/cards/types'
import { type Deflection, useCardTilt } from '@/cards/useCardTilt'
import styles from './Card.module.css'
import CardBack from './CardBack'
import CardFace from './CardFace'

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
  // simplified reading of the face — used where a card is furniture rather than
  // something to read in full (a release standing in its zone). The layers stay
  // the same and only their values change, so it animates between the two.
  lod?: boolean
  // the face arrives already deflected and straightens out of it — for a card
  // that continues on a NEW instance (torn out of the fan onto the drag layer)
  tiltFrom?: Deflection
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
  lod,
  tiltFrom,
}: CardProps) {
  const flipRef = useRef<HTMLDivElement>(null)
  const initialDown = useRef(faceDown)
  const prevDown = useRef(faceDown)

  // Флип лицо↔рубашка — через словарь анимаций (play('flipCard')).
  // Начальное положение задано инлайн-стилем (без мигания); все последующие
  // перевороты ведёт WAAPI с fill:forwards.
  useEffect(() => {
    if (prevDown.current === faceDown) return
    prevDown.current = faceDown
    play('flipCard', flipRef.current, { faceDown })
  }, [faceDown])

  const motion = useCardMotion()
  const disabled = state === 'disabled'
  // controlled-режим (interactive=false) — ховером/подъёмом управляет родитель (напр. Рука)
  const canInteract = interactive && !disabled
  // параллакс: по умолчанию следует за interactive, но Рука включает его точечно
  // для наведённой (увеличенной) карты — tilt={true}. Экранная настройка
  // (CardMotionProvider) гасит его поверх всего — это выбор игрока, а не карты.
  const tiltOn = (tilt ?? interactive) && !disabled && motion
  const accent = accentProp ?? CATEGORIES[card?.category]?.accent ?? 'var(--brand-green)'

  // shared tilt engine — Card separates parallax (tiltOn) from hover-lift (canInteract).
  // An arrival deflection only means something where the pointer parallax runs at
  // all: with it off screen-wide, the card this one continues was flat too.
  const { p, hover, transform, tiltRef, onMouseEnter, onMouseMove, onMouseLeave } = useCardTilt({
    tilt: tiltOn,
    lift: canInteract,
    from: motion ? tiltFrom : undefined,
  })
  const lifted = hover

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: mouse handlers drive decorative hover-lift/parallax only; actionable cards (onClick) get role=button + onKeyDown + tabIndex below
    <div
      className={styles.root}
      data-state={state}
      style={
        {
          '--accent': accent,
          width: typeof width === 'number' ? `${width}px` : (width ?? 'var(--card-w)'),
          zIndex: lifted ? 'var(--z-card-lifted)' : 'auto',
        } as CSSProperties
      }
      onMouseEnter={onMouseEnter}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
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
      <div className={styles.tilt} ref={tiltRef} style={{ transform }}>
        <div
          className={styles.flip}
          ref={flipRef}
          style={{ transform: `rotateY(${initialDown.current ? 180 : 0}deg)` }}
        >
          <div className={styles.face}>
            <CardFace card={card} p={p} png={png} lod={lod} />
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
