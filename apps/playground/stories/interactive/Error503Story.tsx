import enCommon from '@release/translation/locales/en/common.json'
import ruCommon from '@release/translation/locales/ru/common.json'
import type React from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { jitter, nextFrames, play, toDiscardParams, wait } from '@/animations'
import { CARDS, CATEGORIES, cardById } from '@/cards'
import type { Card as CardType } from '@/cards/types'
import Badge from '@/primitives/Badge'
import Card, { cardAreaOf } from '@/primitives/Card'
import EdgeGlow from '@/primitives/EdgeGlow'
import Pile from '@/primitives/Pile'
import Typography from '@/primitives/Typography'
import DiscardHeap from '@/table/DiscardHeap'
import Hand from '@/table/Hand'
import type { HandItem, HandPlayDrop } from '@/table/Hand/Hand'
import TurnDock, { type TurnDockState } from '@/table/TurnDock/TurnDock'
import { pick, useLang } from '../../Playground/lang'
import styles from './Error503Story.module.css'
import { reorderHand } from './reorderHand'

// Error 503 — the player-turn story. From TurnDock 'draw' (no timer wired): the
// player draws, Error 503 comes out of the deck to the centre and reveals to
// everyone with a red edge glow. Then defence, by DRAGGING a card onto the 503
// (no drop-target hints — it just falls into place when released over it):
//   - Monitoring in the release zone → auto-neutralized: 503 briefly at the
//     centre, then straight to discard, NO glow (Monitoring stays).
//   - Debugger from hand OR a Release (with its attached Code Review) from the
//     zone → covers the 503 at the centre, both go to discard.
//   - No defence / the player passes → everything (hand, and on a pass the
//     release zone too) goes to the centre and then to the discard; the player
//     is out and TurnDock drops to 'waiting' (opponent turn).
// The scene is driven by which cards sit where — toggled in the tech bar — not
// by hard-coded per-flow cases.

const BASE = CARDS.filter((c) => c.deck === 'base')

const ERROR503 = 'trigger-error-503'
const DEBUGGER = 'protection-debugger'

function must(id: string): CardType {
  const c = cardById(id)
  if (!c) throw new Error(`unknown card ${id}`)
  return c
}
const ERROR503_CARD = must(ERROR503)

// four innocuous hand fillers — the grey, unplayable cards during the 503 window
const FILLERS = BASE.filter(
  (c) =>
    c.category !== 'trigger' &&
    c.id !== DEBUGGER &&
    c.id !== 'protection-monitoring' &&
    !c.id.startsWith('release'),
).slice(0, 4)

type SlotKey = 'frontend' | 'backend' | 'database' | 'monitoring'
const SLOTS: SlotKey[] = ['frontend', 'backend', 'database', 'monitoring']
const SLOT_LABEL: Record<SlotKey, string> = {
  frontend: 'Frontend',
  backend: 'Backend',
  database: 'Database',
  monitoring: 'Monitoring',
}
const WAITING_PLAYER = 'kernel_panic'
const DROP_PAD = 48 // forgiveness around the 503 when releasing a dragged card
const CARD_W = 150 // normal card width — deck / hand / centre all match (no size skew)
const CARD_H = (CARD_W * 515) / 368 // matching --card-aspect (368 / 515)

// elimination videos — shown to everyone when a player is knocked out. Bundled
// from the story's own folder; nothing reaches into user_input.
const ELIM_VIDEOS = Object.values(
  import.meta.glob('./eliminate/*.mp4', { eager: true, query: '?url', import: 'default' }),
) as string[]
const ELIM_MIN_MS = 5000 // play at least this long, then finish the current loop

interface RelSlot {
  main: CardType
  aux?: CardType
}
type Rel = Partial<Record<SlotKey, RelSlot>>

interface DragState {
  kind: 'debugger' | 'release'
  uid?: string // hand card being dragged
  slot?: SlotKey // release slot being dragged
  main: CardType
  aux?: CardType
  cx: number // cursor at pick-up
  cy: number
  // where inside the card it was grabbed (0..1) — keeps that point under the
  // cursor as the card resizes, so the pick-up doesn't snap centre-to-cursor
  fracX: number
  fracY: number
  originCx: number // source-slot centre (for the off-target return)
  originCy: number
  startW: number // source on-screen width (eases to CARD_W)
}
interface Flyer {
  card: CardType
  faceDown: boolean
  seq: number
}
interface OutEntry {
  key: string
  card: CardType
}
// a card at rest in the discard heap — carries its own scatter (tilt + offset)
interface DiscardEntry {
  card: CardType
  rot: number
  dx: number
  dy: number
}

function buildHand(withDebugger: boolean): HandItem[] {
  const items: HandItem[] = FILLERS.map((card, i) => ({ uid: `h${i}`, card }))
  if (withDebugger) items.splice(2, 0, { uid: 'h-dbg', card: must(DEBUGGER) })
  return items
}
function buildRel(release: boolean, releaseCR: boolean, monitoring: boolean): Rel {
  return {
    frontend: release ? { main: must('release-frontend') } : undefined,
    backend: releaseCR
      ? { main: must('release-backend'), aux: must('support-code-review') }
      : undefined,
    monitoring: monitoring ? { main: must('protection-monitoring') } : undefined,
  }
}

// Release with its Code Review as a FLAT stack (code review peeks behind, no
// rotation). A rotated pair's bounding box ≠ the card, which is what teleported
// the cards on the discard hand-off. data-main / data-aux anchor the real rects.
function RelStack({ main, aux }: { main: CardType; aux: CardType }) {
  return (
    <div className={styles.pairStack}>
      <div className={styles.pairAux} data-aux>
        <Card card={aux} interactive={false} width="100%" />
      </div>
      <div className={styles.pairMain} data-main>
        <Card card={main} interactive={false} width="100%" />
      </div>
    </div>
  )
}

export default function Error503Story() {
  const { lang } = useLang()
  const turnCopy = (lang === 'en' ? enCommon : ruCommon).turnDock
  const tableCopy = (lang === 'en' ? enCommon : ruCommon).table

  // ===== tech-bar toggles — the scene's initial state (cards in places) =====
  const [dbg, setDbg] = useState(true)
  const [rel1, setRel1] = useState(false)
  const [relCR, setRelCR] = useState(false)
  const [mon, setMon] = useState(false)

  // ===== scene state =====
  const [handItems, setHandItems] = useState<HandItem[]>(() => buildHand(true))
  const [rel, setRel] = useState<Rel>(() => buildRel(false, false, false))
  const [centerCard, setCenterCard] = useState<CardType | null>(null)
  const [flyer, setFlyer] = useState<Flyer | null>(null)
  const [outs, setOuts] = useState<OutEntry[]>([])
  const [discard, setDiscard] = useState<DiscardEntry[]>([])
  const [drag, setDrag] = useState<DragState | null>(null)
  const [alert, setAlert] = useState(false) // red edge glow
  const [pending, setPending] = useState(false) // 503 at centre, awaiting the player
  const [eliminated, setEliminated] = useState(false)
  const [gif, setGif] = useState<string | null>(null) // elimination video overlay
  const [gifOut, setGifOut] = useState(false) // overlay fading out
  const [dock, setDock] = useState<TurnDockState>('draw')
  const [busy, setBusy] = useState(false)

  const deckRef = useRef<HTMLDivElement>(null)
  const centerRef = useRef<HTMLDivElement>(null)
  const discardRef = useRef<HTMLDivElement>(null)
  const flyerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<HTMLDivElement>(null)
  const handWrapRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const relSlotRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const outRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const seqRef = useRef(0)
  const gifStart = useRef(0)
  const gifResolve = useRef<(() => void) | null>(null)

  // Hand owns its hover internally; after a card leaves the hand the pointer is
  // usually at the centre, so tell the fan the mouse left — dispatch a real
  // mouseout on each slot (next frame, after the fan re-lays out) so it clears
  // hover instead of leaving a card lit up under no cursor.
  const clearHandHover = () => {
    requestAnimationFrame(() => {
      const fan = handWrapRef.current?.firstElementChild
      if (!fan) return
      for (const slot of Array.from(fan.children)) {
        slot.dispatchEvent(
          new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }),
        )
      }
    })
  }

  // elimination video: full-screen for everyone, looped, at least ELIM_MIN_MS,
  // then let the current loop finish before it fades out. Resolves when hidden.
  function playEliminationGif(): Promise<void> {
    if (ELIM_VIDEOS.length === 0) return Promise.resolve()
    const src = ELIM_VIDEOS[Math.floor(Math.random() * ELIM_VIDEOS.length)]
    gifStart.current = performance.now()
    setGifOut(false)
    setGif(src)
    return new Promise((res) => {
      gifResolve.current = res
    })
  }
  // one loop finished: replay until the minimum time is reached, then fade out
  function onGifEnded(e: React.SyntheticEvent<HTMLVideoElement>) {
    const v = e.currentTarget
    if (performance.now() - gifStart.current < ELIM_MIN_MS) {
      v.currentTime = 0
      void v.play()
      return
    }
    setGifOut(true)
    window.setTimeout(() => {
      setGif(null)
      setGifOut(false)
      gifResolve.current?.()
      gifResolve.current = null
    }, 360)
  }

  // tech-bar height → the edge glow lives in the TABLE zone (under the bar)
  const [barH, setBarH] = useState(0)
  useLayoutEffect(() => {
    if (barRef.current) setBarH(barRef.current.offsetHeight)
  }, [])

  // rebuild the scene from the toggles (on mount and on any toggle change)
  // biome-ignore lint/correctness/useExhaustiveDependencies: applyScene reads only the toggle args
  useEffect(() => applyScene(dbg, rel1, relCR, mon), [dbg, rel1, relCR, mon])

  function applyScene(a: boolean, b: boolean, c: boolean, d: boolean) {
    setHandItems(buildHand(a))
    setRel(buildRel(b, c, d))
    setCenterCard(null)
    setFlyer(null)
    setOuts([])
    setDiscard([])
    setDrag(null)
    setAlert(false)
    setPending(false)
    setEliminated(false)
    setGif(null)
    setGifOut(false)
    setBusy(false)
    setDock('draw')
  }

  // read the fanned hand's per-slot rects (order matches handItems) — for the
  // elimination sweep, where each card flies from where it sits
  function handSlotRects(): DOMRect[] {
    const fan = handWrapRef.current?.firstElementChild
    if (!fan) return []
    return Array.from(fan.children).map((el) => (el as HTMLElement).getBoundingClientRect())
  }

  // fly a set of cards to the discard as a scattered heap. `gather` first draws
  // them together at the centre (elimination), then scatters; without it the
  // cards are already at the centre (a resolved defence) and just scatter.
  async function sweep(items: { card: CardType; fromRect: DOMRect }[], gather: boolean) {
    const centerRect = centerRef.current?.getBoundingClientRect()
    const discardRect = discardRef.current?.getBoundingClientRect()
    if (!discardRect || items.length === 0) return
    setOuts(items.map((it, i) => ({ key: `o${i}`, card: it.card })))
    await nextFrames()
    const place = (i: number, r: DOMRect | { left: number; top: number; width: number }) => {
      const el = outRefs.current[`o${i}`]
      if (!el) return
      el.style.transition = 'none'
      el.style.left = `${r.left}px`
      el.style.top = `${r.top}px`
      el.style.width = `${r.width}px`
    }
    items.forEach((it, i) => {
      place(i, it.fromRect)
    })

    let starts: { left: number; top: number; width: number; height: number }[] = items.map(
      (it) => it.fromRect,
    )
    if (gather && centerRect) {
      await nextFrames()
      items.forEach((_, i) => {
        const el = outRefs.current[`o${i}`]
        if (!el) return
        el.style.transition =
          'left 300ms var(--ease-soft), top 300ms var(--ease-soft), width 300ms var(--ease-soft)'
        el.style.left = `${centerRect.left}px`
        el.style.top = `${centerRect.top}px`
        el.style.width = `${centerRect.width}px`
      })
      await wait(560) // glide in (300) + a beat at the centre
      starts = items.map(() => centerRect)
    }

    const js = items.map(() => jitter())
    await nextFrames()
    await Promise.all(
      items.map((_, i) => {
        const el = outRefs.current[`o${i}`]
        if (!el) return undefined
        const from = starts[i]
        el.style.transition = 'none'
        el.style.left = `${from.left}px`
        el.style.top = `${from.top}px`
        el.style.width = `${from.width}px`
        void el.offsetWidth // flush before the WAAPI flight
        const anim = play(
          'centerToDiscard',
          el,
          toDiscardParams(from, cardAreaOf(discardRect), js[i]),
        )
        return anim?.finished
      }),
    )
    setOuts([])
    setDiscard((prev) => [...prev, ...items.map((it, i) => ({ card: it.card, ...js[i] }))])
  }

  // ===== the draw =====
  async function drawFlow() {
    if (busy || centerCard || eliminated) return
    setBusy(true)
    const deckRect = deckRef.current?.getBoundingClientRect()
    const centerRect = centerRef.current?.getBoundingClientRect()
    setFlyer({ card: ERROR503_CARD, faceDown: true, seq: ++seqRef.current })
    await nextFrames()
    const el = flyerRef.current
    if (el && deckRect && centerRect) {
      const from = cardAreaOf(deckRect)
      el.style.left = `${from.left}px`
      el.style.top = `${from.top}px`
      el.style.width = `${from.width}px`
      const anim = play('drawToCenter', el, { from, to: centerRect })
      if (anim) await anim.finished
      for (const a of el.getAnimations()) a.cancel()
      el.style.left = `${centerRect.left}px`
      el.style.top = `${centerRect.top}px`
      el.style.width = `${centerRect.width}px`
    }
    await wait(180)
    setFlyer((f) => (f ? { ...f, faceDown: false } : f)) // flip face up for everyone
    await wait(560)
    // drawn from the deck → lands straight at the centre (no tilt)
    setCenterCard(ERROR503_CARD)
    setFlyer(null)

    // Monitoring auto-neutralizes: a brief reveal at the centre, then to discard,
    // no glow. Monitoring stays in the zone.
    if (rel.monitoring) {
      setDock('push')
      await wait(750)
      const cRect = centerRef.current?.getBoundingClientRect()
      setCenterCard(null)
      if (cRect) await sweep([{ card: ERROR503_CARD, fromRect: cRect }], false)
      setBusy(false)
      return
    }

    // no Monitoring: the 503 stays, red glow on, the hand greys out (only
    // Debugger stays colour + playable), the dock enters the danger reaction.
    setAlert(true)
    setPending(true)
    setDock('reaction')
    const canDefend =
      handItems.some((h) => h.card.id === DEBUGGER) || Boolean(rel.frontend) || Boolean(rel.backend)
    if (!canDefend) {
      await wait(2500) // defenceless — knocked out after a beat
      await eliminate(false)
      return
    }
    setBusy(false) // hand off to the player: drag a defence or PASS
  }

  // ===== defence by drag =====
  function beginDrag(
    el: HTMLElement,
    e: React.MouseEvent,
    base: Omit<DragState, 'cx' | 'cy' | 'fracX' | 'fracY' | 'originCx' | 'originCy' | 'startW'>,
  ) {
    e.preventDefault() // don't start a text selection on pick-up
    const r = el.getBoundingClientRect()
    setDrag({
      ...base,
      cx: e.clientX,
      cy: e.clientY,
      fracX: (e.clientX - r.left) / r.width, // grab point inside the card (0..1)
      fracY: (e.clientY - r.top) / r.height,
      originCx: r.left + r.width / 2,
      originCy: r.top + r.height / 2,
      startW: r.width,
    })
  }
  // the hand is on the canonical Hand: dragging the Debugger onto the 503 plays
  // it. onPlay is accepted only for the Debugger dropped on the 503; anything
  // else is rejected and the Hand glides the card back.
  function handPlay(uid: string, drop: HandPlayDrop): boolean {
    if (!pending || busy) return false
    const item = handItems.find((x) => x.uid === uid)
    if (!item || item.card.id !== DEBUGGER) return false
    const c = centerRef.current?.getBoundingClientRect()
    if (!c) return false
    const hit =
      drop.x >= c.left - DROP_PAD &&
      drop.x <= c.right + DROP_PAD &&
      drop.y >= c.top - DROP_PAD &&
      drop.y <= c.bottom + DROP_PAD
    if (!hit) return false
    void neutralizeWithDebugger(uid, item.card, drop.rect ?? c)
    return true
  }
  // Debugger played onto the 503 → both go to the discard
  async function neutralizeWithDebugger(uid: string, card: CardType, fromRect: DOMRect) {
    setPending(false)
    setBusy(true)
    setAlert(false)
    setHandItems((h) => h.filter((x) => x.uid !== uid))
    const rect503 = centerRef.current?.getBoundingClientRect()
    setCenterCard(null)
    const items: { card: CardType; fromRect: DOMRect }[] = []
    if (rect503) items.push({ card: ERROR503_CARD, fromRect: rect503 })
    items.push({ card, fromRect })
    await sweep(items, false)
    setDock('push')
    setBusy(false)
  }
  function onRelDown(e: React.MouseEvent, key: SlotKey) {
    if (!pending || busy || drag) return
    const s = rel[key]
    if (!s) return
    beginDrag(e.currentTarget as HTMLElement, e, {
      kind: 'release',
      slot: key,
      main: s.main,
      aux: s.aux,
    })
  }

  // drag lifecycle: the flyer is picked up EXACTLY where it was grabbed (same
  // position + size), then eases to the normal card size while the grab point
  // stays under the cursor (no snap-to-centre); on release, hit-test the 503
  // biome-ignore lint/correctness/useExhaustiveDependencies: drag is the trigger; handlers use the closures captured when the drag began
  useEffect(() => {
    if (!drag) return
    // one rAF loop drives BOTH the size ease and the position each frame, so the
    // grabbed point stays exactly under the cursor while the card resizes (no
    // resize-from-corner-then-snap)
    const ResizeMs = 200
    const cursor = { x: drag.cx, y: drag.cy }
    const start = performance.now()
    let raf = 0
    const frame = (now: number) => {
      const node = dragRef.current
      if (node) {
        const t = Math.min(1, (now - start) / ResizeMs)
        const ease = 1 - (1 - t) ** 3
        const w = drag.startW + (CARD_W - drag.startW) * ease
        const h = (w * CARD_H) / CARD_W
        node.style.width = `${w}px`
        node.style.left = `${cursor.x - drag.fracX * w}px`
        node.style.top = `${cursor.y - drag.fracY * h}px`
      }
      raf = requestAnimationFrame(frame)
    }
    const el = dragRef.current
    if (el) el.style.transition = 'none'
    raf = requestAnimationFrame(frame)

    const onMove = (e: MouseEvent) => {
      cursor.x = e.clientX
      cursor.y = e.clientY
    }
    const onUp = (e: MouseEvent) => {
      cancelAnimationFrame(raf)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      const c = centerRef.current?.getBoundingClientRect()
      const hit =
        c &&
        e.clientX >= c.left - DROP_PAD &&
        e.clientX <= c.right + DROP_PAD &&
        e.clientY >= c.top - DROP_PAD &&
        e.clientY <= c.bottom + DROP_PAD
      if (hit) void resolveDefense(drag)
      else void returnDrag(drag)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [drag])

  // dropped on the 503 → cover it at the centre, then both (and any attached
  // Code Review) go to the discard
  async function resolveDefense(d: DragState) {
    setBusy(true)
    setPending(false)
    const centerRect = centerRef.current?.getBoundingClientRect()
    const el = dragRef.current
    if (el && centerRect) {
      // cover the 503 straight (no tilt) — a rotated cover makes the cards'
      // bounding boxes drift, which is exactly what teleported them on hand-off.
      // Settle to the normal width too (in case a quick drag ended mid-resize).
      el.style.transition =
        'left 240ms var(--ease-out), top 240ms var(--ease-out), width 240ms var(--ease-out)'
      el.style.left = `${centerRect.left}px`
      el.style.top = `${centerRect.top}px`
      el.style.width = `${CARD_W}px`
      await wait(300)
    }
    // read each card's ACTUAL current rect (the pair's main/aux anchors + the 503
    // at the centre) so the discard flight continues from where they lie — no
    // recompute, no teleport (works because nothing is rotated → bbox = card)
    const anchor = (sel: string): DOMRect | undefined =>
      (el?.querySelector(sel) as HTMLElement | null)?.getBoundingClientRect()
    const mainRect = d.aux ? anchor('[data-main]') : el?.getBoundingClientRect()
    const auxRect = d.aux ? anchor('[data-aux]') : undefined
    const rect503 = centerRef.current?.getBoundingClientRect()

    setAlert(false)
    // debugger leaves the hand → the fan closes the gap (like Deck animations);
    // tell the fan the mouse left so it doesn't leave a card lit up
    if (d.kind === 'debugger' && d.uid) {
      setHandItems((h) => h.filter((x) => x.uid !== d.uid))
      clearHandHover()
    } else if (d.slot) setRel((r) => ({ ...r, [d.slot as SlotKey]: undefined }))
    setCenterCard(null)
    setDrag(null)

    // discard, keeping the landed order bottom → top: 503, Code Review, Release
    const items: { card: CardType; fromRect: DOMRect }[] = []
    if (rect503) items.push({ card: ERROR503_CARD, fromRect: rect503 })
    if (d.aux && auxRect) items.push({ card: d.aux, fromRect: auxRect })
    if (mainRect) items.push({ card: d.main, fromRect: mainRect })
    await sweep(items, false)
    setDock('push')
    setBusy(false)
  }

  // released off-target → glide (and shrink) the card back into its slot
  async function returnDrag(d: DragState) {
    const el = dragRef.current
    if (el) {
      const h = (d.startW * CARD_H) / CARD_W
      el.style.transition =
        'left 240ms var(--ease-out), top 240ms var(--ease-out), width 240ms var(--ease-out)'
      el.style.width = `${d.startW}px`
      el.style.left = `${d.originCx - d.startW / 2}px`
      el.style.top = `${d.originCy - h / 2}px`
      await wait(260)
    }
    setDrag(null)
  }

  // ===== elimination =====
  async function eliminate(includeRelease: boolean) {
    if (busy && !pending) return
    setBusy(true)
    setPending(false)
    const handRects = handSlotRects()
    const items: { card: CardType; fromRect: DOMRect }[] = handItems
      .map((hi, i) => ({ card: hi.card, fromRect: handRects[i] }))
      .filter((x): x is { card: CardType; fromRect: DOMRect } => Boolean(x.fromRect))
    if (includeRelease) {
      for (const key of SLOTS) {
        const s = rel[key]
        const node = relSlotRefs.current[key]
        if (s && node) {
          const r = node.getBoundingClientRect()
          items.push({ card: s.main, fromRect: r })
          if (s.aux) items.push({ card: s.aux, fromRect: r })
        }
      }
    }
    setAlert(false)
    setHandItems([])
    if (includeRelease) setRel({})
    setCenterCard(null)
    await sweep(items, true)
    // the board settles into the eliminated state under the video, which plays
    // for everyone; when it lifts the "you are out" state is already in place
    setEliminated(true)
    setDock('waiting')
    await playEliminationGif()
    setBusy(false)
  }

  return (
    <div className={`${styles.root} ${drag ? styles.dragging : ''}`}>
      <div className={styles.bar} ref={barRef}>
        {(
          [
            { on: dbg, set: setDbg, label: 'Debugger' },
            { on: rel1, set: setRel1, label: 'Release' },
            { on: relCR, set: setRelCR, label: 'Release + Code Review' },
            { on: mon, set: setMon, label: 'Monitoring' },
          ] as const
        ).map((t) => (
          <button
            key={t.label}
            type="button"
            className={styles.chip}
            data-on={t.on}
            onClick={() => t.set((v) => !v)}
          >
            <Typography base="label-sm" tk="tk-16">
              {t.label}
            </Typography>
          </button>
        ))}
        <button
          type="button"
          className={styles.reset}
          onClick={() => applyScene(dbg, rel1, relCR, mon)}
        >
          <Typography base="label-sm" tk="tk-16">
            {pick(lang, { ru: 'сброс', en: 'reset' })}
          </Typography>
        </button>
      </div>

      {/* draw deck — left-centre */}
      <div className={styles.decks} ref={deckRef}>
        <Pile
          label={pick(lang, { ru: 'колода', en: 'deck' })}
          deck="base"
          count={40}
          width={150}
          countPos="tl"
        />
      </div>

      {/* centre staging — the 503 comes out here; defence covers it here */}
      <div className={styles.center} ref={centerRef}>
        {centerCard && (
          <div className={styles.centerCard}>
            <Card card={centerCard} interactive={false} width="100%" />
          </div>
        )}
      </div>

      {/* discard — right of centre; cards land scattered (a tossed heap) */}
      <div className={styles.discard}>
        <DiscardHeap
          cards={discard}
          stackRef={discardRef}
          logoVariant={lang}
          label={pick(lang, { ru: 'сброс', en: 'discard' })}
        />
      </div>

      {/* turn dock — bottom-left */}
      <div className={styles.turnDock}>
        <TurnDock
          state={dock}
          danger={dock === 'reaction'}
          seconds={20}
          progress={1}
          activePlayer={WAITING_PLAYER}
          copy={turnCopy}
          onDraw={dock === 'draw' ? drawFlow : undefined}
          onPass={pending ? () => eliminate(true) : undefined}
        />
      </div>

      {/* the edge glow lives in the table zone (under the tech bar) */}
      <div className={styles.glowBounds} style={{ insetBlockStart: barH }}>
        <EdgeGlow visible={alert} intensity="strong" />
      </div>

      {/* release zone + hand — bottom-centre. Cross-fades to the "you are out"
          badge (release zone gone) when the player is knocked out, as on Table */}
      <div className={styles.you}>
        <div className={styles.playArea} data-hidden={eliminated}>
          <div className={styles.releaseZone}>
            {SLOTS.map((key) => {
              const s = rel[key]
              const grab =
                pending && !busy && !drag && (key === 'frontend' || key === 'backend') && Boolean(s)
              const hidden = drag?.kind === 'release' && drag.slot === key
              // release cards can defend the 503 → highlight them (category accent)
              const hl = grab && s ? CATEGORIES[s.main.category]?.accent : undefined
              return (
                // biome-ignore lint/a11y/noStaticElementInteractions: pointer-only drag-to-play (mousedown lifts the release); sandbox story
                <div
                  key={key}
                  ref={(el) => {
                    relSlotRefs.current[key] = el
                  }}
                  className={`${styles.slot} ${grab ? styles.playable : ''}`}
                  style={hl ? ({ '--hl': hl } as React.CSSProperties) : undefined}
                  onMouseDown={grab ? (e) => onRelDown(e, key) : undefined}
                >
                  {/* card, unless it's lifted onto the drag flyer — then the slot
                      shows its empty placeholder, so the zone never goes blank */}
                  {s && !hidden ? (
                    s.aux ? (
                      <RelStack main={s.main} aux={s.aux} />
                    ) : (
                      <Card card={s.main} interactive={false} width="100%" />
                    )
                  ) : (
                    <span className={styles.empty}>
                      <Typography base="label-sm" tk="tk-16">
                        {SLOT_LABEL[key]}
                      </Typography>
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          <div className={styles.handWrap} ref={handWrapRef}>
            <Hand
              items={handItems}
              // during the 503 window only the Debugger is playable; the rest grey
              // out (Hand owns the transitioned dim)
              stateAt={
                pending
                  ? (i) => (handItems[i]?.card.id === DEBUGGER ? 'playable' : 'disabled')
                  : undefined
              }
              onReorder={
                busy ? undefined : (uid, to) => setHandItems((h) => reorderHand(h, uid, to))
              }
              onPlay={busy ? undefined : handPlay}
            />
          </div>
        </div>

        <div className={styles.eliminated} data-shown={eliminated} aria-hidden={!eliminated}>
          <Badge size="lg">{tableCopy.youEliminated}</Badge>
        </div>
      </div>

      {/* the flying draw card — keyed by seq so each flight is a fresh Card */}
      {flyer && (
        <div key={flyer.seq} className={styles.flyer} ref={flyerRef}>
          <Card card={flyer.card} faceDown={flyer.faceDown} interactive={false} width="100%" />
        </div>
      )}

      {/* cards leaving to the discard */}
      {outs.map((o) => (
        <div
          key={o.key}
          className={styles.flyer}
          ref={(el) => {
            outRefs.current[o.key] = el
          }}
        >
          <Card card={o.card} interactive={false} width="100%" />
        </div>
      ))}

      {/* the card being dragged as a defence */}
      {drag && (
        <div className={styles.dragFlyer} ref={dragRef} style={{ width: CARD_W }}>
          {drag.aux ? (
            <RelStack main={drag.main} aux={drag.aux} />
          ) : (
            <Card card={drag.main} interactive={false} width="100%" />
          )}
        </div>
      )}

      {/* elimination video — full-screen for everyone; loops for at least
          ELIM_MIN_MS, then finishes the current loop and fades out */}
      {gif && (
        <div className={styles.gifOverlay} data-out={gifOut}>
          <video
            className={styles.gifVideo}
            src={gif}
            autoPlay
            muted
            playsInline
            onEnded={onGifEnded}
          />
        </div>
      )}
    </div>
  )
}
