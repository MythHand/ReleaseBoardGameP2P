import enCommon from '@release/translation/locales/en/common.json'
import ruCommon from '@release/translation/locales/ru/common.json'
import type { CardData } from '@release/ui'
import type React from 'react'
import { useRef, useState } from 'react'
import { play, useDiscardExit, useFlyer } from '@/animations'
import { CARDS } from '@/cards'
import Card, { cardBoxIn } from '@/primitives/Card'
import Pile from '@/primitives/Pile'
import { useCardPreview } from '@/table/CardPreview'
import Hand from '@/table/Hand'
import { CARD_W } from '@/table/Hand/fan'
import type { HandPlayDrop } from '@/table/Hand/Hand'
import type { ReleaseSlots } from '@/table/ReleaseZone/ReleaseZone'
import Seat from '@/table/Seat'
import { centrePlaceStyle } from '@/table/TableCentre/centre'
import { pick, useLang } from '../../Playground/lang'
import TechBar from '../controls/TechBar'
import { TechButton, TechHint } from '../controls/TechControls'
import styles from './CardPlayStory.module.css'
import { reorderHand } from './reorderHand'

// Showcase of two reusable card-play presets:
//   part 1 — hand/opponent → table center (the playToCenter preset),
//   part 2 — center → discard (the centerToDiscard preset, with scatter).
// The source of part 1 varies: the card is played by the player (bottom) or the
// opponent (top — represented by a Seat, as on the table; the card flies from its spot).

const BASE = CARDS.filter((c) => c.deck === 'base')
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
const nextUid = () => `p${++seq}`
const makeHand = (cards: CardData[]): HandItem[] => cards.map((card) => ({ uid: nextUid(), card }))

export default function CardPlayStory() {
  const { lang } = useLang()
  const [playerHand, setPlayerHand] = useState(() => makeHand(BASE.slice(0, 5)))
  const [oppDeck, setOppDeck] = useState(() => BASE.slice(5, 10))
  const [center, setCenter] = useState<CardData | null>(null)
  const [discard, setDiscard] = useState<DiscardEntry[]>([])
  const [busy, setBusy] = useState(false)

  const seatRef = useRef<HTMLDivElement>(null)
  const centerRef = useRef<HTMLDivElement>(null)
  const discardRef = useRef<HTMLDivElement>(null)
  // the card on its way to the centre — the shared carrier holds it
  const { overlay: flyerOverlay, raise, drop } = useFlyer()
  // reading the card that stands at the centre — the shared block from the kit
  const { slotProps, overlay: previewOverlay } = useCardPreview()
  const { overlay: discardOverlay, send: sendToDiscard } = useDiscardExit(discardRef, (cards) =>
    setDiscard((d) => [...d, ...cards]),
  )

  // part 1: a card flies from the "from" rect to the center (the playToCenter preset)
  const flyToCenter = async (card: CardData, from: Rect) => {
    if (busy || center) return // the center is busy — send to the discard first
    setBusy(true)
    const toRect = centerRef.current?.getBoundingClientRect()
    const [el] = await raise([{ key: 'play', card, at: from }])
    if (el && toRect) {
      const anim = play('playToCenter', el, { from, to: toRect })
      if (anim) await anim.finished
    }
    setCenter(card)
    drop('play')
    setBusy(false)
  }

  // part 2: a card flies from the center to the discard with scatter (the centerToDiscard preset)
  const flyToDiscard = async () => {
    if (busy || !center) return
    setBusy(true)
    const card = center
    const fromRect = centerRef.current?.getBoundingClientRect()
    setCenter(null)
    if (fromRect) await sendToDiscard([{ key: 'played', card, from: fromRect }])
    setBusy(false)
  }

  // the player plays by pulling a card OUT of the fan (the canonical gesture).
  // The centre holds one card — while it is busy the drop is rejected and the
  // Hand glides the card back.
  const playFromPlayer = (uid: string, dropped: HandPlayDrop): boolean => {
    if (busy || center || !dropped.rect) return false
    const item = playerHand.find((it) => it.uid === uid)
    if (!item) return false
    setPlayerHand((h) => h.filter((it) => it.uid !== uid))
    void flyToCenter(item.card, dropped.rect)
    return true
  }

  // the opponent "plays" — a card flies from the Seat spot (card-sized)
  const playFromOpponent = (e: React.MouseEvent) => {
    e.stopPropagation()
    const el = seatRef.current
    if (!el || busy || center || oppDeck.length === 0) return
    const card = oppDeck[0]
    setOppDeck((d) => d.slice(1))
    // a Seat is wider than a card and shows only a counter, so there is no card
    // element to measure: the shared helper centres a card-sized box on the seat,
    // at the width a card has on the table (the same box Defense Release throws
    // an attack from)
    void flyToCenter(card, cardBoxIn(el.getBoundingClientRect(), CARD_W))
  }

  const reset = () => {
    seq = 0
    setPlayerHand(makeHand(BASE.slice(0, 5)))
    setOppDeck(BASE.slice(5, 10))
    setCenter(null)
    setDiscard([])
    drop() // every card still in the air comes down
    setBusy(false)
  }

  return (
    <div className={styles.root}>
      <TechBar>
        <TechButton onClick={reset}>{pick(lang, { ru: 'рестарт', en: 'restart' })}</TechButton>
        <TechHint>
          {pick(lang, {
            ru: 'вытащи карту из руки / клик по сопернику → в центр; клик по карте в центре → в сброс',
            en: 'pull a card out of the hand / click the opponent → to the center; click the card at the center → to the discard',
          })}
        </TechHint>
      </TechBar>
      <div className={styles.stage}>
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
            copy={pick(lang, { ru: ruCommon.seat, en: enCommon.seat })}
          />
        </div>

        {/* table center */}
        <div className={styles.center} style={centrePlaceStyle('reveal', 'centre')} ref={centerRef}>
          {center ? (
            // biome-ignore lint/a11y/noStaticElementInteractions: pointer-only send to discard; sandbox story
            <div className={styles.centerCard} onMouseDown={flyToDiscard} {...slotProps(center)}>
              <Card card={center} interactive={false} width="100%" />
            </div>
          ) : (
            <span className={styles.centerSlot}>{pick(lang, { ru: 'центр', en: 'center' })}</span>
          )}
        </div>

        {/* discard — on the right, cards land scattered */}
        <div className={styles.discard}>
          <Pile
            heap={discard}
            count={discard.length}
            width={116}
            boxRef={discardRef}
            logoVariant={lang}
            label={pick(lang, { ru: 'сброс', en: 'discard' })}
          />
        </div>

        {/* player hand — bottom, the canonical fan */}
        <div className={styles.hand}>
          <Hand
            items={playerHand}
            onPlay={playFromPlayer}
            onReorder={(uid, to) => setPlayerHand((h) => reorderHand(h, uid, to))}
          />
        </div>

        {previewOverlay}

        {discardOverlay}

        {/* the card in the air — the shared carrier */}
        {flyerOverlay}
      </div>
    </div>
  )
}
