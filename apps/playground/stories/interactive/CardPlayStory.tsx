import type { CardData } from '@release/ui'
import type React from 'react'
import { useRef, useState } from 'react'
import { jitter, nextFrames, play } from '@/animations'
import { CARDS } from '@/cards'
import Card from '@/primitives/Card'
import type { ReleaseSlots } from '@/table/ReleaseZone/ReleaseZone'
import Seat from '@/table/Seat'
import { SEAT_COPY_RU } from '@/table/Seat/Seat'
import styles from './CardPlayStory.module.css'

// Витрина двух переиспользуемых пресетов розыгрыша карты:
//   часть 1 — рука/соперник → центр стола (пресет playToCenter),
//   часть 2 — центр → сброс (пресет centerToDiscard, с разбросом).
// Источник части 1 вариативен: карту выкладывает игрок (снизу) или соперник
// (сверху — представлен Seat'ом, как на столе; карта вылетает из его места).

const BASE = CARDS.filter((c) => c.deck === 'base')
const CARD_RATIO = 1.4 // высота/ширина карты
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

  // часть 1: карта из прямоугольника from летит в центр (пресет playToCenter)
  const flyToCenter = async (card: CardData, from: Rect) => {
    if (busy || center) return // центр занят — сперва отправь в сброс
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

  // часть 2: карта из центра летит в сброс с разбросом (пресет centerToDiscard)
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

  // соперник «разыгрывает» — карта вылетает из места Seat'а (card-размером)
  const playFromOpponent = (e: React.MouseEvent) => {
    e.stopPropagation()
    const el = seatRef.current
    if (!el || busy || center || oppDeck.length === 0) return
    const card = oppDeck[0]
    setOppDeck((d) => d.slice(1))
    const r = el.getBoundingClientRect()
    const w = 108
    const h = w * CARD_RATIO
    void flyToCenter(card, {
      left: r.left + r.width / 2 - w / 2,
      top: r.top + r.height / 2 - h / 2,
      width: w,
      height: h,
    })
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
          сброс состояния
        </button>
        <span className={styles.hint}>
          клик по карте игрока / по сопернику → в центр; клик по карте в центре → в сброс
        </span>
      </div>

      {/* соперник — как на столе (Seat со счётчиком карт); клик = разыгрывает */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: pointer-only розыгрыш сопернком; sandbox story */}
      <div className={styles.opponent} ref={seatRef} onMouseDown={playFromOpponent}>
        <Seat
          player={{
            id: 'opp',
            name: 'соперник',
            handCount: oppDeck.length,
            release: EMPTY_RELEASE,
          }}
          copy={SEAT_COPY_RU}
        />
      </div>

      {/* центр стола */}
      <div className={styles.center} ref={centerRef}>
        {center ? (
          // biome-ignore lint/a11y/noStaticElementInteractions: pointer-only отправка в сброс; sandbox story
          <div className={styles.centerCard} onMouseDown={flyToDiscard}>
            <Card card={center} interactive={false} width="100%" />
          </div>
        ) : (
          <span className={styles.centerSlot}>центр</span>
        )}
      </div>

      {/* сброс — справа, карты ложатся вразброс */}
      <div className={styles.discard}>
        <div className={styles.discardStack} ref={discardRef}>
          {discard.map((d, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: сброс append-only, индекс стабилен
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
          {discard.length === 0 && <span className={styles.discardEmpty}>сброс</span>}
          {discard.length > 0 && <span className={styles.discardCount}>{discard.length}</span>}
        </div>
        <div className={styles.label}>сброс</div>
      </div>

      {/* рука игрока — снизу, лицом вверх */}
      <div className={styles.hand}>
        {playerHand.map((item) => (
          // biome-ignore lint/a11y/noStaticElementInteractions: pointer-only розыгрыш; sandbox story
          <div
            key={item.uid}
            ref={(el) => {
              handRefs.current[item.uid] = el
            }}
            className={styles.card}
            onMouseDown={(e) => playFromPlayer(e, item)}
          >
            <Card card={item.card} interactive={false} width="108px" />
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
