import { useRef, useState } from 'react'
import { CARD_CONTENT, CARDS } from '@/cards'
import CardParallax, { PARALLAX_CARDS } from '@/cards/CardParallax'
import type { Card as CardType } from '@/cards/types'
import Card from '@/primitives/Card'
import Slider from '@/primitives/Slider'
import Hand from '@/table/Hand'
import {
  type HandCardState,
  type HandFaceContext,
  type HandItem,
  type HandPlayDrop,
  handStep,
} from '@/table/Hand/Hand'
import { useLang } from '../../Playground/lang'
import { reorderHand } from '../interactive/reorderHand'
import styles from './HandStory.module.css'

let _u = 0
const uid = () => `s${++_u}`

interface Item {
  uid: string
  card: CardType
}

const COPY = {
  ru: {
    cardsInHand: 'карт в руке',
    faceDown: 'рубашкой вверх',
    parallax: 'parallax-лицо',
    drag: 'перетаскивание',
    states: 'состояния карт',
    step: 'шаг между картами',
    fan: 'ширина веера',
    hint: 'перетащи карту внутри руки — переставить; вытащи на стол — разыграть',
    played: 'разыграно',
    reset: 'сброс',
    playZone: 'стол — сюда играть',
  },
  en: {
    cardsInHand: 'cards in hand',
    faceDown: 'face down',
    parallax: 'parallax face',
    drag: 'drag',
    states: 'card states',
    step: 'step between cards',
    fan: 'fan width',
    hint: 'drag a card within the hand to reorder; pull it onto the table to play',
    played: 'played',
    reset: 'reset',
    playZone: 'table — drop to play',
  },
}

// change the length, keeping existing uids — the fan re-lays out smoothly
function resize(n: number, prev: Item[] = []): Item[] {
  const next = prev.slice(0, n)
  while (next.length < n) next.push({ uid: uid(), card: CARDS[next.length % CARDS.length] })
  return next
}

// a demo state mix so the glow (playable / selected) and the transitioned dim
// (disabled) are both visible — in the real game this comes from PlayerView
function demoState(i: number): HandCardState {
  if (i === 0) return 'selected'
  if (i === 1) return 'playable'
  if (i % 4 === 2) return 'disabled'
  return 'idle'
}

export default function HandStory() {
  const { lang } = useLang()
  const t = COPY[lang]
  const [items, setItems] = useState<Item[]>(() => resize(6))
  const [faceDown, setFaceDown] = useState(false)
  const [parallax, setParallax] = useState(false)
  const [drag, setDrag] = useState(true)
  const [states, setStates] = useState(false)
  const [played, setPlayed] = useState<string[]>([])
  const playZoneRef = useRef<HTMLDivElement>(null)

  const setCount = (n: number) => setItems((prev) => resize(n, prev))

  // reorder within the hand (local — nothing to sync; others see only count)
  const reorder = (u: string, toIndex: number) => setItems((prev) => reorderHand(prev, u, toIndex))

  // play — only accepted when dropped on the table zone (a valid target). Random
  // drops are rejected → the Hand glides the card back instead of it vanishing.
  const play = (u: string, drop: HandPlayDrop): boolean => {
    const zone = playZoneRef.current?.getBoundingClientRect()
    const onTable =
      zone != null &&
      drop.x >= zone.left &&
      drop.x <= zone.right &&
      drop.y >= zone.top &&
      drop.y <= zone.bottom
    if (!onTable) return false
    setItems((prev) => {
      const card = prev.find((it) => it.uid === u)?.card
      if (card) setPlayed((p) => [card.name, ...p].slice(0, 6))
      return prev.filter((it) => it.uid !== u)
    })
    return true
  }

  // technical face swap: render the composed CardParallax face for cards that
  // have one; fall back to the PNG Card when face-down or no composed content.
  const renderFace = parallax
    ? (item: HandItem, ctx: HandFaceContext) => {
        const config = PARALLAX_CARDS[item.card.id]
        if (ctx.faceDown || !config) {
          return (
            <Card
              card={item.card}
              faceDown={ctx.faceDown}
              interactive={false}
              tilt={ctx.tilt}
              width={ctx.width}
              state={ctx.state}
              accent={ctx.accent}
            />
          )
        }
        const content = CARD_CONTENT[item.card.id]?.[lang]
        return (
          <CardParallax
            config={config}
            content={{
              title: content?.title ?? item.card.name,
              description: content?.paragraphs ?? [],
            }}
            width={ctx.width}
            // interactive → the pointer parallax tilt (the whole point in the hand)
            interactive
          />
        )
      }
    : undefined
  const step = items.length >= 2 ? Math.round(handStep(items.length)) : 0
  const span = items.length >= 2 ? Math.round((items.length - 1) * handStep(items.length)) : 0

  return (
    <div className={styles.root}>
      <div className={styles.controls}>
        <div className={styles.sliderWrap}>
          <Slider label={t.cardsInHand} value={items.length} min={0} max={20} onChange={setCount} />
        </div>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={faceDown}
            onChange={(e) => setFaceDown(e.target.checked)}
          />
          {t.faceDown}
        </label>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={parallax}
            onChange={(e) => setParallax(e.target.checked)}
          />
          {t.parallax}
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={drag} onChange={(e) => setDrag(e.target.checked)} />
          {t.drag}
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={states} onChange={(e) => setStates(e.target.checked)} />
          {t.states}
        </label>
        <button type="button" className={styles.reset} onClick={() => setItems(resize(6))}>
          {t.reset}
        </button>
      </div>

      <p className={styles.readout}>
        {t.step}: <b>{step}px</b> · {t.fan}: <b>{span}px</b>
        {played.length > 0 && (
          <>
            {' · '}
            {t.played}: <b>{played.join(', ')}</b>
          </>
        )}
      </p>
      {drag && <p className={styles.hint}>{t.hint}</p>}

      <div className={styles.stage}>
        {/* a valid target — dropping a card here plays it; anywhere else it
            returns to the hand */}
        {drag && (
          <div className={styles.playZone} ref={playZoneRef}>
            {t.playZone}
          </div>
        )}
        <Hand
          items={items}
          faceDown={faceDown}
          renderFace={renderFace}
          stateAt={states ? demoState : undefined}
          onReorder={drag ? reorder : undefined}
          onPlay={drag ? play : undefined}
        />
      </div>
    </div>
  )
}
