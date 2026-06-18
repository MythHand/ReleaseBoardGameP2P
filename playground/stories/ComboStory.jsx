import { useEffect, useRef, useState } from 'react'
import Card from '@/primitives/Card'
import Arrow from '@/primitives/Arrow'
import { cardById, isComboSource, validComboTarget, cardCanTarget } from '@/cards'
import { play } from '@/animations'
import styles from './ComboStory.module.css'

let _u = 0
const uid = () => `c${++_u}`

const makeHand = () =>
  [
    'support-sudo',
    'attack-security-bug', // sudo-able + целится → центр → сброс
    'operation-system-upgrade', // sudo-able, без цели → центр → сброс
    'support-code-review',
    'release-frontend', // release → зона релиза
    'release-database',
  ].map((id) => ({ uid: uid(), card: cardById(id) }))

const TARGETS = [
  { id: 'tr', label: 'свежий релиз оппонента' },
  { id: 'th', label: 'рука оппонента' },
]
const RELEASE_SLOTS = ['frontend', 'backend', 'database']

const centerOf = (el) => {
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const nextFrames = () =>
  new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))

// хаотичный разброс карты в сбросе
const jitter = () => ({
  rot: (Math.random() * 2 - 1) * 14,
  dx: (Math.random() * 2 - 1) * 10,
  dy: (Math.random() * 2 - 1) * 8,
})

// Пара карт: основная сверху, вспомогательная под углом снизу (виден верхний край).
function ComboPair({ main, aux, width }) {
  return (
    <div className={styles.pair} style={width ? { width } : undefined}>
      {aux && (
        <div className={styles.aux} data-aux>
          <Card card={aux} interactive={false} width="100%" />
        </div>
      )}
      <div className={styles.mainCard} data-main>
        <Card card={main} interactive={false} width="100%" />
      </div>
    </div>
  )
}

export default function ComboStory() {
  const refs = useRef({})
  const slotRefs = useRef({})
  const centerRef = useRef(null)
  const discardRef = useRef(null)
  const flyRef = useRef(null)

  const [hand, setHand] = useState(makeHand)
  const [phase, setPhase] = useState('idle') // idle | partner | target
  const [source, setSource] = useState(null)
  const [partner, setPartner] = useState(null)
  const [from, setFrom] = useState(null)
  const [to, setTo] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [released, setReleased] = useState({})
  const [discardPile, setDiscardPile] = useState([]) // [{main, aux, rot, dx, dy}]
  const [flyPair, setFlyPair] = useState(null)
  const [log, setLog] = useState(null)

  const active = phase !== 'idle'
  const color =
    phase === 'target' && partner
      ? `var(--cat-${partner.card.category})`
      : source
      ? `var(--cat-${source.card.category})`
      : 'var(--brand-green)'

  const cancel = () => {
    setPhase('idle')
    setSource(null)
    setPartner(null)
  }

  useEffect(() => {
    if (!active) return
    const onMove = (e) => setTo({ x: e.clientX, y: e.clientY })
    const onDown = () => cancel()
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mousedown', onDown)
    }
  }, [active])

  const hideFlyer = () => {
    setFlyPair(null)
    if (flyRef.current) flyRef.current.style.opacity = '0'
  }

  // transform, помещающий карту из её места в руке в систему координат центра
  const enterTransform = (handRect, boxRect) => {
    const dx = handRect.left + handRect.width / 2 - (boxRect.left + boxRect.width / 2)
    const dy = handRect.top + handRect.height / 2 - (boxRect.top + boxRect.height / 2)
    const s = handRect.width / boxRect.width
    return `translate(${dx}px, ${dy}px) scale(${s})`
  }

  // оркестратор: карты слетаются со своих мест В ЦЕНТР и там совмещаются (видно всем),
  // затем пара летит к назначению (релиз — в зону, прочее — в сброс).
  const runPlay = async (src, prt, targetLabel) => {
    setPlaying(true)
    cancel()
    const mainHand = refs.current[prt.uid].getBoundingClientRect()
    const auxHand = refs.current[src.uid].getBoundingClientRect()
    const cRect = centerRef.current.getBoundingClientRect()

    setHand((h) => h.filter((it) => it.uid !== src.uid && it.uid !== prt.uid))

    // контейнер-пара в центре; карты — на свои места в руке (через transform)
    setFlyPair({ main: prt.card, aux: src.card })
    await nextFrames()
    const el = flyRef.current
    // ВАЖНО: гасим все анимации поддерева (контейнер + вложенные карты),
    // иначе остаточный fill:forwards перетирает новые transform → хаос.
    el.getAnimations?.({ subtree: true }).forEach((a) => a.cancel())
    el.style.left = `${cRect.left}px`
    el.style.top = `${cRect.top}px`
    el.style.width = `${cRect.width}px`
    el.style.transform = 'none'
    const mainEl = el.querySelector('[data-main]')
    const auxEl = el.querySelector('[data-aux]')
    const enterMain = enterTransform(mainHand, cRect)
    const enterAux = enterTransform(auxHand, cRect)
    mainEl.style.transform = enterMain
    auxEl.style.transform = enterAux
    el.style.opacity = '1'
    await nextFrames()

    // СОВМЕЩЕНИЕ В ЦЕНТРЕ — карты слетаются и складываются в пару
    const a1 = mainEl.animate(
      [{ transform: enterMain }, { transform: 'translate(0, 0) scale(1)' }],
      { duration: 620, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' },
    )
    const a2 = auxEl.animate(
      [{ transform: enterAux }, { transform: 'translateY(-26%) rotate(-7deg)' }],
      { duration: 620, easing: 'cubic-bezier(0.2, 0.9, 0.1, 1)', fill: 'forwards' },
    )
    await Promise.all([a1.finished, a2.finished])
    await wait(2100) // держим собранную пару в центре подольше — видно всем

    if (prt.card.category === 'release') {
      // из центра — в нужный слот зоны релиза игрока
      const key = prt.card.name.toLowerCase()
      const toRect = slotRefs.current[key].getBoundingClientRect()
      const anim = play('playToReleaseZone', el, { from: cRect, to: toRect })
      if (anim) await anim.finished
      setReleased((r) => ({ ...r, [key]: { card: prt.card, aux: src.card } }))
      await nextFrames() // дать финальной карте отрисоваться до скрытия флайера
      hideFlyer()
    } else {
      // из центра — в сброс (хаотичный разброс/угол), парой (Sudo остаётся снизу).
      // разброс считаем ДО полёта и летим сразу в эту позицию (без рывка в финале)
      const dRect = discardRef.current.getBoundingClientRect()
      const j = jitter()
      const anim = play('centerToDiscard', el, {
        from: cRect,
        to: dRect,
        rotate: j.rot,
        dx: j.dx,
        dy: j.dy,
      })
      if (anim) await anim.finished
      setDiscardPile((p) => [...p, { main: prt.card, aux: src.card, ...j }])
      await nextFrames()
      hideFlyer()
    }

    setLog(
      targetLabel
        ? `${src.card.name} + ${prt.card.name} ⟶ ${targetLabel}`
        : `${src.card.name} + ${prt.card.name}`,
    )
    setPlaying(false)
  }

  const onCardDown = (e, item) => {
    e.stopPropagation()
    if (playing) return

    if (phase === 'idle') {
      if (isComboSource(item.card)) {
        setSource(item)
        setFrom(centerOf(refs.current[item.uid]))
        setTo({ x: e.clientX, y: e.clientY })
        setPhase('partner')
      }
      return
    }

    if (phase === 'partner') {
      if (item.uid !== source.uid && validComboTarget(source.card, item.card)) {
        if (cardCanTarget(item.card)) {
          setPartner(item)
          setFrom(centerOf(refs.current[item.uid]))
          setTo({ x: e.clientX, y: e.clientY })
          setPhase('target')
        } else {
          runPlay(source, item)
        }
      } else {
        cancel()
      }
      return
    }

    cancel()
  }

  const onTargetDown = (e, t) => {
    e.stopPropagation()
    if (phase === 'target') runPlay(source, partner, t.label)
  }

  const reset = () => {
    cancel()
    setPlaying(false)
    setReleased({})
    setDiscardPile([])
    hideFlyer()
    setLog(null)
    setHand(makeHand())
  }

  return (
    <div className={styles.root}>
      <p className={styles.hint}>
        Клик по <b>Sudo</b> / <b>Code Review</b> → стрелка к партнёру. Атака даёт 2-ю стрелку
        цели. На розыгрыше вспомогательная карта тукается под основную под углом, затем пара
        летит: релиз — в зону релиза, прочее — в центр и в сброс.
      </p>
      <div className={styles.toolbar}>
        <button className={styles.reset} onClick={reset}>
          сброс
        </button>
        {log && <span className={styles.log}>сыграно: {log}</span>}
      </div>

      <div className={styles.targets}>
        {TARGETS.map((t) => {
          const lit = phase === 'target'
          return (
            <div
              key={t.id}
              className={`${styles.target} ${lit ? styles.lit : ''}`}
              style={lit ? { '--hl': color } : undefined}
              onMouseDown={(e) => onTargetDown(e, t)}
            >
              {t.label}
            </div>
          )
        })}
      </div>

      <div className={styles.centerSlot} ref={centerRef} aria-hidden="true" />

      <div className={styles.discard}>
        <div className={styles.discardSlot} ref={discardRef}>
          {discardPile.length === 0 && <span className={styles.empty}>сброс</span>}
          {discardPile.map((d, i) => (
            <div
              key={i}
              className={styles.discardCard}
              style={{
                transform: `translate(${d.dx}px, ${d.dy}px) rotate(${d.rot}deg)`,
                zIndex: i,
              }}
            >
              <ComboPair main={d.main} aux={d.aux} width="100%" />
            </div>
          ))}
        </div>
        <span className={styles.cap}>
          сброс{discardPile.length > 0 ? ` // ${discardPile.length * 2}` : ''}
        </span>
      </div>

      <div className={styles.bottom}>
        <div className={styles.releaseZone}>
          {RELEASE_SLOTS.map((key) => {
            const r = released[key]
            return (
              <div key={key} ref={(el) => (slotRefs.current[key] = el)} className={styles.slot}>
                {r ? (
                  <ComboPair main={r.card} aux={r.aux} width="100%" />
                ) : (
                  <span className={styles.empty}>{key}</span>
                )}
              </div>
            )
          })}
        </div>

        <div className={styles.hand}>
          {hand.map((item) => {
            const valid =
              phase === 'partner' &&
              item.uid !== source?.uid &&
              validComboTarget(source.card, item.card)
            const isPartner = phase === 'target' && partner?.uid === item.uid
            return (
              <div
                key={item.uid}
                ref={(el) => (refs.current[item.uid] = el)}
                className={`${styles.cell} ${valid ? styles.valid : ''} ${
                  isPartner ? styles.partner : ''
                }`}
                style={valid || isPartner ? { '--hl': color } : undefined}
                onMouseDown={(e) => onCardDown(e, item)}
              >
                <Card card={item.card} interactive={false} width="118px" />
              </div>
            )
          })}
        </div>
      </div>

      {active && <Arrow from={from} to={to} color={color} />}

      <div className={styles.flyer} ref={flyRef} aria-hidden="true">
        {flyPair && <ComboPair main={flyPair.main} aux={flyPair.aux} width="100%" />}
      </div>
    </div>
  )
}
