import enCommon from '@release/translation/locales/en/common.json'
import ruCommon from '@release/translation/locales/ru/common.json'
import { useRef, useState } from 'react'
import {
  jitter,
  nextFrames,
  play,
  type Scatter,
  useFlyer,
  useHandArrival,
  wait,
} from '@/animations'
import { CARDS, cardById } from '@/cards'
import type { Card as CardType } from '@/cards/types'
import Card, { cardAreaOf } from '@/primitives/Card'
import EdgeGlow from '@/primitives/EdgeGlow'
import Pile from '@/primitives/Pile'
import { useCardPreview } from '@/table/CardPreview'
import ConfirmAction from '@/table/ConfirmAction'
import Hand from '@/table/Hand'
import type { HandItem, HandPlayDrop } from '@/table/Hand/Hand'
import ReleaseZone from '@/table/ReleaseZone'
import type { ReleaseSlots } from '@/table/ReleaseZone/ReleaseZone'
import TurnDock from '@/table/TurnDock/TurnDock'
import { type Lang, pick, useLang } from '../../Playground/lang'
import HoverSelect from '../controls/HoverSelect'
import TechBar from '../controls/TechBar'
import { TechButton, TechToggle } from '../controls/TechControls'
import styles from './AiCardsStory.module.css'
import { reorderHand } from './reorderHand'
import { useDiscardExit } from './useDiscardExit'

type Loc = Record<Lang, string>

// AI cards — the scene for AI-effect animations. Start scenario: draw the AI
// trigger from the base deck, pull the chosen AI card from the events deck,
// reveal it at the centre, hold, then resolve by effect.
//
// GAME-LOGIC NOTE — where the cards go on resolution:
//   • the AI TRIGGER (a base-deck card) goes to the common discard;
//   • an AI EVENT card NEVER goes to the common discard — played out, did
//     nothing, or killed in the zone, it returns to the AI (events) deck.
//     Release/Monitoring are the exception while they live in the zone.
//   • Crush destroys the matching release IF one is in the zone (AI release → AI
//     deck, ordinary release → common discard); the Crush card returns to the AI deck.
//   • Error 503 behaves like the ordinary one — here we only raise the red edge
//     glow and halt (reset the screen to continue).
//   • Inside takes a Release card from the discard into the hand, shown to all
//     via the centre; with several releases the player picks one (confirm bar).
//   • Good Vibe-Coding draws 2 base cards to the hand; a trigger among them
//     resolves fully first. Hallucination interrupts the turn — the 2nd draw is
//     skipped (a real turn-interrupt flag, not just a note).
//   • Bad Vibe-Coding: the player picks a hand card; it flies to the centre
//     (shown to all) and then to the discard. The Bad Vibe card stays revealed
//     at the centre until the pick is made.

const AI_TRIGGER = 'trigger-ai'
const ERROR_503_BASE = 'trigger-error-503' // the base-deck Error 503 trigger
const AI_DECK = CARDS.filter((c) => c.deck === 'ai')
// hand filler — ordinary (non-trigger) base cards
const HAND_POOL = CARDS.filter((c) => c.deck === 'base' && c.category !== 'trigger')
const MONITORING = 'protection-monitoring'
const HALLUCINATION = 'ai-hallucination'
const AI_ERROR_503 = 'ai-error-503'
const INSIDE = 'ai-inside'
const GOOD_VIBE = 'ai-good-vibe-coding'
const BAD_VIBE = 'ai-bad-vibe-coding'
// ordinary releases used to seed the discard (for Inside), cycled by count
const REL_POOL = ['release-frontend', 'release-backend', 'release-database']

// AI cards that live in the release zone: each maps to the slot it fills.
const RELEASE_SLOT: Record<string, keyof ReleaseSlots> = {
  'ai-release-frontend': 'frontend',
  'ai-release-backend': 'backend',
  'ai-release-database': 'database',
  'ai-monitoring': 'monitoring',
}

// Crush cards → the release slot they destroy.
const CRUSH_SLOT: Record<string, keyof ReleaseSlots> = {
  'ai-crush-frontend': 'frontend',
  'ai-crush-backend': 'backend',
  'ai-crush-database': 'database',
}

// Good Vibe draw composition (dev choice) — what the 2 base draws contain
type VibeComp = '2plain' | 'ai-first' | '503-first'
const VIBE_OPTIONS: { value: VibeComp; label: Loc }[] = [
  { value: '2plain', label: { ru: '2 обычные', en: '2 plain' } },
  { value: 'ai-first', label: { ru: 'AI-триггер + обычная', en: 'AI trigger + plain' } },
  { value: '503-first', label: { ru: '503 + обычная', en: '503 + plain' } },
]

const FLIP_MS = 420 // flipCard duration — let the in-place flip play
const TABLE_HOLD = 2600 // how long a revealed AI card is held before it resolves
const HALLUCINATION_HOLD = TABLE_HOLD * 2 // Hallucination lingers twice as long
const SHOW_HOLD = 1500 // how long a card is shown to all at the centre
const PICK_HOLD = 900 // Bad Vibe: the given-up card stands beside the AI card, open

const makeHand = (): HandItem[] => HAND_POOL.slice(0, 6).map((card, i) => ({ uid: `h${i}`, card }))

const isRelease = (c: CardType) => c.category === 'release'
const buildRelease = (monitoring: boolean): ReleaseSlots => ({
  monitoring: monitoring ? cardById(MONITORING) : undefined,
})
const buildDiscard = (n: number): DiscardEntry[] => {
  const out: DiscardEntry[] = []
  for (let i = 0; i < n; i++) {
    const c = cardById(REL_POOL[i % REL_POOL.length])
    if (c) out.push({ card: c, ...jitter() })
  }
  return out
}

// a card at rest in the discard — carries its own scatter (tilt + offset)
interface DiscardEntry extends Scatter {
  card: CardType
}

export default function AiCardsStory() {
  const { lang } = useLang()
  const turnCopy = (lang === 'en' ? enCommon : ruCommon).turnDock
  const [aiChoice, setAiChoice] = useState('ai-release-frontend')
  const [monitoring, setMonitoring] = useState(false)
  const [discardCount, setDiscardCount] = useState(0)
  const [vibeComp, setVibeComp] = useState<VibeComp>('2plain')
  const [release, setRelease] = useState<ReleaseSlots>(() => buildRelease(false))
  const [hand, setHand] = useState<HandItem[]>(makeHand)
  const [trigger, setTrigger] = useState<CardType | null>(null) // AI trigger at the cause slot
  const [aiCard, setAiCard] = useState<CardType | null>(null) // the AI effect at the centre
  const [discard, setDiscard] = useState<DiscardEntry[]>(() => buildDiscard(0))
  const [alert, setAlert] = useState(false) // red edge glow (Error 503)
  const [busy, setBusy] = useState(false)
  // Inside: releases offered for choice + the picked index
  const [insideCandidates, setInsideCandidates] = useState<DiscardEntry[] | null>(null)
  const [insidePickIdx, setInsidePickIdx] = useState<number | null>(null)
  const [insideRevealed, setInsideRevealed] = useState(false) // row shown (after the fly-out)
  const [handPickMode, setHandPickMode] = useState(false) // Bad Vibe: pick a card to discard

  const baseDeckRef = useRef<HTMLDivElement>(null)
  const aiDeckRef = useRef<HTMLDivElement>(null)
  const causeRef = useRef<HTMLDivElement>(null) // AI trigger (cause) — left of centre
  const effectRef = useRef<HTMLDivElement>(null) // AI effect (main) — centre, larger
  const pickedRef = useRef<HTMLDivElement>(null) // Bad Vibe: the given-up card, right of it
  const discardRef = useRef<HTMLDivElement>(null)
  const { send: sendToDiscard } = useDiscardExit(discardRef, (cards) =>
    setDiscard((d) => [...d, ...cards]),
  )
  // every card this scene puts in the air: the pull from a deck ('draw'), the
  // cards leaving on resolution ('trig' / 'eff' / 'crushed') and the Inside row
  const { overlay: flyerOverlay, raise, pin, patch, drop, elOf } = useFlyer()
  // reading the card that stands at the centre — the shared block from the kit
  const { slotProps, overlay: previewOverlay } = useCardPreview()
  const releaseSlotRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const handRef = useRef<HTMLDivElement>(null)
  const uidSeq = useRef(0)
  const turnInterrupted = useRef(false) // Hallucination stops Good Vibe's 2nd draw
  const halted = useRef(false) // Error 503 halts the scene (reset to continue)
  const insideResolver = useRef<((entry: DiscardEntry) => void) | null>(null)
  const handPickResolver = useRef<((uid: string) => void) | null>(null)
  const handPickRect = useRef<DOMRect | null>(null)
  const pickRefs = useRef<Record<number, HTMLElement | null>>({}) // Inside choice row cells

  const {
    gapAt,
    gapSize,
    overlay,
    arrive,
    reset: resetInsert,
    FLIGHT_MS,
  } = useHandArrival(handRef, (gap, landed) => {
    setHand((h) => {
      const copy = [...h]
      copy.splice(gap, 0, ...landed.map((it) => ({ uid: it.key, card: it.card })))
      return copy
    })
  })

  const previewCard = cardById(aiChoice)

  // dev toggle — Monitoring is a starting zone condition; flip it in the zone
  const toggleMonitoring = () => {
    const next = !monitoring
    setMonitoring(next)
    setRelease((r) => ({ ...r, monitoring: next ? cardById(MONITORING) : undefined }))
  }

  // one card pulled from a deck to a slot: fly back-up (drawToCenter), then flip
  // face up in place. The slot card is placed by the caller once it lands.
  const pullTo = async (
    card: CardType,
    fromRef: React.RefObject<HTMLDivElement | null>,
    toRef: React.RefObject<HTMLDivElement | null>,
  ) => {
    const fromCell = fromRef.current?.getBoundingClientRect()
    const toRect = toRef.current?.getBoundingClientRect()
    if (!fromCell || !toRect) return
    const from = cardAreaOf(fromCell)
    const [el] = await raise([{ key: 'draw', card, at: from, faceDown: true }])
    if (el) {
      const anim = play('drawToCenter', el, { from, to: toRect })
      if (anim) await anim.finished
      pin('draw', toRect) // I4 — it stands in the slot, so the flip plays in place
    }
    await wait(160)
    patch('draw', { faceDown: false })
    await wait(FLIP_MS + 140)
  }

  // the AI event card returns to the AI (events) deck: flips back-up in place
  // first (like cards entering play), then shrinks back to the deck (returnToDeck)
  const returnAiToDeck = async (fromRect?: DOMRect, deckRect?: DOMRect) => {
    patch('eff', { faceDown: true })
    await wait(FLIP_MS)
    const el = elOf('eff')
    if (!el || !fromRect || !deckRect) return
    const anim = play('returnToDeck', el, { from: fromRect, to: cardAreaOf(deckRect) })
    if (anim) await anim.finished
  }

  // an AI Release / Monitoring card lands in its (empty) release slot and stays
  const placeIntoSlot = async (
    slotKey: keyof ReleaseSlots,
    ai: CardType,
    fromRect?: DOMRect,
    slotRect?: DOMRect,
  ) => {
    const el = elOf('eff')
    if (el && fromRect && slotRect) {
      const anim = play('playToReleaseZone', el, { from: fromRect, to: slotRect })
      if (anim) await anim.finished
    }
    setRelease((r) => ({ ...r, [slotKey]: ai }))
  }

  // a crushed release leaves the zone: an AI release returns to the AI deck (flips
  // back-up first), an ordinary (base) release goes to the common discard
  const destroyRelease = async (card: CardType, fromRect?: DOMRect) => {
    const el = elOf('crushed')
    if (card.deck === 'ai') {
      patch('crushed', { faceDown: true })
      await wait(FLIP_MS)
      const deckRect = aiDeckRef.current?.getBoundingClientRect()
      if (el && fromRect && deckRect) {
        const anim = play('returnToDeck', el, { from: fromRect, to: cardAreaOf(deckRect) })
        if (anim) await anim.finished
      }
      return
    }
    await sendToDiscard([{ key: 'crushed', card, node: el }])
  }

  // the AI trigger leaves to the common discard, landing scattered
  const triggerToDiscard = async (card: CardType, j: Scatter) => {
    await sendToDiscard([{ key: 'trigger', card, node: elOf('trig'), scatter: j }])
  }

  const confirmInside = () => {
    if (insidePickIdx == null || !insideCandidates) return
    const entry = insideCandidates[insidePickIdx]
    const res = insideResolver.current
    insideResolver.current = null
    res?.(entry) // insideChoose reads the row rects, then tears the row down
  }

  // Inside (several releases): the candidates fly OUT of the discard into an open
  // row at the centre, resizing up to hand-card size. The player picks one and
  // confirms — the chosen release goes to the hand, the rest fly back to the discard.
  const insideChoose = async (cands: DiscardEntry[]) => {
    // they leave the discard heap as they come out for the choice
    setDiscard((d) => d.filter((e) => !cands.includes(e)))
    setInsidePickIdx(null)
    setInsideRevealed(false)
    setInsideCandidates(cands)
    await nextFrames() // the (hidden) row is laid out — its cell rects are the targets

    const discardRect = discardRef.current?.getBoundingClientRect()
    const targets = cands.map((_, i) => pickRefs.current[i]?.getBoundingClientRect())
    const fromHeap = discardRect ? cardAreaOf(discardRect) : undefined
    if (fromHeap) {
      await raise(cands.map((e, i) => ({ key: `pick${i}`, card: e.card, at: fromHeap })))
      await Promise.all(
        cands.map(async (_, i) => {
          const el = elOf(`pick${i}`)
          const to = targets[i]
          if (!el || !to) return
          const anim = play('drawToCenter', el, { from: fromHeap, to }) // up to row size
          if (anim) await anim.finished
          pin(`pick${i}`, to)
        }),
      )
    }
    setInsideRevealed(true) // reveal the interactive row (flyers hand off to it)
    drop()

    // wait for the player's confirmed pick
    const chosen = await new Promise<DiscardEntry>((res) => {
      insideResolver.current = res
    })

    // read the row rects before tearing the row down
    const rectOf = (e: DiscardEntry) => pickRefs.current[cands.indexOf(e)]?.getBoundingClientRect()
    const chosenRect = rectOf(chosen)
    const others = cands.filter((e) => e !== chosen)
    const otherRects = others.map(rectOf)
    setInsideCandidates(null)
    setInsidePickIdx(null)

    // chosen → hand (from its row position)
    if (chosenRect) {
      void arrive(
        [{ key: `ins${++uidSeq.current}`, card: chosen.card, from: chosenRect }],
        hand.length,
      )
    }
    // the rest fly back into the discard heap (re-added with their own scatter)
    if (others.length > 0) {
      // each goes back to the scatter it already had in the heap — it was taken
      // OUT of that spot, so it must return to exactly it
      await raise(
        others.flatMap((e, i) => {
          const at = otherRects[i]
          return at ? [{ key: `back${i}`, card: e.card, at }] : []
        }),
      )
      await sendToDiscard(
        others.map((e, i) => ({
          key: `back${i}`,
          card: e.card,
          node: elOf(`back${i}`),
          scatter: e,
          layer: i,
        })),
      )
      drop()
    }
  }

  // Inside: pull a Release from the discard through the centre (shown to all) into
  // the hand. Removed by reference, so it survives the trigger append.
  const insideGrab = async (entry: DiscardEntry) => {
    const discardRect = discardRef.current?.getBoundingClientRect()
    const centerRect = effectRef.current?.getBoundingClientRect()
    const card = entry.card
    setDiscard((d) => d.filter((e) => e !== entry))

    // 1) discard → centre, face up (shown to all players)
    if (!discardRect || !centerRect) return
    const from = cardAreaOf(discardRect)
    const [el] = await raise([{ key: 'inside', card, at: from }])
    if (el) {
      const anim = play('drawToCenter', el, { from, to: centerRect })
      if (anim) await anim.finished
      pin('inside', centerRect) // I4 — it stands at the centre for the hold
    }
    await wait(SHOW_HOLD)

    // 2) centre → hand
    const startRect = el?.getBoundingClientRect()
    drop('inside')
    if (startRect) {
      void arrive([{ key: `ins${++uidSeq.current}`, card, from: startRect }], hand.length)
    }
  }

  // Bad Vibe: the card the player gives up is pulled OUT of the fan and put on the
  // table beside the AI card — the same "a card leaves the hand and stands open"
  // beat the hand limit uses. It goes there AT ONCE, while the AI card is still
  // being read; only after that do both leave.
  const putPickedCard = async (card: CardType, fromRect: DOMRect) => {
    const to = pickedRef.current?.getBoundingClientRect()
    if (!to) return
    const [el] = await raise([{ key: 'picked', card, at: fromRect }])
    if (el) {
      const anim = play('playToCenter', el, { from: fromRect, to })
      if (anim) await anim.finished
      pin('picked', to) // I4 — it stands there, open to everyone
    }
  }

  // Error 503 — raise the red glow and halt (reset the screen to continue)
  const raise503 = async () => {
    await wait(200)
    setAlert(true)
    halted.current = true
  }

  // the shared "trigger → discard, AI card → slot/deck (+ crush, + Inside)" tail,
  // WITHOUT the reveal hold (the caller holds first)
  const resolveGeneric = async (trig: CardType, ai: CardType) => {
    const causeRect = causeRef.current?.getBoundingClientRect()
    const effectRect = effectRef.current?.getBoundingClientRect()
    const aiDeckRect = aiDeckRef.current?.getBoundingClientRect()

    // Release / Monitoring settle into an EMPTY matching slot (and stay there)
    const placeKey = RELEASE_SLOT[ai.id]
    const placeable = placeKey != null && release[placeKey] == null
    const slotRect =
      placeable && placeKey ? releaseSlotRefs.current[placeKey]?.getBoundingClientRect() : undefined

    // Crush destroys the matching release IF one is present (else nothing happens)
    const crushKey = CRUSH_SLOT[ai.id]
    const crushed = crushKey ? release[crushKey] : undefined
    const crushRect =
      crushed && crushKey ? releaseSlotRefs.current[crushKey]?.getBoundingClientRect() : undefined

    // Inside pulls a Release from the discard (captured now, before the trigger lands)
    const insideReleases = ai.id === INSIDE ? discard.filter((e) => isRelease(e.card)) : []

    // the cards standing on the table become flyers exactly where they stand
    const raised = raise([
      ...(causeRect ? [{ key: 'trig', card: trig, at: causeRect }] : []),
      ...(effectRect ? [{ key: 'eff', card: ai, at: effectRect }] : []),
      ...(crushed && crushRect ? [{ key: 'crushed', card: crushed, at: crushRect }] : []),
    ])
    setTrigger(null)
    setAiCard(null)
    if (crushed && crushKey) setRelease((r) => ({ ...r, [crushKey]: undefined }))
    await raised

    await Promise.all([
      triggerToDiscard(trig, jitter()),
      placeable && placeKey && slotRect
        ? placeIntoSlot(placeKey, ai, effectRect, slotRect)
        : returnAiToDeck(effectRect, aiDeckRect),
      ...(crushed ? [destroyRelease(crushed, crushRect)] : []),
    ])
    drop('trig')
    drop('eff')
    drop('crushed')

    // Inside takes a release after the centre has cleared: a single one is taken
    // straight through the centre; several are offered for an open choice first
    if (ai.id === INSIDE && insideReleases.length > 0) {
      if (insideReleases.length === 1) await insideGrab(insideReleases[0])
      else await insideChoose(insideReleases)
    }
  }

  // hold on the table, then the generic resolution. Hallucination holds 2× and
  // raises the turn-interrupt flag (stops Good Vibe's second draw).
  const resolveEvent = async (trig: CardType, ai: CardType) => {
    await wait(ai.id === HALLUCINATION ? HALLUCINATION_HOLD : TABLE_HOLD)
    if (ai.id === HALLUCINATION) turnInterrupted.current = true
    await resolveGeneric(trig, ai)
  }

  // run an AI trigger from scratch: base deck → cause, pull the event to the
  // centre, resolve it. Used by the start scenario and Good Vibe's recursion.
  const runAiTrigger = async (event: CardType) => {
    const trig = cardById(AI_TRIGGER)
    if (!trig) return
    await pullTo(trig, baseDeckRef, causeRef)
    setTrigger(trig)
    drop('draw')
    await pullTo(event, aiDeckRef, effectRef)
    setAiCard(event)
    drop('draw')
    await resolveEvent(trig, event)
  }

  // a plain base card drawn to the hand (deck → centre → flip → into the hand)
  const drawToHand = async (card: CardType, handLen: number) => {
    await pullTo(card, baseDeckRef, effectRef)
    const r = elOf('draw')?.getBoundingClientRect()
    drop('draw')
    if (r) void arrive([{ key: `ins${++uidSeq.current}`, card, from: r }], handLen)
    await wait(FLIGHT_MS + 140)
  }

  // an Error 503 drawn into the hand's stead: it reveals at the centre and halts
  const draw503ToHalt = async (card: CardType) => {
    await pullTo(card, baseDeckRef, effectRef)
    setAiCard(card)
    drop('draw')
    await raise503()
  }

  // Good Vibe-Coding — draw 2 base cards; a trigger among them resolves fully
  // first. Hallucination interrupts (2nd draw skipped); 503 halts the scene.
  const goodVibe = async (trig: CardType, ai: CardType) => {
    await resolveEvent(trig, ai) // Good Vibe → AI deck, trigger → discard
    turnInterrupted.current = false
    const ordinary = () => HAND_POOL[Math.floor(Math.random() * HAND_POOL.length)]
    const seq: CardType[] =
      vibeComp === 'ai-first'
        ? [cardById(AI_TRIGGER) ?? ordinary(), ordinary()]
        : vibeComp === '503-first'
          ? [cardById(ERROR_503_BASE) ?? ordinary(), ordinary()]
          : [ordinary(), ordinary()]

    let handLen = hand.length
    for (const card of seq) {
      if (turnInterrupted.current || halted.current) break
      if (card.id === AI_TRIGGER) {
        // the drawn AI trigger plays out anew — here it pulls Hallucination,
        // which interrupts the turn (the next iteration is skipped)
        await runAiTrigger(cardById(HALLUCINATION) ?? card)
      } else if (card.id === ERROR_503_BASE) {
        await draw503ToHalt(card)
      } else {
        await drawToHand(card, handLen++)
      }
    }
  }

  // Bad Vibe-Coding — the player discards a hand card; it's shown at the centre
  // and discarded. The Bad Vibe card stays at the centre until the pick is made.
  // The pick is the canonical discard gesture: drag the card OUT of the hand.
  const badVibe = async (trig: CardType, ai: CardType) => {
    const uid = await new Promise<string>((res) => {
      handPickResolver.current = res
      setHandPickMode(true)
    })
    const chosen = hand.find((x) => x.uid === uid)
    const fromRect = handPickRect.current ?? undefined
    // it leaves the hand the moment it is pulled out and takes its place beside the
    // AI card — the pull and the flight are one movement, not two
    if (chosen && fromRect) {
      setHand((h) => h.filter((x) => x.uid !== chosen.uid))
      await putPickedCard(chosen.card, fromRect)
      await wait(PICK_HOLD)
    }
    // …and then everything on the table leaves at once: the trigger to the discard,
    // the AI card back to its deck, the given-up card to the discard
    await Promise.all([
      resolveGeneric(trig, ai),
      chosen
        ? sendToDiscard([{ key: 'picked', card: chosen.card, node: elOf('picked') }]).then(() =>
            drop('picked'),
          )
        : Promise.resolve(),
    ])
  }

  // dragged out of the hand while Bad Vibe waits — accept it as the discard
  const onHandDrop = (uid: string, dropped: HandPlayDrop): boolean => {
    if (!handPickMode) return false
    handPickRect.current = dropped.rect ?? null
    const res = handPickResolver.current
    handPickResolver.current = null
    setHandPickMode(false)
    res?.(uid)
    return true
  }

  // dispatch the revealed AI card to its effect
  const dispatch = (trig: CardType, ai: CardType): Promise<void> => {
    if (ai.id === AI_ERROR_503) return raise503()
    if (ai.id === BAD_VIBE) return badVibe(trig, ai)
    if (ai.id === GOOD_VIBE) return goodVibe(trig, ai)
    return resolveEvent(trig, ai)
  }

  // start scenario: base deck → AI trigger (cause) → chosen AI card → resolve.
  const start = async () => {
    if (busy) return
    const trig = cardById(AI_TRIGGER)
    const ai = cardById(aiChoice)
    if (!trig || !ai) return
    setBusy(true)
    setTrigger(null)
    setAiCard(null)
    halted.current = false

    await pullTo(trig, baseDeckRef, causeRef)
    setTrigger(trig)
    drop('draw')

    await pullTo(ai, aiDeckRef, effectRef)
    setAiCard(ai)
    drop('draw')

    await dispatch(trig, ai)

    if (!halted.current) setBusy(false)
  }

  const reset = () => {
    setHand(makeHand())
    setRelease(buildRelease(monitoring))
    drop() // every card still in the air comes down
    setTrigger(null)
    setAiCard(null)
    setDiscard(buildDiscard(discardCount))
    setAlert(false)
    setInsideCandidates(null)
    setInsidePickIdx(null)
    setInsideRevealed(false)
    setHandPickMode(false)
    turnInterrupted.current = false
    halted.current = false
    insideResolver.current = null
    handPickResolver.current = null
    resetInsert()
    setBusy(false)
  }

  return (
    <div className={styles.root}>
      <TechBar>
        <TechButton onClick={reset}>{pick(lang, { ru: 'рестарт', en: 'restart' })}</TechButton>
        <HoverSelect
          label={pick(lang, { ru: 'AI-карта', en: 'AI card' })}
          value={aiChoice}
          options={AI_DECK.map((c) => ({ value: c.id, label: c.name }))}
          onChange={setAiChoice}
        />
        <TechToggle on={monitoring} onChange={toggleMonitoring}>
          {pick(lang, { ru: 'мониторинг в зоне', en: 'monitoring in zone' })}
        </TechToggle>
        {aiChoice === INSIDE && (
          <HoverSelect
            label={pick(lang, { ru: 'релизов в сбросе', en: 'releases in discard' })}
            value={String(discardCount)}
            options={[0, 1, 2, 3].map((n) => ({ value: String(n), label: String(n) }))}
            onChange={(v) => {
              const n = Number(v)
              setDiscardCount(n)
              setDiscard(buildDiscard(n))
            }}
          />
        )}
        {aiChoice === GOOD_VIBE && (
          <HoverSelect
            label={pick(lang, { ru: 'состав добора', en: 'draw makeup' })}
            value={vibeComp}
            options={VIBE_OPTIONS.map((o) => ({ value: o.value, label: o.label[lang] }))}
            onChange={(v) => setVibeComp(v as VibeComp)}
          />
        )}
        {previewCard && (
          <div className={styles.preview}>
            <span className={styles.previewLabel}>
              {pick(lang, { ru: 'вытянется', en: 'draws' })}
            </span>
            <Card card={previewCard} interactive={false} width={46} />
          </div>
        )}
      </TechBar>
      <div className={styles.stage}>
        {/* AI trigger (cause) — left of the centre, normal size */}
        <div
          className={styles.causeSlot}
          ref={causeRef}
          aria-hidden={!trigger}
          {...slotProps(trigger)}
        >
          {trigger && <Card card={trigger} interactive={false} width="100%" />}
        </div>

        {/* AI effect (main) — at the centre, larger */}
        <div
          className={styles.effectSlot}
          ref={effectRef}
          aria-hidden={!aiCard}
          {...slotProps(aiCard)}
        >
          {aiCard && <Card card={aiCard} interactive={false} width="100%" />}
        </div>

        {/* Bad Vibe: where the given-up card stands while both are read. Only a place —
            the card itself is on the carrier until it leaves for the discard. */}
        <div className={styles.pickedSlot} ref={pickedRef} aria-hidden="true" />

        {/* base draw deck (click — start) + the AI events deck */}
        <div className={styles.decks}>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: pointer-only draw by clicking the deck; sandbox story */}
          <div
            ref={baseDeckRef}
            className={`${styles.deck} ${styles.drawable}`}
            onMouseDown={start}
          >
            <Pile
              label={pick(lang, { ru: 'колода', en: 'deck' })}
              deck="base"
              count={40}
              width={150}
              countPos="tl"
            />
          </div>
          <div className={styles.deck} ref={aiDeckRef}>
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
            onDraw={busy ? undefined : start}
          />
        </div>

        {/* discard — on the right; triggers, crushed ordinary releases and Bad Vibe
            discards land here as a tossed heap */}
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

        {/* Inside — releases offered for choice, in an open row at the centre */}
        {insideCandidates && (
          <div className={styles.pickRow} data-revealed={insideRevealed}>
            {insideCandidates.map((e, i) => (
              <button
                // biome-ignore lint/suspicious/noArrayIndexKey: candidates are a stable snapshot for this pick
                key={i}
                type="button"
                className={styles.pickCard}
                ref={(el) => {
                  pickRefs.current[i] = el
                }}
                onClick={() => setInsidePickIdx(i)}
              >
                <Card
                  card={e.card}
                  interactive={false}
                  width="100%"
                  state={insidePickIdx === i ? 'selected' : 'idle'}
                  // pick one out of a set — uniform selection colour, not the
                  // per-category accent
                  accent="var(--select-accent)"
                />
              </button>
            ))}
          </div>
        )}

        {/* Error 503 — red edge glow, the full table zone (the stage IS that zone) */}
        {previewOverlay}

        <div className={styles.glowBounds}>
          <EdgeGlow visible={alert} intensity="strong" />
        </div>

        {/* player area — release zone above the hand */}
        <div className={styles.you}>
          <ReleaseZone
            release={release}
            size="100px"
            slotRef={(key, el) => {
              releaseSlotRefs.current[key] = el
            }}
          />
          <div
            className={styles.handWrap}
            ref={handRef}
            // ignore hand hover during animations (e.g. after Inside's confirm, while
            // the card settles in) — Bad Vibe's pick keeps the hand interactive
            style={{ pointerEvents: busy && !handPickMode ? 'none' : undefined }}
          >
            <Hand
              items={hand}
              gapAt={gapAt}
              gapSize={gapSize}
              stateAt={handPickMode ? () => 'playable' : undefined}
              // Bad Vibe discards ANY card — uniform colour, not the per-category
              // accent; and it costs a card, so the hue is the loss one
              accentAt={handPickMode ? () => 'var(--danger-accent)' : undefined}
              // the discard gesture is the same everywhere: pull the card OUT of
              // the hand (never a click) — see the Hand limit scene
              onPlay={handPickMode ? onHandDrop : undefined}
              onReorder={(uid, to) => setHand((h) => reorderHand(h, uid, to))}
            />
          </div>
        </div>

        {/* every card this scene has in the air — the shared carrier */}
        {flyerOverlay}

        {/* the "settle into hand" overlay (Inside / Good Vibe draws) */}
        {overlay}

        {/* Inside — confirm the chosen release (shared slide-up bar) */}
        <ConfirmAction
          open={insideCandidates != null}
          label={pick(lang, { ru: 'подтвердить', en: 'confirm' })}
          caption={pick(lang, {
            ru: 'выберите релиз из сброса',
            en: 'pick a release from the discard',
          })}
          disabled={insidePickIdx == null}
          onConfirm={confirmInside}
        />
      </div>
    </div>
  )
}
