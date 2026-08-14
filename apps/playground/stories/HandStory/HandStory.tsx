import { useState } from 'react'
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
  handStep,
} from '@/table/Hand/Hand'
import { useLang } from '../../Playground/lang'
import TechBar from '../controls/TechBar'
import { TechButton, TechHint, TechLabel, TechToggle } from '../controls/TechControls'
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
    hint: 'перетащи карту внутри руки — переставить',
    reset: 'рестарт',
  },
  en: {
    cardsInHand: 'cards in hand',
    faceDown: 'face down',
    parallax: 'parallax face',
    drag: 'drag',
    states: 'card states',
    step: 'step between cards',
    fan: 'fan width',
    hint: 'drag a card within the hand to reorder',
    reset: 'restart',
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

  const setCount = (n: number) => setItems((prev) => resize(n, prev))

  // reorder within the hand (local — nothing to sync; others see only count)
  const reorder = (u: string, toIndex: number) => setItems((prev) => reorderHand(prev, u, toIndex))

  // this page demonstrates the FAN, so the hand keeps its cards: no drop is a
  // valid target here. Rejecting is the Hand's own path — it glides the card back
  // into its slot instead of it vanishing. Playing a card belongs to the
  // interactive scenes, which have a table to play it onto.
  const play = (): boolean => false

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
              tiltFrom={ctx.tiltFrom}
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
            tiltFrom={ctx.tiltFrom}
          />
        )
      }
    : undefined
  const step = items.length >= 2 ? Math.round(handStep(items.length)) : 0
  const span = items.length >= 2 ? Math.round((items.length - 1) * handStep(items.length)) : 0

  return (
    <div className={styles.root}>
      <TechBar>
        <TechButton onClick={() => setItems(resize(6))}>{t.reset}</TechButton>
        <div className={styles.sliderWrap}>
          <Slider label={t.cardsInHand} value={items.length} min={0} max={20} onChange={setCount} />
        </div>
        <TechToggle on={faceDown} onChange={setFaceDown}>
          {t.faceDown}
        </TechToggle>
        <TechToggle on={parallax} onChange={setParallax}>
          {t.parallax}
        </TechToggle>
        <TechToggle on={drag} onChange={setDrag}>
          {t.drag}
        </TechToggle>
        <TechToggle on={states} onChange={setStates}>
          {t.states}
        </TechToggle>
        <span className={styles.readout}>
          <TechLabel>
            {t.step}: <b>{step}px</b> · {t.fan}: <b>{span}px</b>
          </TechLabel>
        </span>
        {drag && <TechHint>{t.hint}</TechHint>}
      </TechBar>

      <div className={styles.stage}>
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
