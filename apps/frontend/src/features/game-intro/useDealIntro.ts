import type { Event, PlayerView } from '@release/engine'
import type { CardData, HandItem } from '@release/ui'
// CARD_W is the fan's own width, taken from the kit rather than restated here:
// the sibling arrival step already imports it, and a second copy would let the
// deal's geometry drift from the hand it deals into.
import { CARD_W, cardBoxIn, cardById } from '@release/ui'
// The movement itself comes from the animation layer, which is a separate entry
// from the components: a vocabulary and its steps, not a thing to render.
import type { Rect, Scatter } from '@release/ui/animations'
import { play, scatterAt, useFlyer, useHandArrival, wait } from '@release/ui/animations'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BoardAnchors, BoardState, IntroBeat } from '~/entities/game/board'
import { isOpening } from './isOpening'
import type { DealPlan } from './planDeal'
import { planDeal } from './planDeal'

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

/** A card of the player's own heap at the centre, before it goes into the fan. */
export interface StagedCard {
  uid: string
  card: string
  sc: Scatter
  faceDown: boolean
}

export interface DealIntro {
  active: boolean
  // The opening as one beat, for the board's queue to start. Null when there is
  // no match to open. The queue owns WHEN it plays and whether it plays at all
  // (prefers-reduced-motion collapses it); this hook owns what it does.
  beat: IntroBeat | null
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
  // Which match this is. The intro plays once per game, and this is what says
  // "per game" — see `gameKey` below for why the projection cannot answer it.
  gameId: string | null
  view: PlayerView | null
  events: Event[]
  refs: BoardAnchors
  onDone: () => void
}): DealIntro {
  const { live, gameId, view, events, refs } = args

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
  const latest = useRef({ live, view, plan, refs, arrive, onDone: args.onDone })
  latest.current = { live, view, plan, refs, arrive, onDone: args.onDone }

  // Bumped to invalidate the running sequence. Every await in the run checks it,
  // so a cancelled run stops at its next beat and never touches state again.
  const runId = useRef(0)
  const reported = useRef(false)

  // Settles the promise `run` hands the queue. The opening can end two ways — it
  // plays out, or `finish` cuts it short (a skip, a resize, a missing rect) — and
  // the queue must be released either way, or the table stays held for the rest
  // of a beat nobody is watching.
  const release = useRef<(() => void) | null>(null)
  // Stable: it touches a ref and nothing else, so the callbacks that depend on
  // it are not rebuilt every render.
  const settle = useCallback(() => {
    release.current?.()
    release.current = null
  }, [])

  // One way out, taken by the skip, by reduced motion, by a missing rect and by
  // a resize. Two implementations of "jump to the end" would drift, and only one
  // of them would be the one anybody tested.
  //
  // Idempotent, and deliberately so: the resize listener below outlives the run
  // it was armed for, so after the intro is over every resize event still calls
  // this. Without the early return each one would clear an already-empty heap
  // with a *fresh* array — no Object.is bail-out, a real re-render of the whole
  // board — for the life of the mount. A window drag is dozens of those.
  const finish = useCallback(() => {
    if (reported.current) return
    reported.current = true
    runId.current += 1
    drop()
    setActive(false)
    setStaged([])
    latest.current.onDone()
    // …and release the queue. The choreography may still be sitting in a wait()
    // it cannot be pulled out of, but the opening is over the moment this runs,
    // and the table should not stay held for the remainder of a beat nobody is
    // watching any more.
    settle()
  }, [drop, settle])
  const finishRef = useRef(finish)
  finishRef.current = finish

  // Keyed by the game, and by the game alone. It is the match id rather than
  // anything off the projection: `view.self.id` is this peer's own seat, which
  // is the SAME across every game it plays, so keying on it meant "once per
  // peer" — a rematch without a remount would never deal again. There is no game
  // identity in a PlayerView to fall back on; the route knows it, so the route
  // passes it.
  //
  // The queue arms this key once (`armed` in useBeats), which is also what makes
  // React 19 StrictMode's double invoke play the opening exactly once — a ref
  // survives the second pass, so the second pass finds the key already armed.
  const gameKey = view ? gameId : null

  // A different match than the one that already played: this one has not, so the
  // "already reported" latch resets with the key. It is done HERE rather than
  // inside `run` because `collapse` needs the same reset and gets no other
  // chance at it — under reduced motion a rematch never calls `run`, and a latch
  // left standing would make the second opening report nothing at all. The gate
  // waits on every seat, so one silent seat holds the match shut for everyone.
  const armedFor = useRef<string | null>(null)
  if (gameKey != null && armedFor.current !== gameKey) {
    armedFor.current = gameKey
    reported.current = false
  }

  // The board is going away mid-opening: cancel. `runId` is what every await in
  // the sequence checks, so bumping it stops the run at its next beat — no
  // play() against detached nodes, no setState on an unmounted tree, and no
  // onDone reporting a seat that is no longer watching.
  //
  // This used to be the arming effect's cleanup; the arming effect is gone (the
  // queue starts the opening now), so the cancellation needs a home of its own.
  // It does NOT report: a peer leaving the board must not open the start gate.
  useEffect(
    () => () => {
      runId.current += 1
      drop()
      settle()
    },
    [drop, settle],
  )

  const sequence = useCallback(async () => {
    // Already over — a skip that landed before the queue got here. Nothing to
    // play, and `finish` has already reported.
    if (reported.current) return

    const { view: v, plan: p } = latest.current
    // Not an opening, or no deal to replay: hand over at once, and say so.
    if (!v || !isOpening(v) || !p || p.flights.length === 0) {
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
    // Removes itself on the first fire: once the intro has collapsed there is
    // nothing left for a later resize to collapse, and a listener that outlives
    // its run is a wake-up per resize event for the rest of the mount.
    const onResize = () => {
      window.removeEventListener('resize', onResize)
      finishRef.current()
    }
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
        // Whether this flight actually left the deck. A self card the catalogue
        // cannot resolve is skipped, and the pile must not count a card that
        // never flew — the projection overwrites the number a moment later, but
        // until then the table would be showing a count that never existed.
        let left = false
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
            left = true
          }
        } else {
          // A closed card of somebody else's is not guessed — it flies as a back.
          const data = (f.card ? cardById(f.card) : undefined) ?? COVER
          flights.push(toSeat(`s${n++}`, f.to.player, data, !f.faceUp))
          left = true
        }
        if (left) setDeckCount((d) => d - 1)
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

    try {
      await intro()
      if (halt()) return
      await deal()
    } finally {
      // Whatever ended it — the last beat, a skip, a halt — the listener goes.
      // One that outlives its run is a wake-up per resize event for the rest of
      // the mount.
      window.removeEventListener('resize', onResize)
    }
  }, [drop, raise])

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

  // The opening as the queue takes it: one beat, played once, that owns the
  // table while it runs. Built here rather than beside the sequence because it
  // publishes `shadow`, and the shadow is derived from the state the sequence
  // sets — the beat has to see the current frame, not the one it was armed with.
  //
  // `run`'s promise resolves when the opening is OVER, not when the choreography
  // returns: `finish` settles it too (see `settle` above), so a skip hands the
  // table back at once instead of at the end of a beat nobody is watching.
  const beat = useMemo<IntroBeat | null>(
    () =>
      gameKey == null
        ? null
        : {
            key: gameKey,
            shadow,
            run: () =>
              new Promise<void>((resolve) => {
                release.current = resolve
                // Settled on BOTH outcomes, deliberately. A rejection here — a
                // WAAPI promise that rejects, a throw inside a beat — would
                // otherwise skip the settle, and the queue's await would never
                // return: the table would stay held, inert, for the life of the
                // mount. A failure must cost the animation and nothing else.
                void sequence().then(settle, (err) => {
                  if (import.meta.env.DEV) console.error('[deal] the opening failed', err)
                  settle()
                })
              }),
            collapse: () => finishRef.current(),
          },
    [gameKey, shadow, sequence, settle],
  )

  const closedSet = useMemo(() => new Set(closed), [closed])
  const faceDown = useCallback(
    (uid: string) => active && !revealed && closedSet.has(uid),
    [active, revealed, closedSet],
  )

  return {
    active,
    beat,
    shadow,
    staged,
    overlays: [...flyerOverlay, ...arrivalOverlay],
    finish,
    gapAt,
    gapSize,
    faceDown,
  }
}
