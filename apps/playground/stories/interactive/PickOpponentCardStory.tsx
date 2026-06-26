import { type CSSProperties, useMemo, useRef, useState } from 'react'
import { CARDS } from '@/cards'
import type { Card as CardType } from '@/cards/types'
import { nextHandUid } from '@/mocks/hand'
import Card from '@/primitives/Card'
import Slider from '@/primitives/Slider'
import Hand from '@/table/Hand'
import styles from './PickOpponentCardStory.module.css'
import { useHandInsert } from './useHandInsert'

// Прототип «взятие случайной карты из руки соперника». Раздача/вскрытие/возврат —
// свои; финальный шаг «карта встаёт в руку» — общий хук useHandInsert.
const DEAL_CARD_W = 150 // ширина карты в раскладке
const CARD_RATIO = 1.4 // высота/ширина карты (≈ 515/368)
const CARD_H = DEAL_CARD_W * CARD_RATIO
const GAP_X = 22 // зазоры грида
const GAP_Y = 26
const COLS_MAX = 6 // макс колонок в гриде
const REVEAL_HOLD = 820 // пауза после переворота перед разлётом, мс
const INITIAL_HAND = 5

// В руках (и у игрока, и у соперника) только базовая колода — зелёные обложки.
const BASE = CARDS.filter((c) => c.deck === 'base')

// «точка», из которой карты выезжают и куда невыбранные возвращаются —
// верх-центр области раздачи.
const ORIGIN = `translate(-50%, ${-CARD_H / 2 - 20}px) scale(0.35)`

type Phase = 'idle' | 'deal' | 'resolve'
interface PoolCard {
  uid: string
  card: CardType
}

function sampleBase(n: number): CardType[] {
  return [...BASE].sort(() => Math.random() - 0.5).slice(0, n)
}

// центры карт грида относительно верх-центра области (ряды центрируются)
function gridPositions(n: number): { x: number; y: number }[] {
  if (n === 0) return []
  const cols = Math.min(n, COLS_MAX)
  return Array.from({ length: n }, (_, i) => {
    const row = Math.floor(i / cols)
    const inRow = Math.min(cols, n - row * cols)
    const col = i % cols
    const rowW = inRow * DEAL_CARD_W + (inRow - 1) * GAP_X
    const x = -rowW / 2 + col * (DEAL_CARD_W + GAP_X) + DEAL_CARD_W / 2
    const y = row * (CARD_H + GAP_Y) + CARD_H / 2
    return { x, y }
  })
}

function makeHand(n: number) {
  return BASE.slice(0, n).map((card) => ({ uid: nextHandUid(), card }))
}

export default function PickOpponentCardStory() {
  const [count, setCount] = useState(8)
  const [phase, setPhase] = useState<Phase>('idle')
  const [pool, setPool] = useState<PoolCard[]>([])
  const [chosen, setChosen] = useState<number | null>(null)
  const [dealt, setDealt] = useState(false)
  const [hand, setHand] = useState(() => makeHand(INITIAL_HAND))

  const slotRefs = useRef<(HTMLDivElement | null)[]>([])
  const handRef = useRef<HTMLDivElement>(null)

  const positions = useMemo(() => gridPositions(pool.length), [pool.length])

  // финальный шаг — общий: карта встаёт в руку, потом сбрасываем раздачу
  const {
    gapAt,
    overlay,
    insert,
    reset: resetInsert,
  } = useHandInsert(handRef, (card, gap) => {
    setHand((h) => {
      const copy = [...h]
      copy.splice(gap, 0, { uid: nextHandUid(), card })
      return copy
    })
    setPhase('idle')
    setChosen(null)
    setDealt(false)
    setPool([])
  })

  // вызов: раздать обложки из точки в грид
  function deal() {
    setPool(sampleBase(count).map((card) => ({ uid: nextHandUid(), card })))
    setChosen(null)
    setDealt(false)
    setPhase('deal')
    requestAnimationFrame(() => requestAnimationFrame(() => setDealt(true)))
  }

  // сброс к исходному: рука как в начале, кнопка вызова снова на месте
  function restart() {
    resetInsert()
    setPhase('idle')
    setChosen(null)
    setDealt(false)
    setPool([])
    setHand(makeHand(INITIAL_HAND))
  }

  // клик по обложке: переворот на месте, затем (после паузы) разлёт + вставка
  function pick(i: number) {
    if (phase !== 'deal' || chosen !== null) return
    setChosen(i)
    window.setTimeout(() => resolve(i), REVEAL_HOLD)
  }

  // выбранная летит в руку (общий хук) из её текущего слота; остальные — в точку
  function resolve(i: number) {
    const el = slotRefs.current[i]
    if (el) {
      const r = el.getBoundingClientRect()
      insert(
        pool[i].card,
        { left: r.left, top: r.top, width: r.width, height: r.height },
        hand.length,
      )
    }
    setPhase('resolve')
  }

  function slotStyle(i: number): CSSProperties {
    if (!dealt) return { transform: ORIGIN, opacity: 0 }
    const pos = positions[i]
    const grid = `translate(calc(-50% + ${pos.x}px), ${pos.y - CARD_H / 2}px)`
    if (phase === 'resolve') {
      // выбранную ведёт хук (прячем слот); остальные возвращаются в точку
      return i === chosen ? { opacity: 0 } : { transform: ORIGIN, opacity: 0 }
    }
    // выбранная выезжает вперёд и переворачивается на месте; остальные ждут
    if (chosen === i) return { transform: `${grid} scale(1.12)`, opacity: 1, zIndex: 40 }
    return {
      transform: grid,
      opacity: 1,
      transitionDelay: chosen === null ? `${i * 45}ms` : '0ms',
    }
  }

  return (
    <div className={styles.root}>
      <div className={styles.bar}>
        <div className={styles.sliderWrap}>
          <Slider label="карт на выбор" value={count} min={2} max={16} onChange={setCount} />
        </div>
        <button type="button" className={styles.btn} onClick={restart}>
          рестарт
        </button>
      </div>

      {phase !== 'idle' && (
        <div className={styles.deal}>
          {pool.map((p, i) => (
            <div
              key={p.uid}
              ref={(el) => {
                slotRefs.current[i] = el
              }}
              className={styles.slot}
              style={slotStyle(i)}
            >
              <Card
                card={p.card}
                faceDown={chosen !== i}
                width={`${DEAL_CARD_W}px`}
                onClick={phase === 'deal' && chosen === null ? () => pick(i) : undefined}
              />
            </div>
          ))}
        </div>
      )}

      {phase === 'idle' && (
        <div className={styles.controls}>
          <button type="button" className={styles.callBtn} onClick={deal}>
            взять случайную карту соперника
          </button>
        </div>
      )}

      {phase === 'deal' && chosen === null && <div className={styles.hint}>выбери карту</div>}

      {overlay}

      <div className={styles.handWrap} ref={handRef}>
        <Hand items={hand} gapAt={gapAt} />
      </div>
    </div>
  )
}
