import enCommon from '@release/translation/locales/en/common.json'
import ruCommon from '@release/translation/locales/ru/common.json'
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react'
import { HEAP_SHOW, play, scatterAt, toDiscardParams } from '@/animations'
import { CARDS } from '@/cards'
import type { Card as CardType } from '@/cards/types'
import { nextHandUid } from '@/mocks/hand'
import Card from '@/primitives/Card'
import ConfirmAction from '@/table/ConfirmAction'
import DiscardHeap from '@/table/DiscardHeap'
import Hand from '@/table/Hand'
import type { ReleaseSlots } from '@/table/ReleaseZone/ReleaseZone'
import Seat from '@/table/Seat'
import { pick, useLang } from '../../../Playground/lang'
import { reorderHand } from '../reorderHand'
import { useHandInsert } from '../useHandInsert'
import styles from './GitCards.module.css'

// "System Upgrade" — every OTHER player discards one card (their choice) to the
// centre of the table. base: those cards then go to the discard. sudo System
// Upgrade: the player first takes one of the discarded cards into their hand, the
// rest go to the discard.
const BASE = CARDS.filter((c) => c.deck === 'base')
const HAND_POOL = BASE.filter((c) => c.category !== 'trigger')
const OPP_COUNTS = [1, 2, 3, 4, 5] as const
const OPP_NAMES = ['neo', 'trinity', 'morpheus', 'smith', 'oracle']
const INITIAL_HAND = 5
const CENTER_W = 150 // thrown card width at the centre (readable, like the cherry grid)
const PILE_W = 132 // discard pile width
const EMPTY_RELEASE: ReleaseSlots = { frontend: undefined, backend: undefined, database: undefined }

// timings
const THROW_DUR = 460 // a card flies from a seat to the centre
const THROW_STEP = 260 // stagger — opponents discard one after another
const THROW_SCALE = 0.42 // card starts small at the seat, grows to full at centre
const HOLD_MS = 2500 // base: pause after the last card before they go to discard
const CLEAR_STEP = 90 // stagger, centre → discard
const RETURN_DUR = 420 // = the centerToDiscard preset duration
// sudo take-to-hand — same beat as cherry-pick: the chosen card reveals to the
// centre (enlarged), holds, then drops into the fan
const REVEAL_W = 220 // width the chosen card reaches at the centre
const REVEAL_DUR = 460 // reveal-to-centre duration
const REVEAL_HOLD = 560 // pause before it drops into the hand
const HAND_MIN = REVEAL_DUR + REVEAL_HOLD + 520 // total before a sudo round can finish

type Phase = 'idle' | 'throw' | 'hold' | 'choose' | 'resolve' | 'done'
interface CenterCard {
  uid: string
  card: CardType
  oppId: string
}
interface DiscardCard {
  uid: string
  card: CardType
  rot: number
  dx: number
  dy: number
}

const rand = (pool: CardType[]) => pool[Math.floor(Math.random() * pool.length)]
const makeHand = (n: number) => HAND_POOL.slice(0, n).map((card) => ({ uid: nextHandUid(), card }))
// the card area at the top of a pile (a Pile is taller than its card)
const cardAreaOf = (r: DOMRect) => ({
  left: r.left,
  top: r.top,
  width: r.width,
  height: r.width * 1.4,
})

export default function SystemUpgrade({ selector }: { selector: ReactNode }) {
  const { lang } = useLang()
  const [sudo, setSudo] = useState(false)
  const [oppN, setOppN] = useState<(typeof OPP_COUNTS)[number]>(3)
  const [phase, setPhase] = useState<Phase>('idle')
  const [center, setCenter] = useState<CenterCard[]>([])
  const [discard, setDiscard] = useState<DiscardCard[]>([])
  const [hand, setHand] = useState(() => makeHand(INITIAL_HAND))
  const [picked, setPicked] = useState<string | null>(null) // chosen centre uid (sudo)

  const rootRef = useRef<HTMLDivElement>(null)
  const seatRefs = useRef<Map<string, HTMLElement>>(new Map())
  const centerRefs = useRef<Map<string, HTMLElement>>(new Map())
  const discardRef = useRef<HTMLDivElement>(null)
  const handRef = useRef<HTMLDivElement>(null)
  const timers = useRef<number[]>([])

  const clearTimers = () => {
    for (const t of timers.current) window.clearTimeout(t)
    timers.current = []
  }
  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms))
  useLayoutEffect(() => {
    const pool = timers.current
    return () => {
      for (const t of pool) window.clearTimeout(t)
    }
  }, [])

  const opponents = Array.from({ length: oppN }, (_, i) => ({
    id: `opp-${i}`,
    name: OPP_NAMES[i],
  }))

  // the chosen card settles into the hand (proven family insert)
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
  })

  function toIdle() {
    clearTimers()
    resetInsert()
    setCenter([])
    setPicked(null)
    setPhase('idle')
  }
  function restart() {
    toIdle()
    setDiscard([])
    setHand(makeHand(INITIAL_HAND))
  }
  function changeSudo(v: boolean) {
    setSudo(v)
    toIdle()
  }
  function changeOpp(n: (typeof OPP_COUNTS)[number]) {
    setOppN(n)
    toIdle()
  }

  function start() {
    setPicked(null)
    setCenter(opponents.map((o) => ({ uid: nextHandUid(), card: rand(HAND_POOL), oppId: o.id })))
    setPhase('throw')
  }

  // throw: each opponent's card flies from their seat to its centre slot (FLIP),
  // staggered so they discard one after another. Then → choose (sudo) or a 2.5s
  // hold followed by the cards leaving to the discard (base).
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once on entering 'throw'
  useLayoutEffect(() => {
    if (phase !== 'throw') return
    center.forEach((c, i) => {
      const el = centerRefs.current.get(c.uid)
      const seat = seatRefs.current.get(c.oppId)
      if (!el || !seat) return
      const slot = el.getBoundingClientRect()
      const s = seat.getBoundingClientRect()
      const dx = s.left + s.width / 2 - (slot.left + slot.width / 2)
      const dy = s.top + s.height / 2 - (slot.top + slot.height / 2)
      const delay = i * THROW_STEP
      el.style.transition = 'none'
      el.style.transform = `translate(${dx}px, ${dy}px) scale(${THROW_SCALE})`
      el.style.opacity = '0'
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          el.style.transition = `transform ${THROW_DUR}ms var(--ease-out) ${delay}ms, opacity ${THROW_DUR}ms ${delay}ms`
          el.style.transform = 'translate(0, 0) scale(1)'
          el.style.opacity = '1'
        }),
      )
    })
    const thrown = THROW_DUR + (center.length - 1) * THROW_STEP + 80
    later(() => {
      // clear the inline fly styles (transform/opacity), not just the transition —
      // a leftover inline transform would override .suCard:hover by specificity
      // and the pick hover-lift wouldn't work in the sudo choose step
      centerRefs.current.forEach((el) => {
        el.style.transition = ''
        el.style.transform = ''
        el.style.opacity = ''
      })
      if (sudo) setPhase('choose')
      else {
        setPhase('hold')
        later(() => resolve(null), HOLD_MS)
      }
    }, thrown)
  }, [phase])

  // centre cards leave: the chosen one (sudo) to the hand, the rest to the discard
  function resolve(handUid: string | null) {
    setPhase('resolve')
    const pileRect = discardRef.current?.getBoundingClientRect()
    const rest = center.filter((c) => c.uid !== handUid)

    // pass 1: read every rect before freezing (freezing reflows the flex row)
    const rects = new Map<string, DOMRect>()
    for (const c of center) {
      const el = centerRefs.current.get(c.uid)
      if (el) rects.set(c.uid, el.getBoundingClientRect())
    }
    // pass 2: pin them all at their captured rects
    for (const c of center) {
      const el = centerRefs.current.get(c.uid)
      const r = rects.get(c.uid)
      if (!el || !r) continue
      el.style.position = 'fixed'
      el.style.left = `${r.left}px`
      el.style.top = `${r.top}px`
      el.style.width = `${r.width}px`
      el.style.margin = '0'
      el.style.zIndex = '100'
    }

    // chosen → hand: reveal to the centre (enlarged), hold, then drop into the
    // fan (the shared useHandInsert) — the same beat as cherry-pick
    const handCard = center.find((c) => c.uid === handUid)?.card
    const handRect = handUid ? rects.get(handUid) : null
    const handEl = handUid ? centerRefs.current.get(handUid) : null
    if (handCard && handRect && handEl) {
      const stage = rootRef.current?.getBoundingClientRect()
      const cx = stage ? stage.left + stage.width / 2 : window.innerWidth / 2
      const cy = stage ? stage.top + stage.height / 2 : window.innerHeight / 2
      const dx = cx - (handRect.left + handRect.width / 2)
      const dy = cy - (handRect.top + handRect.height / 2)
      handEl.style.zIndex = '130'
      handEl.style.transition = `transform ${REVEAL_DUR}ms var(--ease-soft)`
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          handEl.style.transform = `translate(${dx}px, ${dy}px) scale(${REVEAL_W / handRect.width})`
        }),
      )
      later(() => {
        const el = centerRefs.current.get(handUid as string)
        if (!el) return
        const r = el.getBoundingClientRect()
        el.style.opacity = '0' // the insert overlay takes over
        insert(
          handCard,
          { left: r.left, top: r.top, width: r.width, height: r.height },
          hand.length,
        )
      }, REVEAL_DUR + REVEAL_HOLD)
    }

    // rest → discard, each landing at its own scatter
    const heap = rest.map((c, i) => ({ uid: c.uid, card: c.card, ...scatterAt(i, PILE_W) }))
    if (pileRect) {
      const to = cardAreaOf(pileRect)
      rest.forEach((c, i) => {
        const el = centerRefs.current.get(c.uid)
        const from = rects.get(c.uid)
        if (!el || !from) return
        const visible = i >= rest.length - HEAP_SHOW
        later(
          () => play('centerToDiscard', el, toDiscardParams(from, to, heap[i], !visible)),
          i * CLEAR_STEP,
        )
      })
    }

    const clearDone = RETURN_DUR + Math.max(0, rest.length - 1) * CLEAR_STEP
    later(
      () => {
        setDiscard((prev) => [...prev, ...heap])
        setCenter([])
        setPicked(null)
        setPhase('done')
      },
      Math.max(clearDone, handUid ? HAND_MIN : 0) + 160,
    )
  }

  const showCenter =
    phase === 'throw' || phase === 'hold' || phase === 'choose' || phase === 'resolve'
  const seatCopy = pick(lang, { ru: ruCommon.seat, en: enCommon.seat })

  return (
    <div className={styles.root} ref={rootRef}>
      <div className={styles.bar}>
        {selector}
        <span className={styles.sep} />
        <label className={styles.toggle}>
          <input type="checkbox" checked={sudo} onChange={(e) => changeSudo(e.target.checked)} />
          sudo
        </label>
        <span className={styles.miniLabel}>
          {pick(lang, { ru: 'соперников', en: 'opponents' })}
        </span>
        <div className={styles.seg}>
          {OPP_COUNTS.map((n) => (
            <button
              key={n}
              type="button"
              className={`${styles.segBtn} ${oppN === n ? styles.on : ''}`}
              onClick={() => changeOpp(n)}
            >
              {n}
            </button>
          ))}
        </div>
        <button type="button" className={styles.btn} onClick={restart}>
          {pick(lang, { ru: 'рестарт', en: 'restart' })}
        </button>
      </div>

      {/* opponents across the top, as on the table */}
      <div className={styles.suOpponents}>
        {opponents.map((o) => (
          <div
            key={o.id}
            ref={(el) => {
              if (el) seatRefs.current.set(o.id, el)
              else seatRefs.current.delete(o.id)
            }}
          >
            <Seat player={{ ...o, handCount: 6, release: EMPTY_RELEASE }} copy={seatCopy} />
          </div>
        ))}
      </div>

      {/* discard — right-centre, as on the table; cards land here scattered */}
      <div className={styles.discardPile}>
        <DiscardHeap
          cards={discard}
          stackRef={discardRef}
          width={PILE_W}
          maxVisible={HEAP_SHOW}
          logoVariant={lang}
        />
        <span className={styles.pileLabel}>{pick(lang, { ru: 'сброс', en: 'discard' })}</span>
      </div>

      {/* idle: start button in the centre */}
      {phase === 'idle' && (
        <div className={styles.controls}>
          <button type="button" className={styles.callBtn} onClick={start}>
            system upgrade
          </button>
        </div>
      )}

      {/* sudo choose — dim the rest so the centre cards are the focus */}
      {phase === 'choose' && <div className={styles.scrim} />}

      {/* the thrown cards, face-up in the centre */}
      {showCenter && (
        <div className={styles.suCenter}>
          {center.map((c) => {
            const selected = picked === c.uid
            return (
              <button
                key={c.uid}
                ref={(el) => {
                  if (el) centerRefs.current.set(c.uid, el)
                  else centerRefs.current.delete(c.uid)
                }}
                type="button"
                className={`${styles.suCard} ${selected ? styles.suSelected : ''}`}
                disabled={phase !== 'choose'}
                onClick={() => phase === 'choose' && setPicked(c.uid)}
              >
                <Card
                  card={c.card}
                  interactive={false}
                  width={CENTER_W}
                  state={phase === 'choose' && selected ? 'selected' : 'idle'}
                  // pick one out of a set — uniform selection colour, not the
                  // per-category accent
                  accent="var(--select-accent)"
                />
              </button>
            )
          })}
        </div>
      )}

      {/* sudo: confirm the card to take — the shared slide-up bar */}
      <ConfirmAction
        open={phase === 'choose'}
        label={pick(lang, { ru: 'взять в руку', en: 'take to hand' })}
        caption={pick(lang, {
          ru: 'выбери сброшенную карту себе в руку',
          en: 'pick a discarded card to take into your hand',
        })}
        disabled={!picked}
        onConfirm={() => picked && resolve(picked)}
      />

      {overlay}

      {/* player hand — bottom */}
      <div
        className={styles.handWrap}
        ref={handRef}
        style={{ pointerEvents: phase === 'idle' || phase === 'done' ? undefined : 'none' }}
      >
        <Hand
          items={hand}
          gapAt={gapAt}
          onReorder={(uid, to) => setHand((h) => reorderHand(h, uid, to))}
        />
      </div>
    </div>
  )
}
