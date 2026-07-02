import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { nextFrames, play, wait } from '@/animations'
import { CARDS, cardById } from '@/cards'
import type { Card as CardType } from '@/cards/types'
import Card, { cardAreaOf, cardBoxIn } from '@/primitives/Card'
import EdgeGlow from '@/primitives/EdgeGlow'
import Pile from '@/primitives/Pile'
import Hand from '@/table/Hand'
import type { HandItem } from '@/table/Hand/Hand'
import type { ReleaseSlots } from '@/table/ReleaseZone/ReleaseZone'
import Seat from '@/table/Seat'
import { SEAT_COPY_EN, SEAT_COPY_RU } from '@/table/Seat/Seat'
import { type Lang, pick, useLang } from '../../Playground/lang'
import HoverSelect from '../controls/HoverSelect'
import styles from './DrawCardStory.module.css'
import { useHandInsert } from './useHandInsert'

type Loc = Record<Lang, string>

// A "draw a card from the deck" scene. Single draw:
//   deck → center (back-up) → branch.
//   ordinary card → target: player (flip + settles into the hand) / opponent
//     (back-up to their seat, dealToSeat);
//   trigger (Error 503 / AI) → flips at the center FOR EVERYONE and stays;
//     AI — additionally draws a card from the nearby AI deck (the effect is the logic side).
// Multi-draw — the next stage.

const BASE = CARDS.filter((c) => c.deck === 'base')
const AI_DECK = CARDS.filter((c) => c.deck === 'ai')
const AI_HOLD = 4000 // table hold while the AI effect is revealed (4s)
const FLIP_MS = 420 // flipCard duration — let the in-place flip play

const ERROR_503 = 'trigger-error-503'
const AI_TRIGGER = 'trigger-ai'
// "random ordinary" is drawn from this pool (3 arbitrary ordinary cards)
const ORDINARY_POOL = ['attack-security-bug', 'operation-git-branch', 'release-frontend']

type Forced = 'error503' | 'ai' | 'ordinary'
const FORCED_OPTIONS: { value: Forced; label: Loc }[] = [
  { value: 'error503', label: { ru: 'Error 503', en: 'Error 503' } },
  { value: 'ai', label: { ru: 'AI-триггер', en: 'AI trigger' } },
  { value: 'ordinary', label: { ru: 'случайная обычная', en: 'random ordinary' } },
]
const DECK_COUNTS = [1, 2, 3, 4]

const EMPTY_RELEASE: ReleaseSlots = { frontend: undefined, backend: undefined, database: undefined }

interface Opp {
  id: string
  name: string
  handCount: number
}
const INITIAL_OPPONENTS: Opp[] = [
  { id: 'p2', name: 'kernel_panic', handCount: 5 },
  { id: 'p3', name: 'segfault', handCount: 7 },
]

let uidSeq = 0
const nextUid = () => `d${++uidSeq}`
const makeHand = (): HandItem[] => BASE.slice(0, 6).map((card, i) => ({ uid: `h${i}`, card }))

function resolveForced(forced: Forced): CardType | undefined {
  if (forced === 'error503') return cardById(ERROR_503)
  if (forced === 'ai') return cardById(AI_TRIGGER)
  return cardById(ORDINARY_POOL[Math.floor(Math.random() * ORDINARY_POOL.length)])
}
const resolveAiCard = (): CardType | undefined =>
  AI_DECK[Math.floor(Math.random() * AI_DECK.length)]

// non-trigger draw cards (for the other multi-draw positions — just into the hand)
const NON_TRIGGER = BASE.filter((c) => c.category !== 'trigger')
const randomNonTrigger = (): CardType => NON_TRIGGER[Math.floor(Math.random() * NON_TRIGGER.length)]

export default function DrawCardStory() {
  const { lang } = useLang()
  const [deckCount, setDeckCount] = useState(1)
  const [forced, setForced] = useState<Forced>('ordinary')
  const [forcedAt, setForcedAt] = useState(1) // on which draw the forced card shows up
  const [drawer, setDrawer] = useState('you')
  const [opponents, setOpponents] = useState<Opp[]>(INITIAL_OPPONENTS)
  const [hand, setHand] = useState<HandItem[]>(makeHand)
  // seq — flight id: different flights = different flyer keys so React
  // doesn't reuse the Card (otherwise a faceDown change spins a flip mid-flight)
  const [flyer, setFlyer] = useState<{ card: CardType; faceDown: boolean; seq: number } | null>(
    null,
  )
  const [centerCard, setCenterCard] = useState<CardType | null>(null) // the revealed trigger at the center
  const [aiCard, setAiCard] = useState<CardType | null>(null) // the card from the nearby AI deck
  const [discard, setDiscard] = useState<{ top: CardType | null; count: number }>({
    top: null,
    count: 0,
  })
  // cards leaving on AI resolution (trigger → discard, effect → deck)
  const [outs, setOuts] = useState<{ key: string; card: CardType; faceDown: boolean }[]>([])
  // red edge glow on Error 503 (full-screen): self — you drew
  // (large, UNDER the hand); other — the opponent drew (small, OVER the hand, non-blocking)
  const [alert, setAlert] = useState<'self' | 'other' | null>(null)
  const [busy, setBusy] = useState(false)

  const nextCard = useMemo(() => resolveForced(forced), [forced])

  const deckRefs = useRef<Record<number, HTMLDivElement | null>>({})
  const seatRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const centerRef = useRef<HTMLDivElement>(null) // staging / Error 503 — at the center
  const causeRef = useRef<HTMLDivElement>(null) // AI trigger (cause) — on the left, normal size
  const effectRef = useRef<HTMLDivElement>(null) // AI effect (main) — larger, at the center
  const aiRef = useRef<HTMLDivElement>(null)
  const discardRef = useRef<HTMLDivElement>(null)
  const flyerRef = useRef<HTMLDivElement>(null)
  const outRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const handRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const flightSeq = useRef(0)

  // the tech-bar height — so the edge glow lives in the TABLE zone (under the bar),
  // not across the whole screen (otherwise table edge = screen edge, ignoring tech elements)
  const [barH, setBarH] = useState(0)
  useLayoutEffect(() => {
    if (barRef.current) setBarH(barRef.current.offsetHeight)
  }, [])

  const {
    gapAt,
    overlay,
    insert,
    reset: resetInsert,
  } = useHandInsert(handRef, (card, gap) => {
    setHand((h) => {
      const copy = [...h]
      copy.splice(gap, 0, { uid: nextUid(), card })
      return copy
    })
  })

  const drawerOptions = [
    { value: 'you', label: pick(lang, { ru: 'игрок', en: 'player' }) },
    ...opponents.map((o) => ({ value: o.id, label: o.name })),
  ]

  // player: stop at the center → flip face up → settles into the hand
  const toPlayerHand = async (card: CardType) => {
    await wait(220)
    setFlyer((f) => (f ? { ...f, faceDown: false } : f))
    await wait(560) // let flipCard play (420) + a pause
    const r = flyerRef.current?.getBoundingClientRect()
    setFlyer(null)
    if (r) insert(card, { left: r.left, top: r.top, width: r.width, height: r.height }, hand.length)
  }

  // opponent: goes to their seat back-up and sinks into the hidden hand
  const toOpponent = async (oppId: string) => {
    await wait(160)
    const el = flyerRef.current
    const seatRect = seatRefs.current[oppId]?.getBoundingClientRect()
    const fromRect = el?.getBoundingClientRect()
    if (el && seatRect && fromRect) {
      // aim at the card area near the opponent's seat with a slight shrink
      // (not at the wide Seat — otherwise the card inflates to its width)
      const to = cardBoxIn(seatRect, fromRect.width * 0.7)
      const anim = play('dealToSeat', el, { from: fromRect, to })
      if (anim) await anim.finished
    }
    setOpponents((os) => os.map((o) => (o.id === oppId ? { ...o, handCount: o.handCount + 1 } : o)))
    setFlyer(null)
  }

  // trigger (Error 503 / AI): flips at the center for everyone and stays
  const revealForAll = async (card: CardType) => {
    await wait(220)
    setFlyer((f) => (f ? { ...f, faceDown: false } : f))
    await wait(560) // let flipCard play + a pause
    setCenterCard(card) // the card stays revealed at the center
    setFlyer(null)
  }

  // AI: a card is drawn from the AI deck to the center AS THE MAIN one — larger than the trigger
  // (the trigger meanwhile stands on the left as the cause). The effect is the logic side, later.
  const drawAiEffect = async (): Promise<CardType | undefined> => {
    const ai = resolveAiCard()
    const aiCell = aiRef.current?.getBoundingClientRect()
    const toRect = effectRef.current?.getBoundingClientRect()
    if (!ai) return undefined
    setFlyer({ card: ai, faceDown: true, seq: ++flightSeq.current })
    await nextFrames()
    const el = flyerRef.current
    if (el && aiCell && toRect) {
      const from = cardAreaOf(aiCell)
      el.style.left = `${from.left}px`
      el.style.top = `${from.top}px`
      el.style.width = `${from.width}px`
      // aim at the large effect slot — the card arrives enlarged
      const anim = play('drawToCenter', el, { from, to: toRect })
      if (anim) await anim.finished
      for (const a of el.getAnimations()) a.cancel()
      el.style.left = `${toRect.left}px`
      el.style.top = `${toRect.top}px`
      el.style.width = `${toRect.width}px`
    }
    await wait(160)
    setFlyer((f) => (f ? { ...f, faceDown: false } : f))
    await wait(560)
    setAiCard(ai)
    setFlyer(null)
    return ai
  }

  // the trigger leaves to the discard (as it was, face up)
  const leaveTrigger = async (fromRect?: DOMRect, discardRect?: DOMRect) => {
    const el = outRefs.current.trig
    if (!el || !fromRect || !discardRect) return
    const anim = play('centerToDiscard', el, { from: fromRect, to: cardAreaOf(discardRect) })
    if (anim) await anim.finished
  }

  // the effect first flips back-up IN PLACE (consistent with cards entering
  // play), and that delay separates the trajectories; then it returns to the AI deck
  // shrinking to the deck size (returnToDeck)
  const leaveEffect = async (fromRect?: DOMRect, deckRect?: DOMRect) => {
    setOuts((os) => os.map((o) => (o.key === 'eff' ? { ...o, faceDown: true } : o)))
    await wait(FLIP_MS)
    const el = outRefs.current.eff
    if (!el || !fromRect || !deckRect) return
    const anim = play('returnToDeck', el, { from: fromRect, to: cardAreaOf(deckRect) })
    if (anim) await anim.finished
  }

  // AI resolution: a table pause → the trigger to the discard and the effect to the deck
  // (simultaneous start, the effect staggered by the flip)
  const resolveAi = async (trig: CardType, eff: CardType) => {
    await wait(AI_HOLD)
    const causeRect = causeRef.current?.getBoundingClientRect()
    const effectRect = effectRef.current?.getBoundingClientRect()
    const discardRect = discardRef.current?.getBoundingClientRect()
    const aiDeckRect = aiRef.current?.getBoundingClientRect()
    // the static cards become flyers in their places
    setOuts([
      { key: 'trig', card: trig, faceDown: false },
      { key: 'eff', card: eff, faceDown: false },
    ])
    setCenterCard(null)
    setAiCard(null)
    await nextFrames()
    const tEl = outRefs.current.trig
    if (tEl && causeRect) {
      tEl.style.left = `${causeRect.left}px`
      tEl.style.top = `${causeRect.top}px`
      tEl.style.width = `${causeRect.width}px`
    }
    const eEl = outRefs.current.eff
    if (eEl && effectRect) {
      eEl.style.left = `${effectRect.left}px`
      eEl.style.top = `${effectRect.top}px`
      eEl.style.width = `${effectRect.width}px`
    }
    await Promise.all([leaveTrigger(causeRect, discardRect), leaveEffect(effectRect, aiDeckRect)])
    setOuts([])
    setDiscard((d) => ({ top: trig, count: d.count + 1 }))
  }

  // one draw: a specific card from a specific deck → center → branch.
  // busy/clearing the center is done by the caller (draw / drawBatch). Returns whether
  // drawing can continue: false — the trigger awaits its (game) logic, the batch stops.
  const drawOne = async (card: CardType, deckIndex: number): Promise<boolean> => {
    const isAi = card.id === AI_TRIGGER
    const deckCell = deckRefs.current[deckIndex]?.getBoundingClientRect()
    // the AI trigger sits on the left (as the cause), the rest — at the center
    const stageRect = (isAi ? causeRef : centerRef).current?.getBoundingClientRect()

    // 1) deck → staging (back-up) via the drawToCenter preset
    setFlyer({ card, faceDown: true, seq: ++flightSeq.current })
    await nextFrames()
    const el = flyerRef.current
    if (el && deckCell && stageRect) {
      const from = cardAreaOf(deckCell)
      el.style.left = `${from.left}px`
      el.style.top = `${from.top}px`
      el.style.width = `${from.width}px`
      const anim = play('drawToCenter', el, { from, to: stageRect })
      if (anim) await anim.finished
      // pin the flyer in place (identity) so the next flight starts here
      for (const a of el.getAnimations()) a.cancel()
      el.style.left = `${stageRect.left}px`
      el.style.top = `${stageRect.top}px`
      el.style.width = `${stageRect.width}px`
    }

    // 2) branch by card type
    if (card.category === 'trigger') {
      await revealForAll(card)
      if (isAi) {
        const eff = await drawAiEffect()
        // pause → the trigger to the discard, the effect back to the deck
        if (eff) await resolveAi(card, eff)
        return true // AI played out — can keep drawing
      }
      // Error 503: full-screen red glow (self — you drew: large, under
      // the hand; other — opponent: small, over the hand). Stays revealed,
      // resolution is game logic (no fixed scenario) → the batch waits, we don't draw further
      setAlert(drawer === 'you' ? 'self' : 'other')
      return false
    }
    if (drawer === 'you') await toPlayerHand(card)
    else await toOpponent(drawer)
    return true
  }

  // a single draw of the forced card from a specific deck (click on the deck)
  const draw = async (deckIndex: number) => {
    if (busy || !nextCard) return
    setBusy(true)
    setCenterCard(null)
    setAiCard(null)
    setAlert(null)
    await drawOne(nextCard, deckIndex)
    setBusy(false)
  }

  // multi-draw (button): one card from each deck, in turn. The forced card —
  // at the "queue" position, the other positions — random non-trigger cards.
  const drawBatch = async () => {
    if (busy) return
    setBusy(true)
    setCenterCard(null)
    setAiCard(null)
    setAlert(null)
    const forcedCard = resolveForced(forced)
    const seq: CardType[] = Array.from({ length: deckCount }, (_, i) =>
      i + 1 === forcedAt ? (forcedCard ?? randomNonTrigger()) : randomNonTrigger(),
    )
    for (let i = 0; i < seq.length; i++) {
      // a trigger without played-out logic stops the batch (we don't draw further)
      const canContinue = await drawOne(seq[i], i)
      if (!canContinue) break
    }
    setBusy(false)
  }

  const reset = () => {
    setOpponents(INITIAL_OPPONENTS)
    setHand(makeHand())
    setFlyer(null)
    setCenterCard(null)
    setAiCard(null)
    setAlert(null)
    setDiscard({ top: null, count: 0 })
    setOuts([])
    setBusy(false)
    resetInsert()
  }

  return (
    <div className={styles.root}>
      <div className={styles.bar} ref={barRef}>
        <button type="button" className={styles.btn} onClick={reset}>
          {pick(lang, { ru: 'сброс', en: 'reset' })}
        </button>
        <HoverSelect
          label={pick(lang, { ru: 'колод добора', en: 'draw decks' })}
          value={String(deckCount)}
          options={DECK_COUNTS.map((n) => ({ value: String(n), label: String(n) }))}
          onChange={(v) => {
            const n = Number(v)
            setDeckCount(n)
            if (forcedAt > n) setForcedAt(n) // trim the position to the deck count
          }}
        />
        <HoverSelect
          label={pick(lang, { ru: 'тянет', en: 'draws' })}
          value={drawer}
          options={drawerOptions}
          onChange={setDrawer}
        />
        <HoverSelect
          label={pick(lang, { ru: 'вытянется', en: 'will draw' })}
          value={forced}
          options={FORCED_OPTIONS.map((o) => ({ value: o.value, label: o.label[lang] }))}
          onChange={(v) => setForced(v as Forced)}
        />
        {deckCount > 1 && (
          <HoverSelect
            label={pick(lang, { ru: 'очередь', en: 'queue' })}
            value={String(forcedAt)}
            options={Array.from({ length: deckCount }, (_, i) => ({
              value: String(i + 1),
              label: String(i + 1),
            }))}
            onChange={(v) => setForcedAt(Number(v))}
          />
        )}
        {nextCard && (
          <div className={styles.preview}>
            <span className={styles.previewLabel}>
              {pick(lang, { ru: 'следующая', en: 'next' })}
            </span>
            <Card card={nextCard} interactive={false} width="46px" />
          </div>
        )}
      </div>

      {/* opponents — on top, as on the table */}
      <div className={styles.opponents}>
        {opponents.map((o) => (
          <div
            key={o.id}
            ref={(el) => {
              seatRefs.current[o.id] = el
            }}
          >
            <Seat
              player={{ id: o.id, name: o.name, handCount: o.handCount, release: EMPTY_RELEASE }}
              copy={pick(lang, { ru: SEAT_COPY_RU, en: SEAT_COPY_EN })}
            />
          </div>
        ))}
      </div>

      {/* table center — draw staging; Error 503 stays here (for everyone) */}
      <div className={styles.center} ref={centerRef}>
        {centerCard && centerCard.id !== AI_TRIGGER && (
          <Card card={centerCard} interactive={false} width="100%" />
        )}
      </div>

      {/* AI trigger (cause) — left of the center, normal size */}
      <div className={styles.causeSlot} ref={causeRef} aria-hidden={centerCard?.id !== AI_TRIGGER}>
        {centerCard?.id === AI_TRIGGER && (
          <Card card={centerCard} interactive={false} width="100%" />
        )}
      </div>

      {/* AI effect (main) — at the center, larger */}
      <div className={styles.effectSlot} ref={effectRef} aria-hidden={!aiCard}>
        {aiCard && <Card card={aiCard} interactive={false} width="100%" />}
      </div>

      {/* draw decks (click — draw a card) + the AI events deck */}
      <div className={styles.decks}>
        {Array.from({ length: deckCount }, (_, i) => (
          // biome-ignore lint/a11y/noStaticElementInteractions: pointer-only draw by clicking a deck; sandbox story
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: decks are positional scene cells, no stable id
            key={`deck-${i}`}
            ref={(el) => {
              deckRefs.current[i] = el
            }}
            className={`${styles.deck} ${styles.drawable}`}
            onMouseDown={() => draw(i)}
          >
            <Pile
              label={pick(lang, { ru: 'колода', en: 'deck' })}
              deck="base"
              count={40}
              width="150px"
              countPos="tl"
            />
          </div>
        ))}
        <div className={styles.ai} ref={aiRef}>
          <Pile
            label={pick(lang, { ru: 'события', en: 'events' })}
            deck="ai"
            count={12}
            width="150px"
            countPos="tl"
          />
        </div>
      </div>

      {/* the draw button — under the decks (we don't move the decks) */}
      <button type="button" className={styles.drawBtn} onClick={drawBatch} disabled={busy}>
        {pick(lang, { ru: 'добрать', en: 'draw' })}
      </button>

      {/* discard — on the right, as on the table */}
      <div className={styles.discard} ref={discardRef}>
        <Pile
          label={pick(lang, { ru: 'сброс', en: 'discard' })}
          topCard={discard.top}
          count={discard.count}
          width="116px"
        />
      </div>

      {/* Error 503, you drew — a large glow UNDER the hand (before the hand in the DOM).
          The glow lives in the TABLE zone (under the bar), not across the whole screen. */}
      <div className={styles.glowBounds} style={{ insetBlockStart: barH }}>
        <EdgeGlow visible={alert === 'self'} intensity="strong" />
      </div>

      {/* player hand — fanned at the bottom */}
      <div className={styles.handWrap} ref={handRef}>
        <Hand items={hand} gapAt={gapAt} />
      </div>

      {/* Error 503, the opponent drew — a small glow OVER the hand (doesn't block hover) */}
      <div className={styles.glowBounds} style={{ insetBlockStart: barH }}>
        <EdgeGlow visible={alert === 'other'} intensity="weak" />
      </div>

      {/* the flying draw card — keyed by seq: a new flight = a fresh Card (no flip) */}
      {flyer && (
        <div key={flyer.seq} className={styles.flyer} ref={flyerRef}>
          <Card card={flyer.card} faceDown={flyer.faceDown} interactive={false} width="100%" />
        </div>
      )}

      {/* cards leaving on AI resolution (trigger → discard, effect → deck) */}
      {outs.map((o) => (
        <div
          key={o.key}
          className={styles.flyer}
          ref={(el) => {
            outRefs.current[o.key] = el
          }}
        >
          <Card card={o.card} faceDown={o.faceDown} interactive={false} width="100%" />
        </div>
      ))}
      {overlay}
    </div>
  )
}
