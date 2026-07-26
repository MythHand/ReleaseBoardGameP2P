import type React from 'react'
import { type CSSProperties, useRef, useState } from 'react'
import { CARDS } from '@/cards'
import type { Card as CardType } from '@/cards/types'
import { nextHandUid } from '@/mocks/hand'
import Card from '@/primitives/Card'
import Hand from '@/table/Hand'
import { pick, useLang } from '../../Playground/lang'
import styles from './OpponentTakesCardStory.module.css'

// Mirror of "take a specific card" — the VICTIM's view: the opponent takes a
// chosen card from YOUR hand. Nodes shown:
//  idle:   a start button in the centre;
//  choose: the opponent's catalog grid appears (broadcast) + their fan slides in
//          on top; you (standing in for the remote picker) hover to "consider"
//          a card and click to confirm;
//  picked: the chosen card holds, the rest leave the grid;
//  check:  against YOUR hand (bottom) — hit: that card lifts out, flies to the
//          centre, flips face-down (now theirs) and tucks up behind the opponent
//          fan; miss: "you don't have that card", nothing leaves.
const REVEAL_W = 220 // width the leaving card reaches in the centre
const OPP_HAND = 6 // opponent fan size (context — the taker)
const INITIAL_HAND = 6 // your hand (the source)
const PICK_BEAT = 620 // chosen holds / others leave, before the hand check
const CENTER_HOLD = 820 // pause in the centre before it flies up to the opponent
const MISS_HOLD = 1620 // note duration before the grid clears (miss case)
const GRID_W = 100 // card width in the choose-grid

const BASE = CARDS.filter((c) => c.deck === 'base')
const BASE_TYPES = CARDS.filter((c) => c.deck === 'base' && c.category !== 'trigger')

type Phase = 'idle' | 'choose' | 'picked' | 'take' | 'miss'
type Stage = 'from' | 'center' | 'up'
interface PoolCard {
  uid: string
  card: CardType
}
interface Take {
  card: CardType
  from: { left: number; top: number; width: number }
  center: string
  up: string
}

function sampleBase(n: number): CardType[] {
  return [...BASE].sort(() => Math.random() - 0.5).slice(0, n)
}

function makeHand(n: number) {
  return sampleBase(n).map((card) => ({ uid: nextHandUid(), card }))
}

export default function OpponentTakesCardStory() {
  const { lang } = useLang()
  const [phase, setPhase] = useState<Phase>('idle')
  const [wanted, setWanted] = useState<CardType | null>(null)
  const [oppHand, setOppHand] = useState<PoolCard[]>([])
  const [handIn, setHandIn] = useState(false)
  const [hand, setHand] = useState(() => makeHand(INITIAL_HAND))
  const [take, setTake] = useState<Take | null>(null)
  const [stage, setStage] = useState<Stage>('from')
  const [flipped, setFlipped] = useState(false)

  const rootRef = useRef<HTMLDivElement>(null)
  const handRef = useRef<HTMLDivElement>(null) // wraps the player Hand — slots are inner children
  const fanRef = useRef<HTMLDivElement>(null) // wraps the opponent fan — the take lands here
  const timers = useRef<number[]>([])

  const clearTimers = () => {
    for (const t of timers.current) window.clearTimeout(t)
    timers.current = []
  }
  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms))

  function backToIdle() {
    setPhase('idle')
    setWanted(null)
    setOppHand([])
    setHandIn(false)
    setTake(null)
    setStage('from')
    setFlipped(false)
  }

  function restart() {
    clearTimers()
    setHand(makeHand(INITIAL_HAND))
    backToIdle()
  }

  // start: the opponent's catalog grid and their fan appear together
  function start() {
    setOppHand(sampleBase(OPP_HAND).map((card) => ({ uid: nextHandUid(), card })))
    setWanted(null)
    setTake(null)
    setPhase('choose')
    setHandIn(false)
    requestAnimationFrame(() => requestAnimationFrame(() => setHandIn(true)))
  }

  // the opponent picks a card — it holds, the rest leave, then we check your hand
  function pickWanted(card: CardType) {
    if (phase !== 'choose') return
    setWanted(card)
    setPhase('picked')
    later(() => resolve(card), PICK_BEAT)
  }

  // check YOUR hand: hit lifts the card out and up; miss shows a note
  function resolve(card: CardType) {
    const index = hand.findIndex((h) => h.card.id === card.id)
    if (index < 0) {
      setPhase('miss')
      later(backToIdle, MISS_HOLD)
      return
    }
    const slot = handRef.current?.firstElementChild?.children[index] as HTMLElement | undefined
    if (!slot) return backToIdle()
    const r = slot.getBoundingClientRect()
    const stageEl = rootRef.current?.getBoundingClientRect()
    const cx = stageEl ? stageEl.left + stageEl.width / 2 : window.innerWidth / 2
    const cy = stageEl ? stageEl.top + stageEl.height / 2 : window.innerHeight / 2
    const sC = REVEAL_W / r.width
    const dxC = cx - (r.left + r.width / 2)
    const dyC = cy - (r.top + r.height / 2)
    // land in the opponent's fan (mirrors "into your hand"): aim at its centre and
    // match its 180° orientation, so the taken card tucks in as their new card
    const fan = fanRef.current?.getBoundingClientRect()
    const fx = fan ? fan.left + fan.width / 2 : cx
    const fy = fan ? fan.top + fan.height / 2 : r.top - r.width
    const dxU = fx - (r.left + r.width / 2)
    const dyU = fy - (r.top + r.height / 2)
    setHand((h) => h.filter((_, i) => i !== index)) // your hand closes the gap
    setTake({
      card,
      from: { left: r.left, top: r.top, width: r.width },
      center: `translate(${dxC}px, ${dyC}px) scale(${sC}) rotate(0deg)`,
      up: `translate(${dxU}px, ${dyU}px) scale(1) rotate(180deg)`,
    })
    setStage('from')
    setFlipped(false)
    setPhase('take')
    requestAnimationFrame(() => requestAnimationFrame(() => setStage('center')))
  }

  function onTakeEnd(e: React.TransitionEvent) {
    if (e.propertyName !== 'transform') return
    if (stage === 'center' && !flipped) {
      // reached the centre → flip face-down (now the opponent's hidden card), then up
      setFlipped(true)
      later(() => setStage('up'), CENTER_HOLD)
    } else if (stage === 'up') {
      // the taken card joins the opponent's fan, then (after a beat) the fan leaves
      if (take) setOppHand((h) => [...h, { uid: nextHandUid(), card: take.card }])
      setTake(null)
      later(() => setHandIn(false), 640)
      later(backToIdle, 1200)
    }
  }

  const cellClass = (id: string) => {
    if (phase === 'choose') return styles.cell
    if (phase === 'picked' && id === wanted?.id) return `${styles.cell} ${styles.chosen}`
    return `${styles.cell} ${styles.leaving}`
  }

  return (
    <div className={styles.root} ref={rootRef}>
      <div className={styles.bar}>
        <button type="button" className={styles.btn} onClick={restart}>
          {pick(lang, { ru: 'рестарт', en: 'restart' })}
        </button>
      </div>

      {/* opponent fan (the taker) — face-down, rotated 180°, up top */}
      {phase !== 'idle' && (
        <div className={styles.topHand} data-in={handIn}>
          <div className={styles.topHandInner} ref={fanRef}>
            <Hand
              items={oppHand}
              faceDown
              renderFace={(item, ctx) => (
                <Card
                  card={item.card}
                  faceDown={ctx.faceDown}
                  interactive={false}
                  tilt={ctx.tilt}
                  width={ctx.width}
                />
              )}
            />
          </div>
        </div>
      )}

      {phase === 'miss' && (
        <div className={styles.miss}>
          {pick(lang, { ru: 'у тебя нет такой карты', en: "you don't have that card" })}
        </div>
      )}

      {/* idle: the start button in the centre */}
      {phase === 'idle' && (
        <div className={styles.controls}>
          <button type="button" className={styles.callBtn} onClick={start}>
            {pick(lang, { ru: 'у тебя забирают карту', en: 'an opponent takes your card' })}
          </button>
        </div>
      )}

      {/* the opponent's broadcast catalog (choose which of your cards to take) */}
      {phase !== 'idle' && (
        <div className={styles.grid}>
          {phase === 'choose' && (
            <div className={styles.hint}>
              {pick(lang, { ru: 'соперник выбирает карту', en: 'the opponent is choosing' })}
            </div>
          )}
          {BASE_TYPES.map((c, i) => (
            <button
              key={c.id}
              type="button"
              className={cellClass(c.id)}
              style={{ animationDelay: `${i * 18}ms` }}
              onClick={phase === 'choose' ? () => pickWanted(c) : undefined}
            >
              <Card card={c} interactive={false} width={GRID_W} />
            </button>
          ))}
        </div>
      )}

      {take && (
        <div
          className={styles.take}
          style={
            {
              left: take.from.left,
              top: take.from.top,
              width: take.from.width,
              zIndex: stage === 'up' ? 30 : 55, // tuck behind the opponent fan on the way up
              transform:
                stage === 'from'
                  ? 'translate(0px, 0px) scale(1) rotate(0deg)'
                  : stage === 'center'
                    ? take.center
                    : take.up,
            } as CSSProperties
          }
          onTransitionEnd={onTakeEnd}
        >
          <Card card={take.card} faceDown={flipped} width={take.from.width} interactive={false} />
        </div>
      )}

      <div className={styles.handWrap} ref={handRef}>
        <Hand items={hand} />
      </div>
    </div>
  )
}
