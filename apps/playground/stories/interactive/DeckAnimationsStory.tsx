import type { CardData } from '@release/ui'
import type React from 'react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { jitter, nextFrames, play, wait } from '@/animations'
import { CARDS, cardById } from '@/cards'
import Arrow, { useArrow } from '@/primitives/Arrow'
import Card, { CARD_RATIO } from '@/primitives/Card'
import Pile from '@/primitives/Pile'
import Hand from '@/table/Hand'
import { CARD_W, slotPlacement } from '@/table/Hand/fan'
import type { HandPlayDrop } from '@/table/Hand/Hand'
import { pick, useLang } from '../../Playground/lang'
import styles from './DeckAnimationsStory.module.css'
import { reorderHand } from './reorderHand'
import { useDiscardExit } from './useDiscardExit'
import { useFlyer } from './useFlyer'
import { useHandArrival } from './useHandArrival'

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
// What the staging area at the centre is still waiting for.
type Waiting = 'partner' | 'deck' | null

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

const SPLIT_MS = 520 // the new deck's fly-out on split
const SPLIT_HOLD = 600 // pause after the split before working with the discard
const MERGE_MS = 520
const GATHER_MS = 360
const TURN_MS = 460
const STEP_HOLD = 360 // standard short beat between deck steps
const CENTER_HOLD = 420 // pause of the card at the center after the effect before it leaves to the discard

export default function DeckAnimationsStory() {
  const { lang } = useLang()
  const [decks, setDecks] = useState<DrawDeck[]>([{ id: 1, count: 24 }])
  const [hand, setHand] = useState<HandItem[]>(makeHand)
  const [discard, setDiscard] = useState<DiscardState>({
    cards: makeDiscard(),
    showCount: true,
    gathered: false,
  })
  // the staging area at the centre: `stageSize` is how many cards this play needs
  // (Sudo always needs a partner → 2), `staged` are the ones already standing there
  const [stageSize, setStageSize] = useState(0)
  const [staged, setStaged] = useState<HandItem[]>([])
  const [hovered, setHovered] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  const pileRefs = useRef<Record<number, HTMLDivElement | null>>({})
  const discardRef = useRef<HTMLDivElement>(null)
  // the two cards this scene puts in the air: the discard pile on its way to a deck
  // ('pile') and the card played from the fan into a stage slot ('play')
  const { overlay: flyerOverlay, raise, patch, drop, elOf } = useFlyer()
  const centerRef = useRef<HTMLDivElement>(null)
  const stageRefs = useRef<(HTMLDivElement | null)[]>([])
  const handWrapRef = useRef<HTMLDivElement>(null)
  const flip = useRef<{ id: number; from: DOMRect } | null>(null)
  const { from, to, aim, stop } = useArrow()
  const { overlay: discardOverlay, send: sendToDiscard } = useDiscardExit(discardRef, (cards) =>
    setDiscard((d) => ({ cards: [...d.cards, ...cards], showCount: true, gathered: false })),
  )
  // cancel: the whole staging flies back into the fan at once, the fan opening
  // room for it while the cards travel
  const {
    overlay: returnOverlay,
    gapAt: returnGap,
    gapSize: returnSize,
    arrive: returnToHand,
    reset: resetReturn,
  } = useHandArrival(handWrapRef, (gap, landed) =>
    setHand((h) => {
      const next = h.slice()
      next.splice(gap, 0, ...landed.map((it) => ({ uid: it.key, card: it.card })))
      return next
    }),
  )

  // what the staging still needs before the play can resolve
  const waiting: Waiting = (() => {
    if (stageSize === 0 || busy) return null
    if (staged.length < stageSize) return 'partner'
    if (staged.some((s) => s.card.id === BRANCH) && decks.length > 1) return 'deck'
    return null
  })()
  // read inside handlers that run after an await / from a captured closure (I8)
  const waitingRef = useRef<Waiting>(null)
  waitingRef.current = waiting
  const stagedRef = useRef<HandItem[]>([])
  stagedRef.current = staged

  const choosingDeck = waiting === 'deck'
  const choosingCard = waiting === 'partner'
  const armColor = choosingCard ? SUPPORT : OPERATION

  // FLIP of the new deck on split: it flies out from the source deck to its spot
  // (the flyFrom preset — a "from the previous rect" animation to the current position)
  useLayoutEffect(() => {
    const f = flip.current
    if (!f) return
    flip.current = null
    play('flyFrom', pileRefs.current[f.id], { from: f.from, duration: SPLIT_MS })
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
    await wait(STEP_HOLD)
    const fromRect = discardRef.current?.getBoundingClientRect()
    if (!fromRect) return undefined
    const raised = raise([{ key: 'pile', card: top, at: fromRect }])
    setDiscard((d) => ({ ...d, cards: [] }))
    await raised
    return fromRect
  }, [discard.cards, raise])

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
      const anim = play('gatherToDeck', elOf('pile'), {
        from: fromRect,
        to: cardTo,
        duration: 560,
      })
      if (anim) await anim.finished
      await wait(STEP_HOLD)
      patch('pile', { faceDown: true })
      await wait(TURN_MS)
      await wait(STEP_HOLD)
      drop('pile')
    },
    [gatherDiscardToFlyer, elOf, patch, drop],
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
    await wait(SPLIT_MS + 150)
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
      patch('pile', { faceDown: true })
      await wait(TURN_MS)
      await wait(STEP_HOLD)
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
        const a = play('absorbToDeck', elOf('pile'), {
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
    drop('pile')
  }

  // ===== playing a card: hand → center → (effect) → discard =====

  // hand → a slot of the staging area. This IS the play flight: the card ends up
  // standing where it will be played, so nothing has to fly again on commit.
  const flyToStage = async (item: HandItem, fromRect: Rect, slot: number) => {
    // raising also lets the stage slots mount before they are measured
    const [el] = await raise([{ key: 'play', card: item.card, at: fromRect }])
    const toRect = stageRefs.current[slot]?.getBoundingClientRect()
    if (el && toRect) {
      const anim = play('playToCenter', el, { from: fromRect, to: toRect })
      if (anim) await anim.finished
    }
    setStaged((s) => [...s, item])
    drop('play')
  }

  // stage → discard: through the shared exit step — every staged card flies from
  // ITS OWN slot as a single, all at once
  const flyStageToDiscard = async (items: HandItem[]) => {
    const leaving = items
      .map((it, i) => ({
        key: `df${i}`,
        card: it.card,
        from: stageRefs.current[i]?.getBoundingClientRect(),
      }))
      .filter((e): e is { key: string; card: CardData; from: DOMRect } => e.from != null)
    setStaged([])
    await sendToDiscard(leaving)
  }

  // the staged cards are complete and the target is known — run the effect and
  // clear the stage into the discard. The cards are already at the centre.
  const resolveStage = async (effect: () => Promise<void>) => {
    setBusy(true)
    setHovered(null)
    stop() // the arrow is done
    const items = stagedRef.current
    await effect()
    await wait(CENTER_HOLD)
    await flyStageToDiscard(items)
    setStageSize(0)
    setBusy(false)
  }

  // the player pointed at nothing valid — the whole staging is taken back. The
  // cards are NOT spent, but the table saw them: they were open at the centre.
  const cancelStage = useCallback(async () => {
    const items = stagedRef.current
    setHovered(null)
    stop()
    if (items.length === 0) {
      setStageSize(0)
      return
    }
    // I1 — measure the slots BEFORE they unmount, or there is nothing to fly from
    const leaving = items.map((it, i) => ({
      key: it.uid, // its identity travels with it — the step hands it back on landing
      card: it.card,
      from: stageRefs.current[i]?.getBoundingClientRect(),
    }))
    const flight = returnToHand(leaving, hand.length)
    setStageSize(0)
    setStaged([])
    await flight
  }, [hand.length, stop, returnToHand])

  // GESTURE RULE — pulling a card OUT of the fan puts it INTO the turn: it flies
  // to the staging area at the centre, open for everyone. Picking what it acts on
  // is a CLICK (a hand card, a deck). A second card of a combo is therefore
  // clicked, not pulled: while something is staged, a pull-out is rejected.
  const handPlay = (uid: string, dropped: HandPlayDrop): boolean => {
    if (busy || stageSize > 0) return false
    const item = hand.find((it) => it.uid === uid)
    const rect = dropped.rect
    if (!item || !rect) return false
    const id = item.card.id
    const take = (size: number) => {
      setStageSize(size)
      setHand((h) => h.filter((it) => it.uid !== uid))
    }

    if (id === SUDO) {
      take(2) // Sudo never plays alone — the empty second slot says so
      void flyToStage(item, rect, 0).then(() => {
        const r = stageRefs.current[0]?.getBoundingClientRect()
        if (r) aim({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, dropped)
      })
      return true
    }

    if (id === BRANCH) {
      take(1)
      void flyToStage(item, rect, 0).then(() => {
        const only = decks.length <= 1 ? decks[0]?.id : undefined
        if (only != null) return resolveStage(() => splitEffect(only))
        const r = stageRefs.current[0]?.getBoundingClientRect()
        if (r) aim({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, dropped)
      })
      return true
    }

    if (id === MERGE && decks.length >= 2) {
      take(1)
      void flyToStage(item, rect, 0).then(() => resolveStage(() => mergeEffect(false)))
      return true
    }
    return false
  }

  // the staging waits for a partner — a click on a hand card answers it
  const pickPartner = (i: number) => {
    if (waitingRef.current !== 'partner') return
    const item = hand[i]
    const el = handWrapRef.current
    if (!item || !el) return
    const id = item.card.id
    if (id !== BRANCH && id !== MERGE) return void cancelStage() // can't be enhanced
    // I6 — the source is the card box of the fan slot, computed from the fan
    // geometry: a slot is rotated, so its bounding rect is the box AROUND the
    // tilted card and a flight started from it jumps on the first frame
    const hr = el.getBoundingClientRect()
    const base = slotPlacement(i, hand.length)
    const height = CARD_W * CARD_RATIO
    const rect: Rect = {
      left: hr.left + hr.width / 2 + base.x - CARD_W / 2,
      top: hr.bottom + base.y - height,
      width: CARD_W,
      height,
    }
    setHand((h) => h.filter((it) => it.uid !== item.uid))
    void flyToStage(item, rect, 1).then(() => {
      if (id === MERGE) return resolveStage(() => mergeEffect(true))
      const only = decks.length <= 1 ? decks[0]?.id : undefined
      if (only != null) return resolveStage(() => enhancedBranchEffect(only))
      const r = stageRefs.current[1]?.getBoundingClientRect()
      if (r) aim({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, { x: r.left, y: r.top })
    })
  }

  // a press on nothing valid cancels the staging (cards go back to the hand).
  // Presses on a deck and inside the hand stop propagation — they are answers.
  useEffect(() => {
    if (!waiting) return
    const onDown = () => void cancelStage()
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [waiting, cancelStage])

  const pickDeck = (e: React.MouseEvent, id: number) => {
    e.stopPropagation()
    if (waitingRef.current !== 'deck') return
    const withSudo = stagedRef.current.some((s) => s.card.id === SUDO)
    void resolveStage(() => (withSudo ? enhancedBranchEffect(id) : splitEffect(id)))
  }

  const reset = () => {
    stop()
    setHovered(null)
    deckSeq = 1
    handSeq = 0
    setDecks([{ id: 1, count: 24 }])
    setHand(makeHand())
    setDiscard({ cards: makeDiscard(), showCount: true, gathered: false })
    setStageSize(0)
    setStaged([])
    drop('play')
    resetReturn()
    drop() // every card still in the air comes down
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
              width={150}
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
            width={150}
            countPos="tl"
          />
        </div>
      </div>

      {/* the staging area at the centre — the cards put into this turn stand here,
          open to the table. An empty slot is the ask: Sudo opens two, so the gap
          next to it says a second card is expected. */}
      {stageSize > 0 && (
        <div className={styles.center} ref={centerRef}>
          {Array.from({ length: stageSize }, (_, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: the slots are a fixed row, the index IS the slot
              key={i}
              className={styles.stageSlot}
              ref={(el) => {
                stageRefs.current[i] = el
              }}
            >
              {staged[i] ? (
                <Card card={staged[i].card} interactive={false} width="100%" />
              ) : (
                <span className={styles.stageEmpty} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* discard — face up, scattered */}
      <div className={styles.discard}>
        <Pile
          heap={discard.cards}
          count={discard.showCount ? discard.cards.length : 0}
          gathered={discard.gathered}
          width={116}
          boxRef={discardRef}
          logoVariant={lang}
          label={pick(lang, { ru: 'сброс', en: 'discard' })}
        />
      </div>

      {/* player hand — fanned (Hand); a card is played by pulling it OUT of the
          fan. A card that still needs a target glides back into its slot and
          waits there while the arrow aims. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: pointer-only guard so a press in the fan doesn't cancel an aim; the Hand owns the real interaction */}
      <div className={styles.handWrap} ref={handWrapRef} onMouseDown={(e) => e.stopPropagation()}>
        <Hand
          items={hand}
          gapAt={returnGap}
          gapSize={returnSize}
          onPlay={handPlay}
          accentAt={accentAt}
          // a click answers the staging (choose the card Sudo enhances); a pull
          // out of the fan puts a card into the turn — the two never collide
          onCardClick={waiting === 'partner' ? pickPartner : undefined}
          onReorder={(cardUid, toIndex) => setHand((h) => reorderHand(h, cardUid, toIndex))}
        />
      </div>

      {/* every card this scene has in the air — the shared carrier */}
      {flyerOverlay}

      {returnOverlay}

      {discardOverlay}

      {waiting && <Arrow from={from} to={to} color={armColor} />}
    </div>
  )
}
