import type { CardData } from '@release/ui'
import type React from 'react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { play } from '@/animations'
import { CARDS, cardById } from '@/cards'
import Arrow, { centerOf, useArrow } from '@/primitives/Arrow'
import Card from '@/primitives/Card'
import CardPair from '@/primitives/CardPair'
import Pile from '@/primitives/Pile'
import Hand from '@/table/Hand'
import styles from './DeckAnimationsStory.module.css'

// Сцена операций над колодами. Триггеры — розыгрыш карт из руки (веер Hand):
// Git Branch — разделение; Git Branch + Sudo — разделение + сброс становится
// колодой; Git Merge — все колоды в одну; Git Merge + Sudo — то же + сброс.
// Каждая разыгранная карта летит рука → центр (пресет playToCenter), там
// отрабатывает эффект, затем карта летит в сброс (centerToDiscard, вразброс).

const BASE = CARDS.filter((c) => c.deck === 'base')
const HAND_SPEC: Array<[string, number]> = [
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
  cards: CardData[] // 1 карта или пара (комбо с Sudo) — рендерится через PlayedCards
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
    // biome-ignore lint/style/noNonNullAssertion: id-ы из каталога
    Array.from({ length: n }, () => ({ uid: nextUid(), card: cardById(id)! })),
  )
}

// разброс карты в сбросе
const jitter = () => ({
  rot: (Math.random() * 2 - 1) * 14,
  dx: (Math.random() * 2 - 1) * 10,
  dy: (Math.random() * 2 - 1) * 8,
})
function makeDiscard(): DiscardEntry[] {
  return BASE.slice(0, DISCARD_N).map((card) => ({ cards: [card], ...jitter() }))
}
const countCards = (entries: DiscardEntry[]) => entries.reduce((s, e) => s + e.cards.length, 0)

const OPERATION = 'var(--cat-operation)'
const SUPPORT = 'var(--cat-support)'
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)'

const FLIP_MS = 520 // разлёт новой колоды при разделении
const SPLIT_HOLD = 600 // пауза после разделения перед работой со сбросом
const MERGE_MS = 520
const GATHER_MS = 360
const TURN_MS = 460
const HOLD = 360
const CENTER_HOLD = 420 // пауза карты в центре после эффекта перед уходом в сброс

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const nextFrames = () =>
  new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))

// разыгранные карты: одна — обычная карта; две (комбо с Sudo) — пара CardPair
// (Sudo подтыкается под основную), как на странице Combo
function PlayedCards({ cards }: { cards: CardData[] }) {
  if (cards.length >= 2) {
    const aux = cards.find((c) => c.id === SUDO) ?? cards[0]
    const main = cards.find((c) => c.id !== SUDO) ?? cards[cards.length - 1]
    return <CardPair main={main} aux={aux} width="100%" />
  }
  return <Card card={cards[0]} interactive={false} width="100%" />
}

export default function DeckAnimationsStory() {
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
  const [flyer, setFlyer] = useState<{ card: CardData; faceDown: boolean } | null>(null) // сброс
  const [playFlyer, setPlayFlyer] = useState<CardData[] | null>(null) // разыгранные карты в полёте
  const [centerCards, setCenterCards] = useState<CardData[]>([]) // карты, лежащие в центре

  const pileRefs = useRef<Record<number, HTMLDivElement | null>>({})
  const discardRef = useRef<HTMLDivElement>(null)
  const flyerRef = useRef<HTMLDivElement>(null)
  const playFlyerRef = useRef<HTMLDivElement>(null)
  const centerRef = useRef<HTMLDivElement>(null)
  const flip = useRef<{ id: number; from: DOMRect } | null>(null)
  const { from, to, aim, stop } = useArrow()

  const choosingDeck = armed?.kind === 'branch' || armed?.kind === 'branchSudo'
  const choosingCard = armed?.kind === 'sudo'
  const armColor = choosingCard ? SUPPORT : OPERATION
  const discardCardCount = countCards(discard.cards)

  // FLIP новой колоды при разделении: вылетает из колоды-источника на своё место
  useLayoutEffect(() => {
    const f = flip.current
    if (!f) return
    flip.current = null
    const el = pileRefs.current[f.id]
    if (!el) return
    const rect = el.getBoundingClientRect()
    el.animate(
      [
        { transform: `translate(${f.from.left - rect.left}px, ${f.from.top - rect.top}px)` },
        { transform: 'translate(0, 0)' },
      ],
      { duration: FLIP_MS, easing: EASE },
    )
  })

  // ===== эффекты (без управления busy — им управляет playSequence) =====

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

  // общий старт работы со сбросом: скрыть счётчик → собрать в стопку → флайер
  // лицом вверх на месте сброса. Возвращает rect позиции сброса.
  const gatherDiscardToFlyer = useCallback(async (): Promise<DOMRect | undefined> => {
    if (discard.cards.length === 0) return undefined
    const top = discard.cards[discard.cards.length - 1].cards[0]
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

  // сброс → к toRect лицом вверх → перевернуть рубашкой вверх (для «в колоду»)
  const runDiscardFlight = useCallback(
    async (toRect: DOMRect) => {
      const fromRect = await gatherDiscardToFlyer()
      if (!fromRect) return
      const el = flyerRef.current
      if (el) {
        const dx = toRect.left - fromRect.left
        const dy = toRect.top - fromRect.top
        const sc = toRect.width / fromRect.width
        await el.animate(
          [
            { transform: 'translate(0, 0) scale(1)' },
            { transform: `translate(${dx}px, ${dy}px) scale(${sc})` },
          ],
          { duration: 560, easing: EASE, fill: 'forwards' },
        ).finished
      }
      await wait(HOLD)
      setFlyer((f) => (f ? { ...f, faceDown: true } : f))
      await wait(TURN_MS)
      await wait(HOLD)
      setFlyer(null)
    },
    [gatherDiscardToFlyer],
  )

  // переворот сброса в НОВУЮ колоду добора
  const flipDiscardToNewDeck = useCallback(async () => {
    if (discard.cards.length === 0) return
    const count = countCards(discard.cards)
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

  // разделение (+ при sudo — ещё и сброс в колоду)
  const splitEffect = async (deckId: number) => {
    split(deckId)
    await wait(FLIP_MS + 150)
  }
  const enhancedBranchEffect = async (deckId: number) => {
    split(deckId)
    await wait(SPLIT_HOLD)
    await flipDiscardToNewDeck()
  }

  // слияние всех колод в одну (+ при sudo — сброс вливается); сперва готовим
  // сброс на месте, затем все колоды И сброс слетаются одновременно
  const mergeEffect = async (withDiscard: boolean) => {
    const target = decks[0]
    if (!target) return
    const discardCount = withDiscard ? countCards(discard.cards) : 0
    let discardFrom: DOMRect | undefined
    if (discardCount) {
      discardFrom = await gatherDiscardToFlyer()
      setFlyer((f) => (f ? { ...f, faceDown: true } : f))
      await wait(TURN_MS)
      await wait(HOLD)
    }
    const tRect = pileRefs.current[target.id]?.getBoundingClientRect()
    const flights: Array<Promise<unknown>> = []
    if (tRect) {
      for (const d of decks.slice(1)) {
        const el = pileRefs.current[d.id]
        if (!el) continue
        const r = el.getBoundingClientRect()
        flights.push(
          el.animate(
            [
              { transform: 'translate(0, 0) scale(1)', opacity: 1 },
              {
                transform: `translate(${tRect.left - r.left}px, ${tRect.top - r.top}px) scale(0.96)`,
                opacity: 0,
              },
            ],
            { duration: MERGE_MS, easing: EASE, fill: 'forwards' },
          ).finished,
        )
      }
      const fel = flyerRef.current
      if (discardCount && discardFrom && fel) {
        flights.push(
          fel.animate(
            [
              { transform: 'translate(0, 0) scale(1)', opacity: 1 },
              {
                transform: `translate(${tRect.left - discardFrom.left}px, ${tRect.top - discardFrom.top}px) scale(0.96)`,
                opacity: 0,
              },
            ],
            { duration: MERGE_MS, easing: EASE, fill: 'forwards' },
          ).finished,
        )
      }
    }
    await Promise.all(flights)
    const total = decks.reduce((s, d) => s + d.count, 0) + discardCount
    setDecks([{ id: target.id, count: total }])
    setFlyer(null)
  }

  // ===== розыгрыш карты: рука → центр → (эффект) → сброс =====

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

  const flyCenterToDiscard = async (cards: CardData[]) => {
    const fromRect = centerRef.current?.getBoundingClientRect()
    const toRect = discardRef.current?.getBoundingClientRect()
    const j0 = jitter()
    setPlayFlyer(cards)
    setCenterCards([])
    await nextFrames()
    const el = playFlyerRef.current
    if (el && fromRect && toRect) {
      el.style.left = `${fromRect.left}px`
      el.style.top = `${fromRect.top}px`
      el.style.width = `${fromRect.width}px`
      const anim = play('centerToDiscard', el, {
        from: fromRect,
        to: toRect,
        rotate: j0.rot,
        dx: j0.dx,
        dy: j0.dy,
      })
      if (anim) await anim.finished
    }
    // разыгранные карты ложатся в сброс ОДНОЙ записью (1 карта или пара) — тем же
    // представлением, что и в полёте; чтобы финал совпал с анимацией
    setDiscard((d) => ({
      cards: [...d.cards, { cards, rot: j0.rot, dx: j0.dx, dy: j0.dy }],
      showCount: true,
      gathered: false,
    }))
    setPlayFlyer(null)
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

  // розыгрыш карты из руки (Hand отдаёт индекс, DOM-слот карты и событие)
  const handlePlay = (i: number, cardEl: HTMLElement, e: React.MouseEvent) => {
    e.stopPropagation()
    if (busy) return
    const item = hand[i]
    if (!item) return
    const id = item.card.id
    const rect = cardEl.getBoundingClientRect()
    const aimFromCard = () => aim(centerOf(cardEl), { x: e.clientX, y: e.clientY })

    // Sudo в прицеле → выбираем карту для усиления (Git Branch / Git Merge)
    if (armed?.kind === 'sudo') {
      const { sudo } = armed
      if (id === BRANCH) {
        if (decks.length <= 1) {
          const deckId = decks[0]?.id
          cancelAim()
          if (deckId != null) playSequence([sudo, item], rect, () => enhancedBranchEffect(deckId))
          return
        }
        setArmed({ kind: 'branchSudo', branch: item, sudo, el: cardEl })
        aimFromCard()
      } else if (id === MERGE) {
        cancelAim()
        playSequence([sudo, item], rect, () => mergeEffect(true))
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
        if (deckId != null) playSequence([item], rect, () => splitEffect(deckId))
        return
      }
      setArmed({ kind: 'branch', branch: item, el: cardEl })
      aimFromCard()
      return
    }

    if (id === MERGE) {
      if (decks.length >= 2) playSequence([item], rect, () => mergeEffect(false))
    }
  }

  // во время прицеливания: клик мимо цели — отмена (карты не тратятся)
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
      playSequence([branch], rect, () => splitEffect(id))
    } else if (armed?.kind === 'branchSudo') {
      const { branch, sudo, el } = armed
      const rect = el.getBoundingClientRect()
      cancelAim()
      playSequence([sudo, branch], rect, () => enhancedBranchEffect(id))
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
          сброс состояния
        </button>
        {choosingDeck && <span className={styles.hint}>выбери колоду для разделения</span>}
        {choosingCard && <span className={styles.hint}>выбери карту для усиления</span>}
      </div>

      <div className={styles.decks}>
        {decks.map((d) => (
          // biome-ignore lint/a11y/noStaticElementInteractions: pointer-only выбор колоды стрелкой; sandbox story
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
              label="колода"
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
          <Pile label="события" deck="ai" count={12} width="150px" countPos="tl" />
        </div>
      </div>

      {/* центр стола — разыгранные карты лежат тут на время эффекта */}
      <div className={styles.center} ref={centerRef}>
        {centerCards.length > 0 && <PlayedCards cards={centerCards} />}
      </div>

      {/* сброс — лицом вверх, вразброс */}
      <div className={styles.discard}>
        <div className={styles.discardStack} ref={discardRef}>
          {discard.cards.map((entry, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: сброс — позиционные карты, не переставляются
              key={i}
              className={styles.discardCard}
              style={{
                transform: discard.gathered
                  ? 'translate(0, 0) rotate(0deg)'
                  : `translate(${entry.dx}px, ${entry.dy}px) rotate(${entry.rot}deg)`,
                zIndex: i,
              }}
            >
              <PlayedCards cards={entry.cards} />
            </div>
          ))}
          {discard.showCount && discardCardCount > 0 && (
            <span className={styles.discardCount}>{discardCardCount}</span>
          )}
        </div>
        <div className={styles.label}>сброс</div>
      </div>

      {/* рука игрока — веером (Hand); клик по карте разыгрывает */}
      <div className={styles.handWrap}>
        <Hand items={hand} onCardClick={handlePlay} accentAt={accentAt} />
      </div>

      {/* летящий сброс (одна карта) */}
      {flyer && (
        <div className={styles.flyer} ref={flyerRef}>
          <Card card={flyer.card} faceDown={flyer.faceDown} interactive={false} width="100%" />
        </div>
      )}

      {/* летящие разыгранные карты (одна или пара CardPair) */}
      {playFlyer && (
        <div className={styles.playFlyer} ref={playFlyerRef}>
          <PlayedCards cards={playFlyer} />
        </div>
      )}

      {armed && <Arrow from={from} to={to} color={armColor} />}
    </div>
  )
}
