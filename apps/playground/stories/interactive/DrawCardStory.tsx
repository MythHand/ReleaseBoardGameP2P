import enCommon from '@release/translation/locales/en/common.json'
import ruCommon from '@release/translation/locales/ru/common.json'
import { useMemo, useRef, useState } from 'react'
import { jitter, play, type Scatter, useFlyer, useHandArrival, wait } from '@/animations'
import { CARDS, cardById } from '@/cards'
import type { Card as CardType } from '@/cards/types'
import Card, { cardAreaOf, cardBoxIn } from '@/primitives/Card'
import EdgeGlow from '@/primitives/EdgeGlow'
import Pile from '@/primitives/Pile'
import Hand from '@/table/Hand'
import type { HandItem } from '@/table/Hand/Hand'
import type { ReleaseSlots } from '@/table/ReleaseZone/ReleaseZone'
import Seat from '@/table/Seat'
import TurnDock from '@/table/TurnDock/TurnDock'
import { type Lang, pick, useLang } from '../../Playground/lang'
import HoverSelect from '../controls/HoverSelect'
import TechBar from '../controls/TechBar'
import { TechButton } from '../controls/TechControls'
import styles from './DrawCardStory.module.css'
import { reorderHand } from './reorderHand'
import { useDiscardExit } from './useDiscardExit'

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
// a card at rest in the discard heap — carries its own scatter (tilt + offset)
interface DiscardEntry {
  card: CardType
  rot: number
  dx: number
  dy: number
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
  const turnCopy = (lang === 'en' ? enCommon : ruCommon).turnDock
  const [deckCount, setDeckCount] = useState(1)
  const [forced, setForced] = useState<Forced>('ordinary')
  const [forcedAt, setForcedAt] = useState(1) // on which draw the forced card shows up
  const [drawer, setDrawer] = useState('you')
  const [opponents, setOpponents] = useState<Opp[]>(INITIAL_OPPONENTS)
  const [hand, setHand] = useState<HandItem[]>(makeHand)
  const [centerCard, setCenterCard] = useState<CardType | null>(null) // the revealed trigger at the center
  const [aiCard, setAiCard] = useState<CardType | null>(null) // the card from the nearby AI deck
  // discard as a tossed heap (like the other interactive stories): each card
  // carries its own scatter, read by both the fly-in and the resting heap
  const [discard, setDiscard] = useState<DiscardEntry[]>([])
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
  const handRef = useRef<HTMLDivElement>(null)
  // every card this scene puts in the air — the draw itself ('draw'), the AI effect
  // ('ai') and the two cards leaving on resolution ('trig' / 'eff')
  const { overlay: flyerOverlay, raise, pin, patch, drop, elOf } = useFlyer()
  // I8 — the hand grows DURING a batch, and a batch runs in one closure: reading
  // `hand.length` there gives the length the hand had when the batch started, so
  // every card after the first aims at the slot of the card before it
  const handLen = useRef(0)
  handLen.current = hand.length
  const { send: sendToDiscard } = useDiscardExit(discardRef, (cards) =>
    setDiscard((d) => [...d, ...cards]),
  )

  const {
    gapAt,
    gapSize,
    overlay,
    arrive,
    reset: resetInsert,
  } = useHandArrival(handRef, (gap, landed) => {
    setHand((h) => {
      const copy = [...h]
      copy.splice(gap, 0, ...landed.map((it) => ({ uid: it.key, card: it.card })))
      handLen.current = copy.length // the next card in the batch aims at THIS fan
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
    patch('draw', { faceDown: false })
    await wait(560) // let flipCard play (420) + a pause
    const r = elOf('draw')?.getBoundingClientRect()
    drop('draw')
    if (r) void arrive([{ key: nextUid(), card, from: r }], handLen.current)
  }

  // opponent: goes to their seat back-up and sinks into the hidden hand
  const toOpponent = async (oppId: string) => {
    await wait(160)
    const el = elOf('draw')
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
    drop('draw')
  }

  // trigger (Error 503 / AI): flips at the center for everyone and stays
  const revealForAll = async (card: CardType) => {
    await wait(220)
    patch('draw', { faceDown: false })
    await wait(560) // let flipCard play + a pause
    setCenterCard(card) // the card stays revealed at the center
    drop('draw')
  }

  // AI: a card is drawn from the AI deck to the center AS THE MAIN one — larger than the trigger
  // (the trigger meanwhile stands on the left as the cause). The effect is the logic side, later.
  const drawAiEffect = async (): Promise<CardType | undefined> => {
    const ai = resolveAiCard()
    const aiCell = aiRef.current?.getBoundingClientRect()
    const toRect = effectRef.current?.getBoundingClientRect()
    if (!ai || !aiCell || !toRect) return undefined
    const from = cardAreaOf(aiCell)
    const [el] = await raise([{ key: 'ai', card: ai, at: from, faceDown: true }])
    if (el) {
      // aim at the large effect slot — the card arrives enlarged
      const anim = play('drawToCenter', el, { from, to: toRect })
      if (anim) await anim.finished
      pin('ai', toRect) // I4 — it now stands in the slot; the flip plays in place
    }
    await wait(160)
    patch('ai', { faceDown: false })
    await wait(560)
    setAiCard(ai)
    drop('ai')
    return ai
  }

  // the trigger leaves to the discard face up, landing scattered (like the other
  // stories) — the same scatter `j` is stored so the resting heap matches
  const leaveTrigger = async (card: CardType, j: Scatter) => {
    await sendToDiscard([{ key: 'trigger', card, node: elOf('trig'), scatter: j }])
  }

  // the effect first flips back-up IN PLACE (consistent with cards entering
  // play), and that delay separates the trajectories; then it returns to the AI deck
  // shrinking to the deck size (returnToDeck)
  const leaveEffect = async (fromRect?: DOMRect, deckRect?: DOMRect) => {
    patch('eff', { faceDown: true })
    await wait(FLIP_MS)
    const el = elOf('eff')
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
    const aiDeckRect = aiRef.current?.getBoundingClientRect()
    if (!causeRect || !effectRect) return
    // the static cards become flyers standing exactly where they stood
    const raised = raise([
      { key: 'trig', card: trig, at: causeRect },
      { key: 'eff', card: eff, at: effectRect },
    ])
    setCenterCard(null)
    setAiCard(null)
    await raised
    // the trigger goes to the discard through the shared step (which commits it),
    // the effect returns to the AI deck — both at once
    await Promise.all([leaveTrigger(trig, jitter()), leaveEffect(effectRect, aiDeckRect)])
    drop()
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
    if (deckCell && stageRect) {
      const from = cardAreaOf(deckCell)
      const [el] = await raise([{ key: 'draw', card, at: from, faceDown: true }])
      if (el) {
        const anim = play('drawToCenter', el, { from, to: stageRect })
        if (anim) await anim.finished
        pin('draw', stageRect) // I4 — the next flight starts from where it stands
      }
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
    setCenterCard(null)
    setAiCard(null)
    setAlert(null)
    setDiscard([])
    drop() // every card still in the air comes down
    setBusy(false)
    resetInsert()
  }

  return (
    <div className={styles.root}>
      <TechBar>
        <TechButton onClick={reset}>{pick(lang, { ru: 'рестарт', en: 'restart' })}</TechButton>
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
            <Card card={nextCard} interactive={false} width={46} />
          </div>
        )}
      </TechBar>
      <div className={styles.stage}>
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
                copy={pick(lang, { ru: ruCommon.seat, en: enCommon.seat })}
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
        <div
          className={styles.causeSlot}
          ref={causeRef}
          aria-hidden={centerCard?.id !== AI_TRIGGER}
        >
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
                width={150}
                countPos="tl"
              />
            </div>
          ))}
          <div className={styles.ai} ref={aiRef}>
            <Pile
              label={pick(lang, { ru: 'события', en: 'events' })}
              deck="ai"
              count={12}
              width={150}
              countPos="tl"
            />
          </div>
        </div>

        {/* the draw affordance — the canonical TurnDock in its 'draw' state, at its
            canonical spot (bottom-left, under the decks, left of the hand) */}
        <div className={styles.turnDock}>
          <TurnDock
            state={busy ? 'push' : 'draw'}
            seconds={20}
            progress={1}
            copy={turnCopy}
            onDraw={busy ? undefined : drawBatch}
          />
        </div>

        {/* discard — on the right; cards land scattered (a tossed heap) */}
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

        {/* Error 503, you drew — a large glow UNDER the hand (before the hand in the DOM).
            The glow fills the table zone, which is exactly the stage. */}
        <div className={styles.glowBounds}>
          <EdgeGlow visible={alert === 'self'} intensity="strong" />
        </div>

        {/* player hand — fanned at the bottom */}
        <div className={styles.handWrap} ref={handRef}>
          <Hand
            items={hand}
            gapAt={gapAt}
            gapSize={gapSize}
            onReorder={(uid, to) => setHand((h) => reorderHand(h, uid, to))}
          />
        </div>

        {/* Error 503, the opponent drew — a small glow OVER the hand (doesn't block hover) */}
        <div className={styles.glowBounds}>
          <EdgeGlow visible={alert === 'other'} intensity="weak" />
        </div>

        {/* every card this scene has in the air — the shared carrier */}
        {flyerOverlay}
        {overlay}
      </div>
    </div>
  )
}
