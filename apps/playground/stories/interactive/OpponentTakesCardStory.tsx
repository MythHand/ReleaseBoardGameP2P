import enCommon from '@release/translation/locales/en/common.json'
import ruCommon from '@release/translation/locales/ru/common.json'
import type React from 'react'
import { type CSSProperties, useRef, useState } from 'react'
import { CARDS } from '@/cards'
import type { Card as CardType } from '@/cards/types'
import { nextHandUid } from '@/mocks/hand'
import Card, { cardBoxIn } from '@/primitives/Card'
import ConfirmAction from '@/table/ConfirmAction'
import Hand from '@/table/Hand'
import type { ReleaseSlots } from '@/table/ReleaseZone/ReleaseZone'
import Seat from '@/table/Seat'
import { pick, useLang } from '../../Playground/lang'
import styles from './OpponentTakesCardStory.module.css'
import { reorderHand } from './reorderHand'

// Mirror of "take a specific card" — the VICTIM's view: the opponent takes a
// chosen card from YOUR hand. Nodes shown:
//  idle:   a start button in the centre;
//  choose: the opponent's catalog grid appears (broadcast); you (standing in for
//          the remote picker) hover to "consider" a card and click to confirm;
//  picked: the chosen card holds, the rest leave the grid;
//  check:  against YOUR hand (bottom) — hit: that card lifts out, flies to the
//          centre, flips face-down (now theirs) and sinks into the taker's seat,
//          whose counter goes up; miss: "you don't have that card", nothing leaves.
//
// The opponents are SEATS, as on the table — their hands are hidden there, and a
// card going to a hidden hand is the `dealToSeat` movement: it shrinks into the
// seat's card box and fades out (see Draw card, where the same thing happens).
const REVEAL_W = 220 // width the leaving card reaches in the centre
const SEAT_SHRINK = 0.7 // how small the card gets in the seat (as in Draw card)
const INITIAL_HAND = 6 // your hand (the source)
const PICK_BEAT = 620 // chosen holds / others leave, before the hand check
const CENTER_HOLD = 820 // pause in the centre before it flies up to the opponent
const MISS_HOLD = 1620 // note duration before the grid clears (miss case)
const GRID_W = 100 // card width in the choose-grid

const BASE = CARDS.filter((c) => c.deck === 'base')
const BASE_TYPES = CARDS.filter((c) => c.deck === 'base' && c.category !== 'trigger')

const EMPTY_RELEASE: ReleaseSlots = { frontend: undefined, backend: undefined, database: undefined }
// the opponents' row, as on the table; the first of them is the one taking
const OPPONENTS = [
  { id: 'p2', name: 'kernel_panic', handCount: 5 },
  { id: 'p3', name: 'segfault', handCount: 7 },
]
const TAKER = OPPONENTS[0].id

type Phase = 'idle' | 'choose' | 'picked' | 'take' | 'miss'
type Stage = 'from' | 'center' | 'up'
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
  const [hand, setHand] = useState(() => makeHand(INITIAL_HAND))
  const [taken, setTaken] = useState(0) // cards the taker has gained in this run
  const [take, setTake] = useState<Take | null>(null)
  const [stage, setStage] = useState<Stage>('from')
  const [flipped, setFlipped] = useState(false)

  const rootRef = useRef<HTMLDivElement>(null)
  const handRef = useRef<HTMLDivElement>(null) // wraps the player Hand — slots are inner children
  const seatRefs = useRef<Record<string, HTMLDivElement | null>>({}) // the take lands in a seat
  const timers = useRef<number[]>([])

  const clearTimers = () => {
    for (const t of timers.current) window.clearTimeout(t)
    timers.current = []
  }
  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms))

  function backToIdle() {
    setPhase('idle')
    setWanted(null)
    setTake(null)
    setStage('from')
    setFlipped(false)
  }

  function restart() {
    clearTimers()
    setHand(makeHand(INITIAL_HAND))
    setTaken(0)
    backToIdle()
  }

  // start: the opponent broadcasts their catalog of choices
  function start() {
    setWanted(null)
    setTake(null)
    setPhase('choose')
  }

  // the opponent selects a card — naming a card is irreversible, so the choice is
  // only armed here and committed from the confirm bar
  function pickWanted(card: CardType) {
    if (phase !== 'choose') return
    setWanted(card)
  }

  // confirmed — the named card holds, the rest leave, then we check your hand
  function confirmWanted() {
    if (phase !== 'choose' || !wanted) return
    setPhase('picked')
    later(() => resolve(wanted), PICK_BEAT)
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
    // sink into the taker's SEAT — their hand is hidden there. Aim at a card-sized
    // box inside the seat, not at the seat itself (its rect is far wider than a
    // card and the card would inflate to it); the card shrinks into it and fades,
    // which is the `dealToSeat` movement the other scenes use.
    const seat = seatRefs.current[TAKER]?.getBoundingClientRect()
    const box = seat ? cardBoxIn(seat, r.width * SEAT_SHRINK) : null
    const sU = box ? box.width / r.width : 1
    const ux = box ? box.left + box.width / 2 : cx
    const uy = box ? box.top + box.height / 2 : r.top - r.width
    const dxU = ux - (r.left + r.width / 2)
    const dyU = uy - (r.top + r.height / 2)
    setHand((h) => h.filter((_, i) => i !== index)) // your hand closes the gap
    setTake({
      card,
      from: { left: r.left, top: r.top, width: r.width },
      center: `translate(${dxC}px, ${dyC}px) scale(${sC}) rotate(0deg)`,
      up: `translate(${dxU}px, ${dyU}px) scale(${sU}) rotate(0deg)`,
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
      // the card is inside the seat now: it is gone from the table and the taker's
      // counter carries it — that counter IS the hidden hand
      setTaken((n) => n + 1)
      setTake(null)
      later(backToIdle, 620)
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

      {/* opponents — top-centre, as on the table. Their hands are hidden in the
          seats: the taker's counter is where the taken card ends up. */}
      <div className={styles.opponents}>
        {OPPONENTS.map((o) => (
          <div
            key={o.id}
            ref={(el) => {
              seatRefs.current[o.id] = el
            }}
          >
            <Seat
              player={{
                id: o.id,
                name: o.name,
                handCount: o.handCount + (o.id === TAKER ? taken : 0),
                release: EMPTY_RELEASE,
              }}
              active={o.id === TAKER && phase !== 'idle'}
              copy={pick(lang, { ru: ruCommon.seat, en: enCommon.seat })}
            />
          </div>
        ))}
      </div>

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
          {BASE_TYPES.map((c, i) => (
            <button
              key={c.id}
              type="button"
              className={cellClass(c.id)}
              style={{ animationDelay: `${i * 18}ms` }}
              onClick={phase === 'choose' ? () => pickWanted(c) : undefined}
            >
              <Card
                card={c}
                interactive={false}
                width={GRID_W}
                state={phase === 'choose' && wanted?.id === c.id ? 'selected' : 'idle'}
                // pick one out of a set — uniform selection colour, not the
                // per-category accent
                accent="var(--select-accent)"
              />
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
              zIndex: 55,
              // it dissolves as it reaches the seat — the hand there is hidden,
              // so the card stops being a card the moment it arrives
              opacity: stage === 'up' ? 0 : 1,
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

      {/* once the choice is confirmed the scene plays itself out — the fan goes
          inert for the whole sequence, so moving the cursor off the confirm bar
          doesn't lift a card and raise its zoom preview into the play. Same guard
          the other scenes use while they resolve (Combo, AI cards, Cherry-pick). */}
      <div
        className={styles.handWrap}
        ref={handRef}
        style={{ pointerEvents: phase === 'idle' || phase === 'choose' ? undefined : 'none' }}
      >
        <Hand items={hand} onReorder={(uid, to) => setHand((h) => reorderHand(h, uid, to))} />
      </div>

      {/* naming a card is irreversible — confirm it (the shared slide-up bar) */}
      <ConfirmAction
        open={phase === 'choose'}
        label={pick(lang, { ru: 'подтвердить', en: 'confirm' })}
        caption={pick(lang, { ru: 'соперник выбирает карту', en: 'the opponent is choosing' })}
        disabled={wanted == null}
        onConfirm={confirmWanted}
      />
    </div>
  )
}
