import { useRef, useState } from 'react'
import { CARDS } from '@/cards'
import { nextHandUid } from '@/mocks/hand'
import Card from '@/primitives/Card'
import Hand from '@/table/Hand'
import styles from './CardToHandStory.module.css'
import { useHandInsert } from './useHandInsert'

// Витрина универсального шага «карта встаёт в руку» (useHandInsert).
// Источник — кликнутая карта превью; всё остальное делает общий хук.
const SOURCE_CARD_W = 140
const INITIAL_HAND = 5

const BASE = CARDS.filter((c) => c.deck === 'base')
const SOURCES = BASE.slice(5, 10) // 5 разных карт превью (отличаются от стартовой руки)

function makeHand(n: number) {
  return BASE.slice(0, n).map((card) => ({ uid: nextHandUid(), card }))
}

export default function CardToHandStory() {
  const [hand, setHand] = useState(() => makeHand(INITIAL_HAND))
  const [used, setUsed] = useState<boolean[]>(() => SOURCES.map(() => false))

  const sourceRefs = useRef<(HTMLDivElement | null)[]>([])
  const handRef = useRef<HTMLDivElement>(null)

  const { gapAt, overlay, insert, reset, flyingCard } = useHandInsert(handRef, (card, gap) => {
    setHand((h) => {
      const copy = [...h]
      copy.splice(gap, 0, { uid: nextHandUid(), card })
      return copy
    })
    setUsed((u) => u.map((v, i) => (SOURCES[i] === card ? true : v)))
  })

  function click(i: number) {
    if (flyingCard || used[i]) return
    const el = sourceRefs.current[i]
    if (!el) return
    const r = el.getBoundingClientRect()
    insert(SOURCES[i], { left: r.left, top: r.top, width: r.width, height: r.height }, hand.length)
  }

  function restart() {
    reset()
    setHand(makeHand(INITIAL_HAND))
    setUsed(SOURCES.map(() => false))
  }

  return (
    <div className={styles.root}>
      <div className={styles.bar}>
        <button type="button" className={styles.btn} onClick={restart}>
          рестарт
        </button>
      </div>

      {/* превью: карты закреплены на местах; израсходованная гаснет, слот держит место */}
      <div className={styles.source}>
        {SOURCES.map((card, i) => {
          const hidden = used[i] || flyingCard === card
          return (
            <div
              key={card.id}
              ref={(el) => {
                sourceRefs.current[i] = el
              }}
              className={styles.sourceCard}
              style={{ opacity: hidden ? 0 : 1 }}
            >
              <Card
                card={card}
                width={`${SOURCE_CARD_W}px`}
                onClick={flyingCard || used[i] ? undefined : () => click(i)}
              />
            </div>
          )
        })}
      </div>

      {overlay}

      <div className={styles.handWrap} ref={handRef}>
        <Hand items={hand} gapAt={gapAt} />
      </div>
    </div>
  )
}
