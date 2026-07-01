import type { CardData } from '@release/ui'
import type React from 'react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { jitter, nextFrames, play, wait } from '@/animations'
import { CARDS, cardById } from '@/cards'
import Arrow, { centerOf, useArrow } from '@/primitives/Arrow'
import Card from '@/primitives/Card'
import CardPair from '@/primitives/CardPair'
import Pile from '@/primitives/Pile'
import Hand from '@/table/Hand'
import { pick, useLang } from '../../Playground/lang'
import styles from './DeckAnimationsStory.module.css'

// A scene of deck operations. Triggers — playing cards from the hand (the Hand fan):
// Git Branch — split; Git Branch + Sudo — split + the discard becomes a deck;
// Git Merge — all decks into one; Git Merge + Sudo — the same + the discard.
// Each played card flies hand → center (the playToCenter preset), the effect runs
// there, then the card flies to the discard (centerToDiscard, scattered).

const BASE = CARDS.filter((c) => c.deck === 'base')
const HAND_SPEC: [string, number][] = [
  ['operation-git-branch', 3],
  ['operation-git-merge', 2],
  ['support-sudo', 4],
]
const DISCARD_N = 6
const BRANCH = 'operation-git-branch'
const MERGE = 'operation-git-merge'
const SUDO = 'support-sudo'

interface DrawDeck {
  id: number
  count: number
  hidden?: boolean
}
interface HandItem {
  uid: string
  card: CardData
}
interface DiscardEntry {
  card: CardData // the discard holds SINGLE cards; a combo lands as two entries
  rot: number
  dx: number
  dy: number
}
interface DiscardState {
  cards: DiscardEntry[]
  showCount: boolean
  gathered: boolean
}
interface Rect {
  left: number
  top: number
  width: number
  height: number
}
type Armed =
  | { kind: 'branch'; branch: HandItem; el: HTMLElement }
  | { kind: 'sudo'; sudo: HandItem; el: HTMLElement }
  | { kind: 'branchSudo'; branch: HandItem; sudo: HandItem; el: HTMLElement }
  | null

let deckSeq = 1
const nextDeckId = () => ++deckSeq
let handSeq = 0
const nextUid = () => `h${++handSeq}`

function makeHand(): HandItem[] {
  return HAND_SPEC.flatMap(([id, n]) =>
    // biome-ignore lint/style/noNonNullAssertion: ids from the catalog
    Array.from({ length: n }, () => ({ uid: nextUid(), card: cardById(id)! })),
  )
}

function makeDiscard(): DiscardEntry[] {
  return BASE.slice(0, DISCARD_N).map((card) => ({ card, ...jitter() }))
}

const OPERATION = 'var(--cat-operation)'
const SUPPORT = 'var(--cat-support)'

const FLIP_MS = 520 // the new deck's fly-out on split
const SPLIT_HOLD = 600 // pause after the split before working with the discard
const MERGE_MS = 520
const GATHER_MS = 360
const TURN_MS = 460
const HOLD = 360
const CENTER_HOLD = 420 // pause of the card at the center after the effect before it leaves to the discard

// played cards: one — a plain card; two (a Sudo combo) — a CardPair
// (Sudo tucks under the main one), as on the Combo page
function PlayedCards({ cards }: { cards: CardData[] }) {
  if (cards.length >= 2) {
    const aux = cards.find((c) => c.id === SUDO) ?? cards[0]
    const main = cards.find((c) => c.id !== SUDO) ?? cards[cards.length - 1]
    return <CardPair main={main} aux={aux} width="100%" />
  }
  return <Card card={cards[0]} interactive={false} width="100%" />
}

export default function DeckAnimationsStory() {
  const { lang } = useLang()
  const [decks, setDecks] = useState<DrawDeck[]>([{ id: 1, count: 24 }])
  const [hand, setHand] = useState<HandItem[]>(makeHand)
  const [discard, setDiscard] = useState<DiscardState>({
    cards: makeDiscard(),
    showCount: true,
    gathered: false,
  })
  const [armed, setArmed] = useState<Armed>(null)
  const [hovered, setHovered] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [flyer, setFlyer] = useState<{ card: CardData; faceDown: boolean } | null>(null) // discard
  const [playFlyer, setPlayFlyer] = useState<CardData[] | null>(null) // hand → center (pair/single)
  const [centerCards, setCenterCards] = useState<CardData[]>([]) // cards lying at the center
  // center → discard: each card flies as a separate single (a combo splits)
  const [discardFlyers, setDiscardFlyers] = useState<{ key: string; card: CardData }[]>([])

  const pileRefs = useRef<Record<number, HTMLDivElement | null>>({})
  const discardRef = useRef<HTMLDivElement>(null)
  const flyerRef = useRef<HTMLDivElement>(null)
  const playFlyerRef = useRef<HTMLDivElement>(null)
  const discardFlyerRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const centerRef = useRef<HTMLDivElement>(null)
  const flip = useRef<{ id: number; from: DOMRect } | null>(null)
  const { from, to, aim, stop } = useArrow()

  const choosingDeck = armed?.kind === 'branch' || armed?.kind === 'branchSudo'
  const choosingCard = armed?.kind === 'sudo'
  const armColor = choosingCard ? SUPPORT : OPERATION
  const discardCardCount = discard.cards.length

  // FLIP of the new deck on split: it flies out from the source deck to its spot
  // (the flyFrom preset — a "from the previous rect" animation to the current position)
  useLayoutEffect(() => {
    const f = flip.current
    if (!f) return
    flip.current = null
    play('flyFrom', pileRefs.current[f.id], { from: f.from, duration: FLIP_MS })
  })

  // ===== effects (they don't manage busy — playSequence does) =====

  const split = (id: number) => {
    const src = decks.find((d) => d.id === id)
    if (!src || src.count < 2) return
    const half = Math.floor(src.count / 2)
    const el = pileRefs.current[id]
    const newId = nextDeckId()
    if (el) flip.current = { id: newId, from: el.getBoundingClientRect() }
    setDecks((ds) => [
      ...ds.map((d) => (d.id === id ? { ...d, count: d.count - half } : d)),
      { id: newId, count: half },
    ])
  }

  // shared start of working with the discard: hide the counter → gather into a pile →
  // a face-up flyer at the discard spot. Returns the discard position rect.
  const gatherDiscardToFlyer = useCallback(async (): Promise<DOMRect | undefined> => {
    if (discard.cards.length === 0) return undefined
    const top = discard.cards[discard.cards.length - 1].card
    setDiscard((d) => ({ ...d, showCount: false, gathered: true }))
    await wait(GATHER_MS)
    await wait(HOLD)
    const fromRect = discardRef.current?.getBoundingClientRect()
    setFlyer({ card: top, faceDown: false })
    setDiscard((d) => ({ ...d, cards: [] }))
    await nextFrames()
    const el = flyerRef.current
    if (el && fromRect) {
      el.style.left = `${fromRect.left}px`
      el.style.top = `${fromRect.top}px`
      el.style.width = `${fromRect.width}px`
    }
    return fromRect
  }, [discard.cards])

  // discard → to toRect face up → flip back-up (for "into the deck")
  const runDiscardFlight = useCallback(
    async (toRect: DOMRect) => {
      const fromRect = await gatherDiscardToFlyer()
      if (!fromRect) return
      // Pile has a label under the card, so the cell rect is taller than the card itself —
      // aim at the upper card area (otherwise the landing drifts down and, when the real
      // deck appears, the card teleports up to its spot)
      const aspect = fromRect.height / fromRect.width
      const cardTo = {
        left: toRect.left,
        top: toRect.top,
        width: toRect.width,
        height: toRect.width * aspect,
      }
      const anim = play('gatherToDeck', flyerRef.current, {
        from: fromRect,
        to: cardTo,
        duration: 560,
      })
      if (anim) await anim.finished
      await wait(HOLD)
      setFlyer((f) => (f ? { ...f, faceDown: true } : f))
      await wait(TURN_MS)
      await wait(HOLD)
      setFlyer(null)
    },
    [gatherDiscardToFlyer],
  )

  // flipping the discard into a NEW draw deck
  const flipDiscardToNewDeck = useCallback(async () => {
    if (discard.cards.length === 0) return
    const count = discard.cards.length
    const newId = nextDeckId()
    setDecks((ds) => [...ds, { id: newId, count, hidden: true }])
    await nextFrames()
    const toRect = pileRefs.current[newId]?.getBoundingClientRect()
    if (!toRect) {
      setDecks((ds) => ds.map((d) => (d.id === newId ? { ...d, hidden: false } : d)))
      setDiscard((d) => ({ ...d, cards: [] }))
      return
    }
    await runDiscardFlight(toRect)
    setDecks((ds) => ds.map((d) => (d.id === newId ? { ...d, hidden: false } : d)))
  }, [discard.cards, runDiscardFlight])

  // split (+ with sudo — also the discard into a deck)
  const splitEffect = async (deckId: number) => {
    split(deckId)
    await wait(FLIP_MS + 150)
  }
  const enhancedBranchEffect = async (deckId: number) => {
    split(deckId)
    await wait(SPLIT_HOLD)
    await flipDiscardToNewDeck()
  }

  // merging all decks into one (+ with sudo — the discard flows in); first prepare
  // the discard in place, then all decks AND the discard fly together at once
  const mergeEffect = async (withDiscard: boolean) => {
    const target = decks[0]
    if (!target) return
    const discardCount = withDiscard ? discard.cards.length : 0
    let discardFrom: DOMRect | undefined
    if (discardCount) {
      discardFrom = await gatherDiscardToFlyer()
      setFlyer((f) => (f ? { ...f, faceDown: true } : f))
      await wait(TURN_MS)
      await wait(HOLD)
    }
    const tRect = pileRefs.current[target.id]?.getBoundingClientRect()
    const flights: Promise<unknown>[] = []
    if (tRect) {
      for (const d of decks.slice(1)) {
        const el = pileRefs.current[d.id]
        if (!el) continue
        const r = el.getBoundingClientRect()
        const a = play('absorbToDeck', el, { from: r, to: tRect, duration: MERGE_MS })
        if (a) flights.push(a.finished)
      }
      if (discardCount && discardFrom) {
        const a = play('absorbToDeck', flyerRef.current, {
          from: discardFrom,
          to: tRect,
          duration: MERGE_MS,
        })
        if (a) flights.push(a.finished)
      }
    }
    await Promise.all(flights)
    const total = decks.reduce((s, d) => s + d.count, 0) + discardCount
    setDecks([{ id: target.id, count: total }])
    setFlyer(null)
  }

  // ===== playing a card: hand → center → (effect) → discard =====

  const flyHandToCenter = async (cards: CardData[], fromRect: Rect) => {
    setPlayFlyer(cards)
    await nextFrames()
    const el = playFlyerRef.current
    const toRect = centerRef.current?.getBoundingClientRect()
    if (el && toRect) {
      el.style.left = `${fromRect.left}px`
      el.style.top = `${fromRect.top}px`
      el.style.width = `${fromRect.width}px`
      const anim = play('playToCenter', el, { from: fromRect, to: toRect })
      if (anim) await anim.finished
    }
    setCenterCards(cards)
    setPlayFlyer(null)
  }

  // center → discard: a combo splits, each card flies as a separate single with its
  // own scatter and lands as its own entry (the flight = the finish, discard of singles)
  const flyCenterToDiscard = async (cards: CardData[]) => {
    const fromRect = centerRef.current?.getBoundingClientRect()
    const toRect = discardRef.current?.getBoundingClientRect()
    const entries = cards.map((card) => ({ card, ...jitter() }))
    setDiscardFlyers(entries.map((e, i) => ({ key: `df${i}`, card: e.card })))
    setCenterCards([])
    await nextFrames()
    await Promise.all(
      entries.map((e, i) => {
        const el = discardFlyerRefs.current[`df${i}`]
        if (!el || !fromRect || !toRect) return undefined
        el.style.left = `${fromRect.left}px`
        el.style.top = `${fromRect.top}px`
        el.style.width = `${fromRect.width}px`
        const anim = play('centerToDiscard', el, {
          from: fromRect,
          to: toRect,
          rotate: e.rot,
          dx: e.dx,
          dy: e.dy,
        })
        return anim?.finished
      }),
    )
    setDiscard((d) => ({ cards: [...d.cards, ...entries], showCount: true, gathered: false }))
    setDiscardFlyers([])
  }

  const playSequence = async (played: HandItem[], fromRect: Rect, effect: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    const cards = played.map((p) => p.card)
    const uids = new Set(played.map((p) => p.uid))
    setHand((h) => h.filter((it) => !uids.has(it.uid)))
    await flyHandToCenter(cards, fromRect)
    await effect()
    await wait(CENTER_HOLD)
    await flyCenterToDiscard(cards)
    setBusy(false)
  }

  const cancelAim = useCallback(() => {
    setArmed(null)
    setHovered(null)
    stop()
  }, [stop])

  // playing a card from the hand (Hand gives the index, the card DOM slot and the event)
  const handlePlay = (i: number, cardEl: HTMLElement, e: React.MouseEvent) => {
    e.stopPropagation()
    if (busy) return
    const item = hand[i]
    if (!item) return
    const id = item.card.id
    const rect = cardEl.getBoundingClientRect()
    const aimFromCard = () => aim(centerOf(cardEl), { x: e.clientX, y: e.clientY })

    // Sudo armed → pick a card to enhance (Git Branch / Git Merge)
    if (armed?.kind === 'sudo') {
      const { sudo } = armed
      if (id === BRANCH) {
        if (decks.length <= 1) {
          const deckId = decks[0]?.id
          cancelAim()
          if (deckId != null)
            void playSequence([sudo, item], rect, () => enhancedBranchEffect(deckId))
          return
        }
        setArmed({ kind: 'branchSudo', branch: item, sudo, el: cardEl })
        aimFromCard()
      } else if (id === MERGE) {
        cancelAim()
        void playSequence([sudo, item], rect, () => mergeEffect(true))
      } else {
        cancelAim()
      }
      return
    }

    if (id === SUDO) {
      setArmed({ kind: 'sudo', sudo: item, el: cardEl })
      aimFromCard()
      return
    }

    if (id === BRANCH) {
      if (decks.length <= 1) {
        const deckId = decks[0]?.id
        if (deckId != null) void playSequence([item], rect, () => splitEffect(deckId))
        return
      }
      setArmed({ kind: 'branch', branch: item, el: cardEl })
      aimFromCard()
      return
    }

    if (id === MERGE) {
      if (decks.length >= 2) void playSequence([item], rect, () => mergeEffect(false))
    }
  }

  // while aiming: a click off-target — cancel (cards are not spent)
  useEffect(() => {
    if (!armed) return
    const onDown = () => cancelAim()
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [armed, cancelAim])

  const pickDeck = (e: React.MouseEvent, id: number) => {
    e.stopPropagation()
    if (armed?.kind === 'branch') {
      const { branch, el } = armed
      const rect = el.getBoundingClientRect()
      cancelAim()
      void playSequence([branch], rect, () => splitEffect(id))
    } else if (armed?.kind === 'branchSudo') {
      const { branch, sudo, el } = armed
      const rect = el.getBoundingClientRect()
      cancelAim()
      void playSequence([sudo, branch], rect, () => enhancedBranchEffect(id))
    }
  }

  const reset = () => {
    cancelAim()
    deckSeq = 1
    handSeq = 0
    setDecks([{ id: 1, count: 24 }])
    setHand(makeHand())
    setDiscard({ cards: makeDiscard(), showCount: true, gathered: false })
    setCenterCards([])
    setPlayFlyer(null)
    setDiscardFlyers([])
    setFlyer(null)
    setBusy(false)
  }

  const accentAt = (i: number) =>
    choosingCard && (hand[i]?.card.id === BRANCH || hand[i]?.card.id === MERGE)
      ? SUPPORT
      : undefined

  return (
    <div className={styles.root}>
      <div className={styles.bar}>
        <button type="button" className={styles.btn} onClick={reset}>
          {pick(lang, { ru: 'сброс состояния', en: 'reset state' })}
        </button>
        {choosingDeck && (
          <span className={styles.hint}>
            {pick(lang, { ru: 'выбери колоду для разделения', en: 'pick a deck to split' })}
          </span>
        )}
        {choosingCard && (
          <span className={styles.hint}>
            {pick(lang, { ru: 'выбери карту для усиления', en: 'pick a card to enhance' })}
          </span>
        )}
      </div>

      <div className={styles.decks}>
        {decks.map((d) => (
          // biome-ignore lint/a11y/noStaticElementInteractions: pointer-only deck selection via the arrow; sandbox story
          <div
            key={d.id}
            ref={(el) => {
              pileRefs.current[d.id] = el
            }}
            className={`${styles.deck} ${choosingDeck && !d.hidden ? styles.selectable : ''}`}
            style={d.hidden ? { opacity: 0 } : undefined}
            onMouseDown={choosingDeck && !d.hidden ? (e) => pickDeck(e, d.id) : undefined}
            onMouseEnter={() => choosingDeck && !d.hidden && setHovered(d.id)}
            onMouseLeave={() => setHovered((h) => (h === d.id ? null : h))}
          >
            <Pile
              label={pick(lang, { ru: 'колода', en: 'deck' })}
              deck="base"
              count={d.count}
              width="150px"
              countPos="tl"
              selected={choosingDeck && hovered === d.id}
              accent={OPERATION}
            />
          </div>
        ))}
        <div className={styles.ai}>
          <Pile
            label={pick(lang, { ru: 'события', en: 'events' })}
            deck="ai"
            count={12}
            width="150px"
            countPos="tl"
          />
        </div>
      </div>

      {/* table center — played cards sit here during the effect */}
      <div className={styles.center} ref={centerRef}>
        {centerCards.length > 0 && <PlayedCards cards={centerCards} />}
      </div>

      {/* discard — face up, scattered */}
      <div className={styles.discard}>
        <div className={styles.discardStack} ref={discardRef}>
          {discard.cards.map((entry, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: discard cards are positional, never reordered
              key={i}
              className={styles.discardCard}
              style={{
                transform: discard.gathered
                  ? 'translate(0, 0) rotate(0deg)'
                  : `translate(${entry.dx}px, ${entry.dy}px) rotate(${entry.rot}deg)`,
                zIndex: i,
              }}
            >
              <Card card={entry.card} interactive={false} width="100%" />
            </div>
          ))}
          {discard.showCount && discardCardCount > 0 && (
            <span className={styles.discardCount}>{discardCardCount}</span>
          )}
        </div>
        <div className={styles.label}>{pick(lang, { ru: 'сброс', en: 'discard' })}</div>
      </div>

      {/* player hand — fanned (Hand); clicking a card plays it */}
      <div className={styles.handWrap}>
        <Hand items={hand} onCardClick={handlePlay} accentAt={accentAt} />
      </div>

      {/* the flying discard (single card) */}
      {flyer && (
        <div className={styles.flyer} ref={flyerRef}>
          <Card card={flyer.card} faceDown={flyer.faceDown} interactive={false} width="100%" />
        </div>
      )}

      {/* hand → center: fly as one entry (a single card or a CardPair) */}
      {playFlyer && (
        <div className={styles.playFlyer} ref={playFlyerRef}>
          <PlayedCards cards={playFlyer} />
        </div>
      )}

      {/* center → discard: each card flies as a separate single */}
      {discardFlyers.map((f) => (
        <div
          key={f.key}
          className={styles.playFlyer}
          ref={(el) => {
            discardFlyerRefs.current[f.key] = el
          }}
        >
          <Card card={f.card} interactive={false} width="100%" />
        </div>
      ))}

      {armed && <Arrow from={from} to={to} color={armColor} />}
    </div>
  )
}
