import { useEffect, useRef, useState } from 'react'
import { CATEGORIES } from '@/cards'
import { play } from '@/animations'
import CardFace from './CardFace.jsx'
import CardBack from './CardBack.jsx'
import styles from './Card.module.css'

// Скромный наклон, чтобы не «кринж» в вебе. Тюнингуется.
const TILT_MAX = 7

/**
 * Атом карты. Рендер лица — за абстракцией CardFace (image сейчас, composed позже).
 * @param {{
 *   card: import('@/cards/catalogue.js').Card,
 *   faceDown?: boolean,
 *   state?: 'idle'|'playable'|'selected'|'disabled',
 *   tilt?: boolean,
 *   width?: string,
 *   onClick?: () => void,
 * }} props
 */
export default function Card({
  card,
  faceDown = false,
  state = 'idle',
  tilt, // undefined → следует за interactive; Рука передаёт явно для наведённой карты
  interactive = true,
  width,
  onClick,
}) {
  const ref = useRef(null)
  const flipRef = useRef(null)
  const initialDown = useRef(faceDown)
  const prevDown = useRef(faceDown)
  const [hover, setHover] = useState(false)
  const [rot, setRot] = useState({ rx: 0, ry: 0 })

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
  const accent = CATEGORIES[card?.category]?.accent ?? 'var(--brand-green)'

  // сбрасываем наклон, когда параллакс выключается (карта ушла из наведения)
  useEffect(() => {
    if (!tiltOn) setRot({ rx: 0, ry: 0 })
  }, [tiltOn])

  function handleMove(e) {
    if (!tiltOn) return
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width - 0.5
    const py = (e.clientY - r.top) / r.height - 0.5
    setRot({ rx: -py * TILT_MAX * 2, ry: px * TILT_MAX * 2 })
  }

  function handleEnter() {
    if (canInteract) setHover(true)
  }

  function handleLeave() {
    setHover(false)
    setRot({ rx: 0, ry: 0 })
  }

  const lifted = hover
  const transform =
    `translateY(${lifted ? -10 : 0}px) scale(${lifted ? 1.04 : 1}) ` +
    `rotateX(${rot.rx}deg) rotateY(${rot.ry}deg)`

  return (
    <div
      ref={ref}
      className={styles.root}
      data-state={state}
      style={{
        '--accent': accent,
        width: width ?? 'var(--card-w)',
        zIndex: lifted ? 'var(--z-card-lifted)' : 'auto',
      }}
      onMouseEnter={handleEnter}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      onClick={!disabled ? onClick : undefined}
    >
      <div className={styles.tilt} style={{ transform }}>
        <div
          className={styles.flip}
          ref={flipRef}
          style={{ transform: `rotateY(${initialDown.current ? 180 : 0}deg)` }}
        >
          <div className={`${styles.face} ${styles.front}`}>
            <CardFace card={card} />
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
