import { type CSSProperties, useMemo, useRef, useState } from 'react'
import { CARDS } from '@/cards'
import type { Card as CardType } from '@/cards/types'
import { nextHandUid } from '@/mocks/hand'
import Card, { CARD_RATIO } from '@/primitives/Card'
import Slider from '@/primitives/Slider'
import Hand from '@/table/Hand'
import { pick, useLang } from '../../Playground/lang'
import styles from './PickOpponentCardStory.module.css'
import { useHandInsert } from './useHandInsert'

// Prototype of "take a random card from the opponent's hand". Deal/reveal/return
// are local; the final "card settles into the hand" step is the shared useHandInsert hook.
const DEAL_CARD_W = 150 // card width in the layout
const CARD_H = DEAL_CARD_W * CARD_RATIO
const GAP_X = 22 // grid gaps
const GAP_Y = 26
const COLS_MAX = 6 // max columns in the grid
const REVEAL_HOLD = 820 // pause after the flip before the scatter, ms
const INITIAL_HAND = 5

// Hands (both player and opponent) hold only the base deck — green backs.
const BASE = CARDS.filter((c) => c.deck === 'base')

// the "origin" that cards slide out from and unpicked ones return to —
// the top-center of the deal area.
const ORIGIN = `translate(-50%, ${-CARD_H / 2 - 20}px) scale(0.35)`

type Phase = 'idle' | 'deal' | 'resolve'
interface PoolCard {
  uid: string
  card: CardType
}

function sampleBase(n: number): CardType[] {
  return [...BASE].sort(() => Math.random() - 0.5).slice(0, n)
}

// grid card centers relative to the area top-center (rows are centered)
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
  const { lang } = useLang()
  const [count, setCount] = useState(8)
  const [phase, setPhase] = useState<Phase>('idle')
  const [pool, setPool] = useState<PoolCard[]>([])
  const [chosen, setChosen] = useState<number | null>(null)
  const [dealt, setDealt] = useState(false)
  const [hand, setHand] = useState(() => makeHand(INITIAL_HAND))

  const slotRefs = useRef<(HTMLDivElement | null)[]>([])
  const handRef = useRef<HTMLDivElement>(null)

  const positions = useMemo(() => gridPositions(pool.length), [pool.length])

  // the final step is shared: the card settles into the hand, then we clear the deal
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

  // call: deal the backs from the origin into the grid
  function deal() {
    setPool(sampleBase(count).map((card) => ({ uid: nextHandUid(), card })))
    setChosen(null)
    setDealt(false)
    setPhase('deal')
    requestAnimationFrame(() => requestAnimationFrame(() => setDealt(true)))
  }

  // reset to initial: the hand as at start, the call button back in place
  function restart() {
    resetInsert()
    setPhase('idle')
    setChosen(null)
    setDealt(false)
    setPool([])
    setHand(makeHand(INITIAL_HAND))
  }

  // click a back: flip in place, then (after a pause) scatter + insert
  function pickCard(i: number) {
    if (phase !== 'deal' || chosen !== null) return
    setChosen(i)
    window.setTimeout(() => resolve(i), REVEAL_HOLD)
  }

  // the chosen one flies into the hand (shared hook) from its current slot; the rest — to the origin
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
      // the chosen one is driven by the hook (hide the slot); the rest return to the origin
      return i === chosen ? { opacity: 0 } : { transform: ORIGIN, opacity: 0 }
    }
    // the chosen one slides forward and flips in place; the rest wait
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
          <Slider
            label={pick(lang, { ru: 'карт на выбор', en: 'cards to pick' })}
            value={count}
            min={2}
            max={16}
            onChange={setCount}
          />
        </div>
        <button type="button" className={styles.btn} onClick={restart}>
          {pick(lang, { ru: 'рестарт', en: 'restart' })}
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
                onClick={phase === 'deal' && chosen === null ? () => pickCard(i) : undefined}
              />
            </div>
          ))}
        </div>
      )}

      {phase === 'idle' && (
        <div className={styles.controls}>
          <button type="button" className={styles.callBtn} onClick={deal}>
            {pick(lang, {
              ru: 'взять случайную карту соперника',
              en: 'take a random opponent card',
            })}
          </button>
        </div>
      )}

      {phase === 'deal' && chosen === null && (
        <div className={styles.hint}>{pick(lang, { ru: 'выбери карту', en: 'pick a card' })}</div>
      )}

      {overlay}

      <div className={styles.handWrap} ref={handRef}>
        <Hand items={hand} gapAt={gapAt} />
      </div>
    </div>
  )
}
