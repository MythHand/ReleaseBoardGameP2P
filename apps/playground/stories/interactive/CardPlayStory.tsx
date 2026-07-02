import type { CardData } from '@release/ui'
import type React from 'react'
import { useRef, useState } from 'react'
import { jitter, nextFrames, play } from '@/animations'
import { CARDS } from '@/cards'
import Card, { cardBoxIn } from '@/primitives/Card'
import type { ReleaseSlots } from '@/table/ReleaseZone/ReleaseZone'
import Seat from '@/table/Seat'
import { SEAT_COPY_EN, SEAT_COPY_RU } from '@/table/Seat/Seat'
import { pick, useLang } from '../../Playground/lang'
import styles from './CardPlayStory.module.css'

// Showcase of two reusable card-play presets:
//   part 1 — hand/opponent → table center (the playToCenter preset),
//   part 2 — center → discard (the centerToDiscard preset, with scatter).
// The source of part 1 varies: the card is played by the player (bottom) or the
// opponent (top — represented by a Seat, as on the table; the card flies from its spot).

const BASE = CARDS.filter((c) => c.deck === 'base')
// Fixed card width for this showcase: it renders the hand by hand (not via the
// @/table/Hand component), so there is no real card element to measure. A real build
// should size cards from the Hand component. See project note.
const FIXED_CARD_W = 108
const EMPTY_RELEASE: ReleaseSlots = { frontend: undefined, backend: undefined, database: undefined }

interface HandItem {
  uid: string
  card: CardData
}
interface Rect {
  left: number
  top: number
  width: number
  height: number
}
interface DiscardEntry {
  card: CardData
  rot: number
  dx: number
  dy: number
}

let seq = 0
const uid = () => `p${++seq}`
const makeHand = (cards: CardData[]): HandItem[] => cards.map((card) => ({ uid: uid(), card }))

export default function CardPlayStory() {
  const { lang } = useLang()
  const [playerHand, setPlayerHand] = useState(() => makeHand(BASE.slice(0, 5)))
  const [oppDeck, setOppDeck] = useState(() => BASE.slice(5, 10))
  const [center, setCenter] = useState<CardData | null>(null)
  const [discard, setDiscard] = useState<DiscardEntry[]>([])
  const [flyer, setFlyer] = useState<CardData | null>(null)
  const [busy, setBusy] = useState(false)

  const handRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const seatRef = useRef<HTMLDivElement>(null)
  const centerRef = useRef<HTMLDivElement>(null)
  const discardRef = useRef<HTMLDivElement>(null)
  const flyerRef = useRef<HTMLDivElement>(null)

  // part 1: a card flies from the "from" rect to the center (the playToCenter preset)
  const flyToCenter = async (card: CardData, from: Rect) => {
    if (busy || center) return // the center is busy — send to the discard first
    setBusy(true)
    const toRect = centerRef.current?.getBoundingClientRect()
    setFlyer(card)
    await nextFrames()
    const el = flyerRef.current
    if (el && toRect) {
      el.style.left = `${from.left}px`
      el.style.top = `${from.top}px`
      el.style.width = `${from.width}px`
      const anim = play('playToCenter', el, { from, to: toRect })
      if (anim) await anim.finished
    }
    setCenter(card)
    setFlyer(null)
    setBusy(false)
  }

  // part 2: a card flies from the center to the discard with scatter (the centerToDiscard preset)
  const flyToDiscard = async () => {
    if (busy || !center) return
    setBusy(true)
    const card = center
    const fromRect = centerRef.current?.getBoundingClientRect()
    const toRect = discardRef.current?.getBoundingClientRect()
    const j = jitter()
    setCenter(null)
    setFlyer(card)
    await nextFrames()
    const el = flyerRef.current
    if (el && fromRect && toRect) {
      el.style.left = `${fromRect.left}px`
      el.style.top = `${fromRect.top}px`
      el.style.width = `${fromRect.width}px`
      const anim = play('centerToDiscard', el, {
        from: fromRect,
        to: toRect,
        rotate: j.rot,
        dx: j.dx,
        dy: j.dy,
      })
      if (anim) await anim.finished
    }
    setDiscard((d) => [...d, { card, ...j }])
    setFlyer(null)
    setBusy(false)
  }

  const playFromPlayer = (e: React.MouseEvent, item: HandItem) => {
    e.stopPropagation()
    const el = handRefs.current[item.uid]
    if (!el || busy || center) return
    setPlayerHand((h) => h.filter((it) => it.uid !== item.uid))
    void flyToCenter(item.card, el.getBoundingClientRect())
  }

  // the opponent "plays" — a card flies from the Seat spot (card-sized)
  const playFromOpponent = (e: React.MouseEvent) => {
    e.stopPropagation()
    const el = seatRef.current
    if (!el || busy || center || oppDeck.length === 0) return
    const card = oppDeck[0]
    setOppDeck((d) => d.slice(1))
    const r = el.getBoundingClientRect()
    void flyToCenter(card, cardBoxIn(r, FIXED_CARD_W))
  }

  const reset = () => {
    seq = 0
    setPlayerHand(makeHand(BASE.slice(0, 5)))
    setOppDeck(BASE.slice(5, 10))
    setCenter(null)
    setDiscard([])
    setFlyer(null)
    setBusy(false)
  }

  return (
    <div className={styles.root}>
      <div className={styles.bar}>
        <button type="button" className={styles.btn} onClick={reset}>
          {pick(lang, { ru: 'сброс состояния', en: 'reset state' })}
        </button>
        <span className={styles.hint}>
          {pick(lang, {
            ru: 'клик по карте игрока / по сопернику → в центр; клик по карте в центре → в сброс',
            en: 'click a player card / the opponent → to the center; click the card at the center → to the discard',
          })}
        </span>
      </div>

      {/* opponent — as on the table (a Seat with a card counter); click = plays */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: pointer-only opponent play; sandbox story */}
      <div className={styles.opponent} ref={seatRef} onMouseDown={playFromOpponent}>
        <Seat
          player={{
            id: 'opp',
            name: pick(lang, { ru: 'соперник', en: 'opponent' }),
            handCount: oppDeck.length,
            release: EMPTY_RELEASE,
          }}
          copy={pick(lang, { ru: SEAT_COPY_RU, en: SEAT_COPY_EN })}
        />
      </div>

      {/* table center */}
      <div className={styles.center} ref={centerRef}>
        {center ? (
          // biome-ignore lint/a11y/noStaticElementInteractions: pointer-only send to discard; sandbox story
          <div className={styles.centerCard} onMouseDown={flyToDiscard}>
            <Card card={center} interactive={false} width="100%" />
          </div>
        ) : (
          <span className={styles.centerSlot}>{pick(lang, { ru: 'центр', en: 'center' })}</span>
        )}
      </div>

      {/* discard — on the right, cards land scattered */}
      <div className={styles.discard}>
        <div className={styles.discardStack} ref={discardRef}>
          {discard.map((d, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: discard is append-only, the index is stable
              key={i}
              className={styles.discardCard}
              style={{
                transform: `translate(${d.dx}px, ${d.dy}px) rotate(${d.rot}deg)`,
                zIndex: i,
              }}
            >
              <Card card={d.card} interactive={false} width="100%" />
            </div>
          ))}
          {discard.length === 0 && (
            <span className={styles.discardEmpty}>
              {pick(lang, { ru: 'сброс', en: 'discard' })}
            </span>
          )}
          {discard.length > 0 && <span className={styles.discardCount}>{discard.length}</span>}
        </div>
        <div className={styles.label}>{pick(lang, { ru: 'сброс', en: 'discard' })}</div>
      </div>

      {/* player hand — bottom, face up */}
      <div className={styles.hand}>
        {playerHand.map((item) => (
          // biome-ignore lint/a11y/noStaticElementInteractions: pointer-only play; sandbox story
          <div
            key={item.uid}
            ref={(el) => {
              handRefs.current[item.uid] = el
            }}
            className={styles.card}
            onMouseDown={(e) => playFromPlayer(e, item)}
          >
            <Card card={item.card} interactive={false} width={`${FIXED_CARD_W}px`} />
          </div>
        ))}
      </div>

      {flyer && (
        <div className={styles.flyer} ref={flyerRef}>
          <Card card={flyer} interactive={false} width="100%" />
        </div>
      )}
    </div>
  )
}
