import type React from 'react'
import { type CSSProperties, useRef, useState } from 'react'
import { CARDS } from '@/cards'
import type { Card as CardType } from '@/cards/types'
import { nextHandUid } from '@/mocks/hand'
import Card from '@/primitives/Card'
import Hand from '@/table/Hand'
import { pick, useLang } from '../../Playground/lang'
import styles from './PickSpecificCardStory.module.css'
import { useHandInsert } from './useHandInsert'

// "Take a SPECIFIC card from the opponent's hand" — every logical node is shown:
//  idle:    a start button in the centre;
//  choose:  the catalog grid (base cards, no triggers, face-up) appears in the
//           centre AND the opponent's face-down fan slides in from the top;
//  picked:  the chosen card holds (enlarged), the rest leave the grid;
//  check:   against the opponent's fan — a toggle forces the outcome:
//           hit  → that card flies out of the fan → centre → flips → your hand;
//           miss → the fan shakes with a "not in hand" note and leaves.
const REVEAL_HOLD = 820 // pause in the centre after the flip, before the drop
const REVEAL_W = 220 // width the flown card reaches in the centre
const OPP_HAND = 6 // opponent hand size
const PICK_BEAT = 620 // chosen holds / others leave, before the opponent check
const MISS_HOLD = 1620 // shake + note duration before the fan leaves (miss case)
const GRID_W = 100 // card width in the choose-grid
const INITIAL_HAND = 5 // the player already holds a hand

// Both hands hold only the base deck (green backs); the catalog excludes triggers.
const BASE = CARDS.filter((c) => c.deck === 'base')
const BASE_TYPES = CARDS.filter((c) => c.deck === 'base' && c.category !== 'trigger')

type Phase = 'idle' | 'choose' | 'picked' | 'reveal' | 'miss'
interface PoolCard {
  uid: string
  card: CardType
}
interface Reveal {
  card: CardType
  from: { left: number; top: number; width: number; height: number }
  to: string
}

function sampleBase(n: number, excludeId?: string): CardType[] {
  return [...BASE]
    .filter((c) => c.id !== excludeId)
    .sort(() => Math.random() - 0.5)
    .slice(0, n)
}

// the player's own starting hand
function makeHand(n: number) {
  return BASE.slice(0, n).map((card) => ({ uid: nextHandUid(), card }))
}

export default function PickSpecificCardStory() {
  const { lang } = useLang()
  const [inHand, setInHand] = useState(true) // toggle: is the wanted card in the opponent hand
  const [phase, setPhase] = useState<Phase>('idle')
  const [wanted, setWanted] = useState<CardType | null>(null)
  const [oppHand, setOppHand] = useState<PoolCard[]>([])
  const [handIn, setHandIn] = useState(false)
  const [chosenUid, setChosenUid] = useState<string | null>(null) // the flying card in the fan
  const [reveal, setReveal] = useState<Reveal | null>(null)
  const [centered, setCentered] = useState(false)
  const [flipped, setFlipped] = useState(false)
  const [hand, setHand] = useState(() => makeHand(INITIAL_HAND))

  const rootRef = useRef<HTMLDivElement>(null) // the story stage — centre is relative to it
  const handRef = useRef<HTMLDivElement>(null)
  const fanRef = useRef<HTMLDivElement>(null) // wraps <Hand> — slots are its inner children
  const revealRef = useRef<HTMLDivElement>(null)
  const timers = useRef<number[]>([])

  const clearTimers = () => {
    for (const t of timers.current) window.clearTimeout(t)
    timers.current = []
  }
  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms))

  // final step is shared: the card settles into the hand, then back to the start
  const { gapAt, overlay, insert, reset: resetInsert } = useHandInsert(handRef, (card, gap) => {
    setHand((h) => {
      const copy = [...h]
      copy.splice(gap, 0, { uid: nextHandUid(), card })
      return copy
    })
    backToIdle()
  })

  function backToIdle() {
    setPhase('idle')
    setWanted(null)
    setOppHand([])
    setHandIn(false)
    setChosenUid(null)
    setReveal(null)
    setCentered(false)
    setFlipped(false)
  }

  function restart() {
    clearTimers()
    resetInsert()
    setHand(makeHand(INITIAL_HAND))
    backToIdle()
  }

  // start: the catalog grid and the opponent's fan appear together
  function start() {
    setOppHand(sampleBase(OPP_HAND).map((card) => ({ uid: nextHandUid(), card })))
    setWanted(null)
    setChosenUid(null)
    setReveal(null)
    setPhase('choose')
    setHandIn(false)
    requestAnimationFrame(() => requestAnimationFrame(() => setHandIn(true)))
  }

  // pick which card you want — it holds, the rest leave the grid, then we check
  function pickWanted(card: CardType) {
    if (phase !== 'choose') return
    setWanted(card)
    setPhase('picked')
    later(() => resolve(card), PICK_BEAT)
  }

  // check against the opponent's fan: hit flies out, miss shakes
  function resolve(card: CardType) {
    if (!inHand) {
      setPhase('miss')
      later(() => setHandIn(false), MISS_HOLD)
      later(backToIdle, MISS_HOLD + 560)
      return
    }
    // plant the wanted card into a random opponent slot (backs hide the swap);
    // read the slot rect before hiding its face
    const j = Math.floor(Math.random() * oppHand.length)
    const slot = fanRef.current?.firstElementChild?.children[j] as HTMLElement | undefined
    if (!slot) return backToIdle()
    const r = slot.getBoundingClientRect()
    // centre relative to the story stage (not the window — the playground has a sidebar)
    const stage = rootRef.current?.getBoundingClientRect()
    const cx = stage ? stage.left + stage.width / 2 : window.innerWidth / 2
    const cy = stage ? stage.top + stage.height / 2 : window.innerHeight / 2
    const dx = cx - (r.left + r.width / 2)
    const dy = cy - (r.top + r.height / 2)
    const opp = oppHand.map((p, idx) => (idx === j ? { ...p, card } : p))
    setOppHand(opp)
    setChosenUid(opp[j].uid)
    setPhase('reveal')
    setHandIn(false) // the rest of the fan slides up and off
    setReveal({
      card,
      from: { left: r.left, top: r.top, width: r.width, height: r.height },
      to: `translate(${dx}px, ${dy}px) scale(${REVEAL_W / r.width}) rotate(0deg)`,
    })
    setCentered(false)
    setFlipped(false)
    requestAnimationFrame(() => requestAnimationFrame(() => setCentered(true)))
  }

  // reached the centre → flip face-up, hold, then drop into the hand
  function onRevealEnd(e: React.TransitionEvent) {
    if (e.propertyName !== 'transform' || !centered || flipped) return
    setFlipped(true)
    later(fall, REVEAL_HOLD)
  }

  function fall() {
    const el = revealRef.current
    if (el && reveal) {
      const r = el.getBoundingClientRect()
      insert(reveal.card, { left: r.left, top: r.top, width: r.width, height: r.height }, hand.length)
    }
    setReveal(null)
  }

  const cellClass = (id: string) => {
    if (phase === 'choose') return styles.cell
    if (phase === 'picked' && id === wanted?.id) return `${styles.cell} ${styles.chosen}`
    return `${styles.cell} ${styles.leaving}`
  }

  return (
    <div className={styles.root} ref={rootRef}>
      <div className={styles.bar}>
        <label className={styles.toggle}>
          <input type="checkbox" checked={inHand} onChange={(e) => setInHand(e.target.checked)} />
          {pick(lang, { ru: 'карта есть в руке соперника', en: 'card is in the opponent hand' })}
        </label>
        <button type="button" className={styles.btn} onClick={restart}>
          {pick(lang, { ru: 'рестарт', en: 'restart' })}
        </button>
      </div>

      {/* opponent fan (across the table) — face-down, rotated 180° */}
      {phase !== 'idle' && (
        <div className={`${styles.topHand} ${phase === 'miss' ? styles.shake : ''}`} data-in={handIn}>
          <div className={styles.topHandInner} ref={fanRef}>
            <Hand
              items={oppHand}
              faceDown
              renderFace={(item, ctx) =>
                item.uid === chosenUid ? null : (
                  <Card
                    card={item.card}
                    faceDown={ctx.faceDown}
                    interactive={false}
                    tilt={ctx.tilt}
                    width={ctx.width}
                  />
                )
              }
            />
          </div>
        </div>
      )}

      {phase === 'miss' && (
        <div className={styles.miss}>{pick(lang, { ru: 'нет такой карты', en: 'not in hand' })}</div>
      )}

      {/* idle: the start button in the centre */}
      {phase === 'idle' && (
        <div className={styles.controls}>
          <button type="button" className={styles.callBtn} onClick={start}>
            {pick(lang, { ru: 'забрать карту соперника', en: 'take an opponent card' })}
          </button>
        </div>
      )}

      {/* step 1: choose which card you want (catalog grid, not a fan) */}
      {phase !== 'idle' && (
        <div className={styles.grid}>
          {phase === 'choose' && (
            <div className={styles.hint}>
              {pick(lang, { ru: 'выбери карту, которую хочешь забрать', en: 'choose the card to take' })}
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

      {reveal && (
        <div
          ref={revealRef}
          className={styles.reveal}
          style={
            {
              left: reveal.from.left,
              top: reveal.from.top,
              width: reveal.from.width,
              transform: centered ? reveal.to : 'translate(0px, 0px) scale(1) rotate(180deg)',
            } as CSSProperties
          }
          onTransitionEnd={onRevealEnd}
        >
          <Card card={reveal.card} faceDown={!flipped} width={reveal.from.width} interactive={false} />
        </div>
      )}

      {overlay}

      <div className={styles.handWrap} ref={handRef}>
        <Hand items={hand} gapAt={gapAt} />
      </div>
    </div>
  )
}
