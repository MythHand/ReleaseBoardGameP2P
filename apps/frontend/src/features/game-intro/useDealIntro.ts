import type { Event, PlayerView } from '@release/engine'
import type { CardData, HandItem, Rect, Scatter } from '@release/ui'
import { cardBoxIn, cardById, play, scatterAt, wait } from '@release/ui'
import type { ReactNode, RefObject } from 'react'
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { BoardState } from '~/entities/game/board'
import { useReducedMotion } from '~/shared/lib/useReducedMotion'
import { isOpening } from './isOpening'
import type { DealPlan } from './planDeal'
import { planDeal } from './planDeal'
import { useFlyer } from './useFlyer'
import { useHandArrival } from './useHandArrival'

// The opening of a match, replayed. The engine dealt before any peer mounted
// the board, so this reconstructs the pre-deal table and plays forward to the
// state the board already holds.
//
// The choreography is the approved one from
// apps/playground/stories/interactive/GameDealStory.tsx — its beats, its
// timings, its order. What is different here:
//   • the cards come from planDeal(), never from Math.random();
//   • an opponent's closed card has no identity, so it flies as a back;
//   • the deal does not own the board's state, it SHADOWS it: the last frame of
//     the intro is the projection's own values, in the projection's own hand
//     order, so the handover to the live board changes nothing on screen;
//   • prefers-reduced-motion and a skip both collapse it to that last frame;
//   • it reports completion once, when the release zone has arrived.

// The beats of the arrival, copied verbatim from the story. This is a screen
// being entered, not interface feedback: every block takes its time and there
// is a real pause between one beat and the next.
const RAIL_MS = 640
const BG_MS = 900 // the ambience takes the longest — it is the room lighting up
const PILE_MS = 620
const PILE_STAGGER = 180 // the discard follows the decks, it does not pop with them
const SEAT_MS = 560
const SEAT_STAGGER = 140
const DOCK_DELAY = 320 // the dock comes just after the seats, same beat
const ZONE_MS = 620
const BEAT = 320 // the pause between one beat and the next

// the deal's own rhythm
const DEAL_LEAD = 420 // after the table is set, before the first card leaves
const DEAL_STEP = 230 // between one card leaving the deck and the next
const ROUND_GAP = 160 // an extra breath between rounds, so rounds are countable
const HEAP_HOLD = 640 // the finished heap stands open before it goes to the fan
const FLIP_HOLD = 380 // it is all in the hand — then it turns over
const REVEAL_HOLD = 620 // the hand is read, and only then the zone arrives
const CARD_W = 150 // a card on this table, the deck's own width

export interface IntroRefs {
  rail: RefObject<HTMLDivElement | null>
  bg: RefObject<HTMLDivElement | null>
  decks: RefObject<HTMLDivElement | null>
  discard: RefObject<HTMLDivElement | null>
  seats: RefObject<HTMLDivElement | null>
  dock: RefObject<HTMLDivElement | null>
  zone: RefObject<HTMLDivElement | null>
  deckBox: RefObject<HTMLDivElement | null>
  centre: RefObject<HTMLDivElement | null>
  hand: RefObject<HTMLDivElement | null>
  seatOf: (player: string) => HTMLElement | null
}

/** A card of the player's own heap at the centre, before it goes into the fan. */
export interface StagedCard {
  uid: string
  card: string
  sc: Scatter
  faceDown: boolean
}

export interface DealIntro {
  active: boolean
  // The board's state while the intro runs — the projection, shadowed. Null
  // once the intro is over: the board renders the live projection again.
  shadow: BoardState | null
  staged: StagedCard[]
  overlays: ReactNode
  finish: () => void
  // Beyond the brief's surface, and needed by whoever mounts this: the fan has
  // to open room for the arriving heap (gapAt/gapSize come straight from
  // useHandArrival), and the landed hand travels closed until the flip, so the
  // board has to be told which face a hand card shows.
  gapAt: number | null
  gapSize: number
  faceDown: (uid: string) => boolean
}

const rectOf = (el: Element | null | undefined): Rect | null => {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

// where a card of the heap rests at the centre
const heapRect = (centre: Rect, sc: Scatter): Rect => ({
  left: centre.left + sc.dx,
  top: centre.top + sc.dy,
  width: centre.width,
  height: centre.height,
})

// An opponent's closed card. The projection never says what it is, so nothing
// here may guess: this carries no face, only the base deck's cover, and it is
// always flown faceDown. Card reads `deck` for the back and nothing else.
const COVER: CardData = {
  id: 'unknown',
  name: '',
  category: 'protection',
  deck: 'base',
  art: '',
  tags: [],
  qty: 0,
}

export function useDealIntro(args: {
  live: BoardState
  view: PlayerView | null
  events: Event[]
  refs: IntroRefs
  onDone: () => void
}): DealIntro {
  const { live, view, events, refs } = args
  const reduced = useReducedMotion()

  const [active, setActive] = useState(false)
  const [phase, setPhase] = useState<'setup' | 'dealing' | 'settling'>('setup')
  const [deckCount, setDeckCount] = useState(0)
  const [dealtTo, setDealtTo] = useState<Record<string, number>>({})
  const [staged, setStaged] = useState<StagedCard[]>([])
  const [landed, setLanded] = useState<HandItem[]>([])
  const [closed, setClosed] = useState<string[]>([])
  const [revealed, setRevealed] = useState(false)
  const [zoneIn, setZoneIn] = useState(false)

  const { overlay: flyerOverlay, raise, drop } = useFlyer()
  const {
    overlay: arrivalOverlay,
    gapAt,
    gapSize,
    arrive,
  } = useHandArrival(refs.hand, (_gap, list) =>
    setLanded(list.map((l) => ({ uid: l.key, card: l.card }))),
  )

  const plan = useMemo<DealPlan | null>(
    () => (view ? planDeal(view, events) : null),
    [view, events],
  )

  // Everything the long-running sequence reads is taken through a ref: it is
  // started once and must not resume against a stale render's values.
  const latest = useRef({ live, view, plan, refs, arrive, onDone: args.onDone, reduced })
  latest.current = { live, view, plan, refs, arrive, onDone: args.onDone, reduced }

  // Bumped to invalidate the running sequence. Every await in the run checks it,
  // so a cancelled run stops at its next beat and never touches state again.
  const runId = useRef(0)
  const reported = useRef(false)

  // One way out, taken by the skip, by reduced motion, by a missing rect and by
  // a resize. Two implementations of "jump to the end" would drift, and only one
  // of them would be the one anybody tested.
  const finish = useCallback(() => {
    runId.current += 1
    drop()
    setActive(false)
    setStaged([])
    if (!reported.current) {
      reported.current = true
      latest.current.onDone()
    }
  }, [drop])
  const finishRef = useRef(finish)
  finishRef.current = finish

  // The preference is live: turning it on mid-flight collapses the intro.
  useLayoutEffect(() => {
    if (reduced && active) finishRef.current()
  }, [reduced, active])

  // Keyed by the game, not by the mount. A re-render with a fresh projection
  // object must not re-arm the intro, and React 19 StrictMode's double invoke
  // must play it once: the first pass is cancelled by its own cleanup before it
  // can do anything but set the shadow up, and the second pass starts clean.
  const gameKey = view ? view.self.id : null

  useLayoutEffect(() => {
    // No projection yet: nothing to replay, and nothing to report — the gate
    // this feeds must keep waiting.
    if (gameKey == null) return
    // Already over (reduced motion, a skip, or a completed run). A re-render
    // must not start it again.
    if (reported.current) return

    const { view: v, plan: p } = latest.current
    // Not an opening, or no deal to replay: hand over at once, and say so.
    if (!v || !isOpening(v) || !p || p.flights.length === 0) {
      finishRef.current()
      return
    }
    if (latest.current.reduced) {
      finishRef.current()
      return
    }

    const id = ++runId.current
    const halt = () => runId.current !== id

    setActive(true)
    setPhase('setup')
    setDeckCount(p.deckBefore)
    setDealtTo({})
    setStaged([])
    setLanded([])
    setClosed([])
    setRevealed(false)
    setZoneIn(false)

    // The whole choreography is measured against a layout that is no longer
    // there; there is no honest way to re-aim mid-flight, so it collapses.
    const onResize = () => finishRef.current()
    window.addEventListener('resize', onResize)

    // ===== step 1 — the interface arrives =====
    const intro = async () => {
      const r = latest.current.refs
      // 1.1 — the page rail slides in from its own edge
      play('hudIn', r.rail.current, { dx: 44, dur: RAIL_MS })
      await wait(RAIL_MS + BEAT)
      if (halt()) return

      // 1.2 — the table itself: the HUD layer with its grid, a plain fade
      play('hudIn', r.bg.current, { dur: BG_MS })
      await wait(BG_MS + BEAT)
      if (halt()) return

      // 2 — the piles take their places: the decks from the left edge, the
      // discard from the right, one after the other rather than together
      play('hudIn', r.decks.current, { dx: -34, dur: PILE_MS })
      play('hudIn', r.discard.current, { dx: 34, dur: PILE_MS, delay: PILE_STAGGER })
      await wait(PILE_MS + PILE_STAGGER + BEAT)
      if (halt()) return

      // 3 — the players: the seats drop in from above (each after the one before
      // it), the dock rises from below in the same beat
      for (const [i, el] of [...(r.seats.current?.children ?? [])].entries()) {
        play('hudIn', el, { dy: -28, dur: SEAT_MS, delay: i * SEAT_STAGGER })
      }
      play('hudIn', r.dock.current, { dy: 30, dur: SEAT_MS, delay: DOCK_DELAY })
      await wait(SEAT_MS + DOCK_DELAY + BEAT)
    }

    // one card leaves the deck for the centre and stays there, at its own
    // scatter — the heap the player's hand will be lifted out of
    const toCentre = async (index: number, uid: string, card: CardData, down: boolean) => {
      const r = latest.current.refs
      const from = rectOf(r.deckBox.current)
      const to = rectOf(r.centre.current)
      if (!from || !to) {
        finishRef.current()
        return null
      }
      const sc = scatterAt(index, CARD_W)
      const key = `c${index}`
      const [el] = await raise([{ key, at: from, card, faceDown: down }])
      if (halt()) return null
      // the same Scatter drives the flight and the rest, so the card lands
      // exactly where it then lies (the discard heap's own coupling)
      const anim = play('drawToCenter', el, { from, to, rotate: sc.rot, dx: sc.dx, dy: sc.dy })
      if (anim) await anim.finished
      if (halt()) return null
      const placed: StagedCard = { uid, card: card.id, sc, faceDown: down }
      setStaged((h) => [...h, placed])
      drop(key)
      return placed
    }

    // one card leaves the deck for an opponent's seat and sinks into the hand
    // hidden there — the counter on the seat is that hand
    const toSeat = async (key: string, player: string, card: CardData, down: boolean) => {
      const r = latest.current.refs
      const from = rectOf(r.deckBox.current)
      const seat = rectOf(r.seatOf(player))
      if (!from || !seat) {
        finishRef.current()
        return
      }
      const [el] = await raise([{ key, at: from, card, faceDown: down }])
      if (halt()) return
      // aim at a card-sized box INSIDE the seat, not at the seat itself — its
      // rect is far wider than a card and the card would inflate to it
      const anim = play('dealToSeat', el, { from, to: cardBoxIn(seat, from.width * 0.7) })
      if (anim) await anim.finished
      if (halt()) return
      setDealtTo((c) => ({ ...c, [player]: (c[player] ?? 0) + 1 }))
      drop(key)
    }

    // ===== step 2 — the deal =====
    const deal = async () => {
      setPhase('dealing')
      await wait(DEAL_LEAD)
      if (halt()) return

      const flights: Promise<unknown>[] = []
      // What landed at the centre, indexed by the card's place in the fan —
      // collected HERE and not read back off `staged` later: this closure never
      // re-runs, so its `staged` would still be the empty array it was armed
      // with (I8).
      const placed: (StagedCard | null)[] = new Array(p.hand.length).fill(null)
      const travelledClosed: string[] = []
      let round = -1
      let n = 0

      // planDeal already ordered the flights round by round, the player first in
      // every round — the table is dealt the way a table is dealt.
      for (const f of p.flights) {
        if (f.round !== round) {
          if (round >= 0) {
            await wait(ROUND_GAP)
            if (halt()) return
          }
          round = f.round
        }
        if (f.to.kind === 'self') {
          const entry = p.hand[f.to.index]
          const data = entry ? cardById(entry.card) : undefined
          if (entry && data) {
            const i = f.to.index
            if (!f.faceUp) travelledClosed.push(entry.uid)
            flights.push(
              toCentre(i, entry.uid, data, !f.faceUp).then((pl) => {
                placed[i] = pl
              }),
            )
          }
        } else {
          // A closed card of somebody else's is not guessed — it flies as a back.
          const data = (f.card ? cardById(f.card) : undefined) ?? COVER
          flights.push(toSeat(`s${n++}`, f.to.player, data, !f.faceUp))
        }
        setDeckCount((d) => d - 1)
        await wait(DEAL_STEP)
        if (halt()) return
      }
      await wait(ROUND_GAP)
      if (halt()) return
      await Promise.all(flights)
      if (halt()) return

      // The counters are now the projection's own, exactly — not "deckBefore
      // minus what we counted". This is the half of the invisible handover that
      // does not depend on the arithmetic above being right.
      const l = latest.current.live
      setDeckCount(l.decks.main)
      setDealtTo(Object.fromEntries(l.opponents.map((o) => [o.id, o.handCount])))
      setClosed(travelledClosed)

      // the finished heap stands open for a beat, then the whole of it goes into
      // the fan at once — still closed
      await wait(HEAP_HOLD)
      if (halt()) return
      const to = rectOf(latest.current.refs.centre.current)
      if (!to) {
        finishRef.current()
        return
      }
      setPhase('settling')
      // `placed` is indexed by the fan's own order, so filtering holds it: the
      // hand arrives in view.self.hand's order and never re-sorts.
      const heap = placed.filter((s): s is StagedCard => s != null)
      setStaged([]) // the centre empties in the same commit the flight starts
      await latest.current.arrive(
        heap.map((s) => ({
          key: s.uid,
          card: cardById(s.card) ?? COVER,
          faceDown: s.faceDown,
          from: heapRect(to, s.sc),
          rot: s.sc.rot,
        })),
        0,
      )
      if (halt()) return

      // it is all in the hand — now it turns over
      await wait(FLIP_HOLD)
      if (halt()) return
      setRevealed(true)

      // and only then does the player's own zone arrive
      await wait(REVEAL_HOLD)
      if (halt()) return
      play('hudIn', latest.current.refs.zone.current, { dy: 22, dur: ZONE_MS })
      setZoneIn(true)
      await wait(ZONE_MS)
      if (halt()) return
      // The gate opens here, not at the flip: the table should be fully dressed
      // before the game may move.
      finishRef.current()
    }

    const runAll = async () => {
      await intro()
      if (halt()) return
      await deal()
    }
    void runAll()

    return () => {
      // Cancel, drop what is in the air — but do NOT report. Under StrictMode
      // this cleanup runs between the two invocations, and an onDone here would
      // open the gate before a single card had flown.
      runId.current += 1
      window.removeEventListener('resize', onResize)
      drop()
    }
  }, [gameKey, drop, raise])

  // One state, shadowed. The board renders this instead of the projection while
  // the intro runs; its last frame is the projection's own values, in the
  // projection's own hand order, so the handover changes nothing on screen.
  const shadow: BoardState | null = active
    ? {
        ...live,
        you: { ...live.you, hand: landed, release: zoneIn ? live.you.release : {} },
        opponents: live.opponents.map((o) => ({ ...o, handCount: dealtTo[o.id] ?? 0 })),
        decks: { ...live.decks, main: deckCount },
        introPhase: phase,
      }
    : null

  const closedSet = useMemo(() => new Set(closed), [closed])
  const faceDown = useCallback(
    (uid: string) => active && !revealed && closedSet.has(uid),
    [active, revealed, closedSet],
  )

  return {
    active,
    shadow,
    staged,
    overlays: [...flyerOverlay, ...arrivalOverlay],
    finish,
    gapAt,
    gapSize,
    faceDown,
  }
}
