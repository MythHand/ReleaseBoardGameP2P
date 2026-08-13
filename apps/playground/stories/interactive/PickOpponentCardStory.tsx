import type React from 'react'
import { type CSSProperties, useRef, useState } from 'react'
import { CARDS } from '@/cards'
import type { Card as CardType } from '@/cards/types'
import { nextHandUid } from '@/mocks/hand'
import Card from '@/primitives/Card'
import Slider from '@/primitives/Slider'
import Hand from '@/table/Hand'
import { pick, useLang } from '../../Playground/lang'
import TechBar from '../controls/TechBar'
import { TechButton } from '../controls/TechControls'
import styles from './PickOpponentCardStory.module.css'
import { reorderHand } from './reorderHand'
import { useHandArrival } from './useHandArrival'

// "Take a random card from the opponent's hand" — as if the player across the
// table extends a fan face-down for you to choose from. The opponent hand (the
// same Hand component, backs up) slides in from the top; picking a card sends the
// fan back up off-screen while the chosen card travels to the centre and flips
// face-up, then drops into the player's hand (the shared useHandArrival step).
const REVEAL_HOLD = 820 // pause in the centre after the flip, before the drop
const INITIAL_HAND = 5
const REVEAL_W = 220 // width the chosen card reaches in the centre

// Hands (both player and opponent) hold only the base deck — green backs.
const BASE = CARDS.filter((c) => c.deck === 'base')

type Phase = 'idle' | 'present' | 'reveal'
interface PoolCard {
  uid: string
  card: CardType
}
interface Reveal {
  card: CardType
  from: { left: number; top: number; width: number; height: number }
  to: string
}

function sampleBase(n: number): CardType[] {
  return [...BASE].sort(() => Math.random() - 0.5).slice(0, n)
}

function makeHand(n: number) {
  return BASE.slice(0, n).map((card) => ({ uid: nextHandUid(), card }))
}

export default function PickOpponentCardStory() {
  const { lang } = useLang()
  const [count, setCount] = useState(8)
  const [phase, setPhase] = useState<Phase>('idle')
  const [oppHand, setOppHand] = useState<PoolCard[]>([])
  const [handIn, setHandIn] = useState(false) // opponent fan slid into view
  const [chosen, setChosen] = useState<string | null>(null) // picked card uid
  const [reveal, setReveal] = useState<Reveal | null>(null)
  const [centered, setCentered] = useState(false) // chosen card reached the centre
  const [flipped, setFlipped] = useState(false) // chosen card turned face-up
  const [hand, setHand] = useState(() => makeHand(INITIAL_HAND))

  const handRef = useRef<HTMLDivElement>(null)
  const revealRef = useRef<HTMLDivElement>(null)
  const holdTimer = useRef<number | null>(null)

  // final step is shared: the card settles into the hand, then reset the round
  const {
    gapAt,
    gapSize,
    overlay,
    arrive,
    reset: resetInsert,
  } = useHandArrival(handRef, (gap, landed) => {
    setHand((h) => {
      const copy = [...h]
      copy.splice(gap, 0, ...landed.map((it) => ({ uid: it.key, card: it.card })))
      return copy
    })
    setPhase('idle')
    setChosen(null)
    setReveal(null)
    setCentered(false)
    setFlipped(false)
    setOppHand([])
    setHandIn(false)
  })

  // deal the opponent's fan and slide it in from the top
  function deal() {
    setOppHand(sampleBase(count).map((card) => ({ uid: nextHandUid(), card })))
    setChosen(null)
    setReveal(null)
    setCentered(false)
    setFlipped(false)
    setPhase('present')
    setHandIn(false)
    requestAnimationFrame(() => requestAnimationFrame(() => setHandIn(true)))
  }

  function restart() {
    if (holdTimer.current) window.clearTimeout(holdTimer.current)
    resetInsert()
    setPhase('idle')
    setChosen(null)
    setReveal(null)
    setCentered(false)
    setFlipped(false)
    setOppHand([])
    setHandIn(false)
    setHand(makeHand(INITIAL_HAND))
  }

  // pick a back: the fan leaves upward, the chosen card lifts out and heads to centre
  function pickCard(i: number, el: HTMLElement, e: React.MouseEvent) {
    if (phase !== 'present' || chosen !== null) return
    e.stopPropagation()
    const { card, uid } = oppHand[i]
    const r = el.getBoundingClientRect()
    // travel from the slot to the viewport centre, normalising the size to REVEAL_W
    const dx = window.innerWidth / 2 - (r.left + r.width / 2)
    const dy = window.innerHeight / 2 - (r.top + r.height / 2)
    const to = `translate(${dx}px, ${dy}px) scale(${REVEAL_W / r.width}) rotate(0deg)`
    setChosen(uid)
    setPhase('reveal')
    setHandIn(false) // the opponent fan slides up and off the top
    setReveal({ card, from: { left: r.left, top: r.top, width: r.width, height: r.height }, to })
    setCentered(false)
    setFlipped(false)
    requestAnimationFrame(() => requestAnimationFrame(() => setCentered(true)))
  }

  // reached the centre → flip face-up, hold, then drop into the hand
  function onRevealEnd(e: React.TransitionEvent) {
    if (e.propertyName !== 'transform' || !centered || flipped) return
    setFlipped(true)
    holdTimer.current = window.setTimeout(fall, REVEAL_HOLD)
  }

  function fall() {
    const el = revealRef.current
    if (el && reveal) {
      const r = el.getBoundingClientRect()
      void arrive([{ key: nextHandUid(), card: reveal.card, from: r }], hand.length)
    }
    setReveal(null)
  }

  return (
    <div className={styles.root}>
      <TechBar>
        <TechButton onClick={restart}>{pick(lang, { ru: 'рестарт', en: 'restart' })}</TechButton>
        <div className={styles.sliderWrap}>
          <Slider
            label={pick(lang, { ru: 'карт у соперника', en: 'opponent cards' })}
            value={count}
            min={2}
            max={16}
            onChange={setCount}
          />
        </div>
      </TechBar>
      <div className={styles.stage}>
        {phase !== 'idle' && (
          <div className={styles.topHand} data-in={handIn}>
            {/* rotated 180° — the opponent across the table extends the fan toward you */}
            <div className={styles.topHandInner}>
              <Hand
                items={oppHand}
                faceDown
                onCardClick={phase === 'present' && chosen === null ? pickCard : undefined}
                renderFace={(item, ctx) =>
                  item.uid === chosen ? null : (
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

        {phase === 'idle' && (
          <div className={styles.startSlot}>
            <button type="button" className={styles.callBtn} onClick={deal}>
              {pick(lang, {
                ru: 'взять случайную карту соперника',
                en: 'take a random opponent card',
              })}
            </button>
          </div>
        )}

        {phase === 'present' && chosen === null && (
          <div className={styles.hint}>{pick(lang, { ru: 'выбери карту', en: 'pick a card' })}</div>
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
                // starts matching the opponent's 180° orientation, turns upright on the way
                transform: centered ? reveal.to : 'translate(0px, 0px) scale(1) rotate(180deg)',
              } as CSSProperties
            }
            onTransitionEnd={onRevealEnd}
          >
            <Card
              card={reveal.card}
              faceDown={!flipped}
              width={reveal.from.width}
              interactive={false}
            />
          </div>
        )}

        {overlay}

        <div className={styles.handWrap} ref={handRef}>
          <Hand
            items={hand}
            gapAt={gapAt}
            gapSize={gapSize}
            onReorder={(uid, to) => setHand((h) => reorderHand(h, uid, to))}
          />
        </div>
      </div>
    </div>
  )
}
