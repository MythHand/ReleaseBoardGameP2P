import { useRef, useState } from 'react'
import { CARDS, cardById } from '@/cards'
import type { Card as CardType } from '@/cards/types'
import { nextHandUid } from '@/mocks/hand'
import Card from '@/primitives/Card'
import Hand from '@/table/Hand'
import { pick, useLang } from '../../Playground/lang'
import styles from './CardToHandStory.module.css'
import { reorderHand } from './reorderHand'
import { useHandArrival } from './useHandArrival'

// Showcase of the "cards arrive in the hand" step (useHandArrival) — the ONE
// movement every arrival uses, whatever brings the card: a draw, a card taken from
// an opponent, a card pulled out of the discard, or a play taken back.
//
// Two examples, because the number of cards is the only thing that differs:
//   • a pair — a Release with the Code Review laid with it: both arrive at once and
//     take two neighbouring slots, the fan opening room for both while they travel.
//   • a single card — the everyday case.
const SOURCE_CARD_W = 140
const INITIAL_HAND = 5

const BASE = CARDS.filter((c) => c.deck === 'base')
const SOURCES = BASE.slice(5, 10) // 5 different preview cards (distinct from the starting hand)
// a release and the card laid WITH it — the pair that comes back from the table as
// two separate cards in the hand
const PAIR = ['release-frontend', 'support-code-review']
  .map((id) => cardById(id))
  .filter((c): c is CardType => c != null)

function makeHand(n: number) {
  return BASE.slice(0, n).map((card) => ({ uid: nextHandUid(), card }))
}

export default function CardToHandStory() {
  const { lang } = useLang()
  const [hand, setHand] = useState(() => makeHand(INITIAL_HAND))
  const [used, setUsed] = useState<boolean[]>(() => SOURCES.map(() => false))
  const [pairUsed, setPairUsed] = useState(false)

  const sourceRefs = useRef<(HTMLDivElement | null)[]>([])
  const pairRefs = useRef<(HTMLDivElement | null)[]>([])
  const handRef = useRef<HTMLDivElement>(null)

  const { gapAt, gapSize, overlay, arrive, reset, busy } = useHandArrival(
    handRef,
    (gap, landed) => {
      setHand((h) => {
        const copy = [...h]
        copy.splice(gap, 0, ...landed.map((it) => ({ uid: it.key, card: it.card })))
        return copy
      })
    },
  )

  // one card — the everyday arrival
  function sendOne(i: number) {
    if (busy || used[i]) return
    const r = sourceRefs.current[i]?.getBoundingClientRect()
    if (!r) return
    setUsed((u) => u.map((v, k) => (k === i ? true : v)))
    void arrive([{ key: nextHandUid(), card: SOURCES[i], from: r }], hand.length)
  }

  // two cards — the same movement, the fan just opens twice as wide
  function sendPair() {
    if (busy || pairUsed) return
    const items = PAIR.map((card, i) => {
      const r = pairRefs.current[i]?.getBoundingClientRect()
      return r ? { key: nextHandUid(), card, from: r } : null
    }).filter((it): it is { key: string; card: CardType; from: DOMRect } => it != null)
    if (items.length !== PAIR.length) return
    setPairUsed(true)
    void arrive(items, hand.length)
  }

  function restart() {
    reset()
    setHand(makeHand(INITIAL_HAND))
    setUsed(SOURCES.map(() => false))
    setPairUsed(false)
  }

  return (
    <div className={styles.root}>
      <div className={styles.bar}>
        <button type="button" className={styles.btn} onClick={restart}>
          {pick(lang, { ru: 'рестарт', en: 'restart' })}
        </button>
      </div>

      {/* a pair — both cards arrive at once, into two neighbouring slots */}
      <div className={styles.pair} style={{ opacity: pairUsed ? 0 : 1 }}>
        {PAIR.map((card, i) => (
          <div
            key={card.id}
            ref={(el) => {
              pairRefs.current[i] = el
            }}
          >
            <Card card={card} width={SOURCE_CARD_W} onClick={busy ? undefined : sendPair} />
          </div>
        ))}
      </div>

      {/* single cards: pinned in place; a used one fades, the slot holds its spot */}
      <div className={styles.source}>
        {SOURCES.map((card, i) => (
          <div
            key={card.id}
            ref={(el) => {
              sourceRefs.current[i] = el
            }}
            className={styles.sourceCard}
            style={{ opacity: used[i] ? 0 : 1 }}
          >
            <Card
              card={card}
              width={SOURCE_CARD_W}
              onClick={busy || used[i] ? undefined : () => sendOne(i)}
            />
          </div>
        ))}
      </div>

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
  )
}
