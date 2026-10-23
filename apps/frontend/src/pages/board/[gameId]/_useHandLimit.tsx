// DISCARDING DOWN TO THE HAND LIMIT (#104). While the engine owes us a
// `handLimit` decision, the fan is the picker: a card pulled out of it takes a
// cell in the grid at the centre, and when the last cell fills, ONE `RESOLVE`
// carries every uid at once — the engine takes them in a single action or not
// at all (`packages/engine/src/fake/reduce.ts`'s `onHandLimit`). So every pull
// before the last is a purely local fact, which is what makes the grid a
//
// THE RULE THIS HOOK EXISTS FOR: nothing here waits on a flight. Its three
// siblings stage one card at a time (`if (stagedRef.current) return false`);
// discarding is "think, then dump fast", so every pull gets its own carrier and
// the fan stays live for the next one while the last is still in the air. A
// gate here would read as lag, not as safety (docs/animations/README.md —
// "Gating the hand", approach 3).
import type { Event } from '@release/engine'
import {
  Card,
  type CardData,
  type HandCardState,
  type HandItem,
  type HandPlayDrop,
  handStep,
} from '@release/ui'
import { play, type Rect, useFlyer } from '@release/ui/animations'
import type React from 'react'
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { BoardActions, BoardAnchors, BoardState } from '~/entities/game/board'
import { useToHand } from '~/features/board-beats/toHand'
import { useReducedMotion } from '~/shared/lib/useReducedMotion'
import styles from './_useHandLimit.module.css'

// How far above the fan still counts as "over the hand" — the Hand's own band.
const BAND_PAD = 32

/** a card standing in the grid, in its own cell */
export interface GridCard {
  uid: string
  card: CardData
  slot: number
}

export interface HandLimitStaging {
  /** the cells this decision's grid was sized for — 0 until the first pull */
  cells: number
  placed: GridCard[]
  /** claimed uids, landed or still flying — what `handItems` hides */
  picked: string[]
  /** the beat has taken the grid over: stop rendering the cells */
  handed: boolean
  /** the RESOLVE is out — the grid is locked */
  dispatched: boolean
  /** a card is riding the cursor out of the grid — the fan offers nothing else */
  carrying: boolean
  /** how many cards are still owed; 0 outside the decision */
  owed: number
  /** the open decision is an AI effect's, not the ordinary end-of-turn limit */
  aiPicked: boolean
  overlay: ReactNode[]
  gapAt: number | null
  gapSize: number
  handItems: HandItem[]
  stateAt: (index: number) => HandCardState
  accentAt: (index: number) => string | undefined
  onHandPlay: (uid: string, drop: HandPlayDrop) => boolean
  /** press on a card standing in the grid: it comes off onto the cursor */
  onCellDown: (e: React.MouseEvent, card: GridCard) => void
  bindCell: (slot: number, el: HTMLDivElement | null) => void
  cellAt: (slot: number) => HTMLElement | null
  /** the beat's own hand-over — drops the grid's render, keeps the fan filtered */
  release: () => void
  /**
   * The keeper answered for us: the grid takes nothing more and sends nothing.
   * Called by the answer's beat before it measures anything — whatever is still
   * in our hands is the beat's to carry on from here (`anchors.heldCard`).
   */
  close: () => void
}

export interface Options {
  state: BoardState
  anchors: BoardAnchors
  actions?: BoardActions
  events: Event[] // the feed — watched for `rejected` after dispatch
  enabled: boolean // false while the deal or an exclusive beat owns the table
  /** the match this gesture belongs to — the same boundary its siblings keep */
  matchKey?: string | null
  /**
   * The fan's private order. A card coming home lands in the MIDDLE of the fan
   * like every other arrival, so its slot has to be committed or the next
   * projection puts it back where it used to sit.
   */
  onHandArrival?: (order: string[], uid: string, at: number) => void
}

interface ArrivalEntry {
  key: string
  uid: string
}

type ArrivalContext =
  | {
      kind: 'placement'
      run: number
      // the slot the pointer named; absent for a card simply going home
      entry: ArrivalEntry & { slot?: number }
    }
  | {
      kind: 'rejection'
      run: number
      entries: ArrivalEntry[]
      rejected: string[]
    }

export function useHandLimit({
  state,
  anchors,
  actions,
  events,
  enabled,
  matchKey = null,
  onHandArrival,
}: Options): HandLimitStaging {
  const reduced = useReducedMotion()
  const flyer = useFlyer()
  const [cells, setCells] = useState(0)
  const [placed, setPlaced] = useState<GridCard[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [handed, setHanded] = useState(false)
  const [dispatched, setDispatched] = useState(false)
  // The card riding the cursor: its cell, its size, and where in it the pointer
  // took hold — so it does not jump to its own corner on pick-up.
  const [back, setBack] = useState<
    (GridCard & { w: number; h: number; fracX: number; fracY: number }) | null
  >(null)
  const [placementReturning, setPlacementReturning] = useState(false)
  const [dropSlot, setDropSlot] = useState<number | null>(null)
  const backRef = useRef<HTMLDivElement | null>(null)
  const cursor = useRef({ x: 0, y: 0 })
  // True from cell pickup through the final carrier's landing/refusal. State
  // paints the Hand contract; this ref closes the synchronous gesture gates.
  const carryActive = useRef(false)
  // The drag's handlers are the closure they began with (I8) — the slot under
  // the pointer changes under them, so they read it through a ref.
  const dropSlotRef = useRef<number | null>(null)
  dropSlotRef.current = dropSlot

  // Ours to answer, or nobody's. `options` is the projection's own answer to
  // which cards may go (every uid in the hand, `[]` for everyone else), and
  // nothing here re-derives it.
  const pending =
    state.pending?.kind === 'handLimit' && state.pending.player === state.selfId
      ? state.pending
      : null

  // Bad Vibe-Coding borrows this prompt (`source` names the AI card that raised
  // it), and its one card does NOT go to the grid: `gridCells(1)` centres its
  // cell at dx 0, underneath the AI card standing at the `effect` place. The
  // scene stands it to the RIGHT of that card instead — `centre.ts`'s `aiPick`
  // set — and this is what tells the render which of the two shapes to build.
  const aiPicked = pending?.source != null

  // A flight spans several awaits and must never read a stale render (I8), so
  // everything it needs is mirrored in a ref.
  const cellsRef = useRef(0)
  const pickedRef = useRef<string[]>([])
  const dispatchedRef = useRef(false)
  // the keeper's answer is playing: nothing more is taken and nothing is sent
  const closedRef = useRef(false)
  const dispatchedChoice = useRef<{ player: string; cards: string[] } | null>(null)
  const claimed = useRef(new Set<number>())
  const landed = useRef(0)
  const cellEls = useRef<Record<number, HTMLElement | null>>({})
  const flightSeq = useRef(0)
  // bumped on a match wipe — a flight from a dead match stops committing
  const runId = useRef(0)
  const arrivalSeq = useRef(0)
  // Rejections and pointer placements share `useHandArrival`, but the callback
  // consumes only the exact invocation whose unique carrier keys landed.
  const arrivalContext = useRef<ArrivalContext | null>(null)
  // how much of the feed had arrived when we dispatched: the rejection watcher
  // reads only what came after, or a past rejection of the same decision would
  // cancel a fresh one
  const watermark = useRef(0)
  const latest = useRef({ actions, events, pending })
  latest.current = { actions, events, pending }
  cellsRef.current = cells
  pickedRef.current = picked
  dispatchedRef.current = dispatched

  const handItems = useMemo(
    () =>
      picked.length === 0
        ? (state.you?.hand ?? EMPTY_HAND)
        : (state.you?.hand ?? EMPTY_HAND).filter((c) => !picked.includes(c.uid)),
    [state.you?.hand, picked],
  )
  const handItemsRef = useRef(handItems)
  handItemsRef.current = handItems

  // WHAT THE GRID HOLDS, told to the keeper as it changes: if the time runs out
  // before the last cell fills, these are the cards that stay. Picked rather
  // than landed — a card already in the air is the player's word. A card taken
  // back OUT of the grid is not: the player took it off the discard, and it is
  // nobody's choice while it is on the cursor (owner, 22.10). It stays out of
  // the fan all the same — it is in the player's hand, not in the fan.
  const draftSent = useRef('')
  const carriedOut = back?.uid ?? null
  useEffect(() => {
    const cards = picked.filter((uid) => uid !== carriedOut)
    const key = cards.join(',')
    if (
      !latest.current.pending ||
      dispatchedRef.current ||
      closedRef.current ||
      key === draftSent.current
    )
      return
    draftSent.current = key
    latest.current.actions?.onDraft?.({ kind: 'handLimit', cards })
  }, [picked, carriedOut])

  const restorePicked = useCallback((uids: string[]) => {
    const restored = new Set(uids)
    pickedRef.current = pickedRef.current.filter((uid) => !restored.has(uid))
    setPicked(pickedRef.current)
  }, [])

  // The cards return to the fan through one shared step. Its invocation record
  // distinguishes a rejected action (restore its WHOLE choice, even if only
  // some cells had geometry) from one pointer placement (commit its own slot).
  const arrival = useToHand(anchors.hand, onHandArrival)
  // Held in a ref like everything else this hook reads from inside a long
  // effect: the ending is rebuilt every render, and a dependency on it would
  // re-run the watchers that use it.
  const ending = useRef<(gap: number, landed: { key: string }[]) => void>(() => {})
  const landedBack = (_gap: number, landedCards: { key: string }[]) => {
    const context = arrivalContext.current
    if (!context || context.run !== runId.current) return
    const expected = context.kind === 'placement' ? [context.entry] : context.entries
    if (
      landedCards.length !== expected.length ||
      landedCards.some((landedCard, i) => landedCard.key !== expected[i]?.key)
    ) {
      return
    }
    arrivalContext.current = null
    if (context.kind === 'rejection') {
      restorePicked(context.rejected)
      return
    }
    restorePicked([context.entry.uid])
    carryActive.current = false
    setPlacementReturning(false)
  }
  ending.current = landedBack

  // INTO THE FAN from where the card is: `at` is the slot the pointer named
  // when it let go over the hand — a placement — and absent when the card
  // simply goes home, which is an arrival and lands in the middle. One way
  // back for a card carried out of the grid and for a flight to a cell sent
  // home; `run` is the run the card left in.
  const returnToFan = useCallback(
    (uid: string, card: CardData, rect: DOMRect | undefined, run: number, at?: number) => {
      if (reduced || !rect) {
        restorePicked([uid])
        carryActive.current = false
        return
      }
      void (async () => {
        const context: ArrivalContext = {
          kind: 'placement',
          run,
          entry: {
            key: `hl-arrival-${++arrivalSeq.current}`,
            uid,
            slot: at,
          },
        }
        arrivalContext.current = context
        setPlacementReturning(true)
        const taken = await arrival.home(
          [{ key: context.entry.key, card, from: rect }],
          ending.current,
          at,
        )
        if (runId.current !== run || taken) return
        if (arrivalContext.current !== context) return
        arrivalContext.current = null
        // Nothing will ever land — there is no fan to measure — so the
        // logical return is preserved rather than leaving the card absent
        // from both places.
        restorePicked([uid])
        carryActive.current = false
        setPlacementReturning(false)
      })()
    },
    [reduced, restorePicked, arrival.home],
  )

  const bindCell = useCallback((slot: number, el: HTMLDivElement | null) => {
    if (el) cellEls.current[slot] = el
    else delete cellEls.current[slot]
  }, [])
  const cellAt = useCallback((slot: number) => cellEls.current[slot] ?? null, [])

  const wipe = useCallback(() => {
    draftSent.current = ''
    closedRef.current = false
    claimed.current.clear()
    landed.current = 0
    cellEls.current = {}
    cellsRef.current = 0
    pickedRef.current = []
    dispatchedRef.current = false
    dispatchedChoice.current = null
    arrivalContext.current = null
    carryActive.current = false
    dropSlotRef.current = null
    setCells(0)
    setPlaced([])
    setPicked([])
    setHanded(false)
    setDispatched(false)
    setBack(null)
    setPlacementReturning(false)
    setDropSlot(null)
  }, [])

  // The last cell filled: the decision is complete and goes out as ONE action.
  // Fired on the LANDING rather than on the drop, so the grid is provably whole
  // when it locks — and so a carry-back can never race the dispatch.
  const finish = useCallback(() => {
    if (dispatchedRef.current || closedRef.current) return
    const p = latest.current.pending
    if (!p) return
    const choice = { player: p.player, cards: [...pickedRef.current] }
    dispatchedRef.current = true
    dispatchedChoice.current = choice
    setDispatched(true)
    watermark.current = latest.current.events.length
    latest.current.actions?.onResolve?.({ kind: 'handLimit', cards: choice.cards })
  }, [])

  // one card: the fan → its own cell. I8 — the card, its uid, its slot and its
  // source rect all come in as arguments.
  const flyToCell = useCallback(
    async (uid: string, card: CardData, slot: number, from?: Rect) => {
      const mine = runId.current
      const key = `hl${++flightSeq.current}`
      const commit = () => {
        if (runId.current !== mine) return
        setPlaced((p) => [...p, { uid, card, slot }])
        landed.current += 1
        if (landed.current === cellsRef.current) finish()
      }
      if (reduced || !from) {
        commit()
        return
      }
      // IN THE AIR, it is still ours — and the keeper's answer, if our time runs
      // out before it lands, carries this very card on from where it is
      // (`anchors.heldCard`), rather than flying a second one out of the fan.
      // Held from the moment it is raised: its node is read when it is taken,
      // and the answer's beat waits two frames before it reads anything.
      // `over` once the flight is no longer this gesture's: taken over by the
      // answer, or sent home — either way it never lands in its cell
      let over = false
      anchors.hold(key, {
        uid,
        el: () => flyer.elOf(key),
        take: () => {
          over = true
        },
        release: () => flyer.drop(key),
        // the answer did not take it: the flight stops where it is, its cell
        // is free again, and the card goes back into the fan from there
        home: () => {
          over = true
          claimed.current.delete(slot)
          returnToFan(uid, card, flyer.elOf(key)?.getBoundingClientRect(), mine)
          flyer.drop(key)
        },
      })
      // raising also lets the grid's cells mount before they are measured
      // a run wiped under the flight lets go of what it held
      const gone = () => {
        if (over) return true
        if (runId.current === mine) return false
        anchors.hold(key, null)
        return true
      }
      const [el] = await flyer.raise([{ key, card, at: from, layer: slot }])
      if (gone()) return
      const to = cellEls.current[slot]?.getBoundingClientRect()
      if (el && to) await play('playToCenter', el, { to })?.finished
      if (gone()) return
      anchors.hold(key, null)
      // the real card takes over the cell as the carrier goes — one commit, no
      // gap for the eye to catch
      commit()
      flyer.drop(key)
    },
    [reduced, finish, anchors, flyer.raise, flyer.drop, flyer.elOf, returnToFan],
  )

  // Where the pointer is pointing along the fan, by the fan's own arithmetic:
  // n+1 places for n cards, so a card can go before the first and after the last.
  const slotAt = useCallback(
    (clientX: number, n: number) => {
      const hr = anchors.hand.current?.getBoundingClientRect()
      if (!hr) return Math.round(n / 2)
      const step = handStep(n + 1)
      const i = Math.round((clientX - (hr.left + hr.width / 2)) / step + n / 2)
      return Math.max(0, Math.min(n, i))
    },
    [anchors.hand],
  )

  const onCellDown = useCallback((e: React.MouseEvent, card: GridCard) => {
    if (carryActive.current || dispatchedRef.current || closedRef.current) return
    const r = e.currentTarget.getBoundingClientRect()
    e.preventDefault()
    carryActive.current = true
    cursor.current = { x: e.clientX, y: e.clientY }
    // The cell is free again the instant the card leaves it — a SET, so this
    // very cell is the one the next pull takes back.
    claimed.current.delete(card.slot)
    landed.current -= 1
    setPlaced((placedCards) => placedCards.filter((placedCard) => placedCard.slot !== card.slot))
    setBack({
      ...card,
      w: r.width,
      h: r.height,
      fracX: (e.clientX - r.left) / r.width,
      fracY: (e.clientY - r.top) / r.height,
    })
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: `back` is the trigger; the handlers deliberately use the closure captured when the drag began (I8)
  useEffect(() => {
    if (!back) return
    const mine = runId.current
    const place = () => {
      const el = backRef.current
      if (!el) return
      el.style.left = `${cursor.current.x - back.fracX * back.w}px`
      el.style.top = `${cursor.current.y - back.fracY * back.h}px`
    }
    place()
    const onMove = (e: MouseEvent) => {
      cursor.current = { x: e.clientX, y: e.clientY }
      place()
      const hr = anchors.hand.current?.getBoundingClientRect()
      const over = hr ? e.clientY >= hr.top - BAND_PAD : false
      setDropSlot(over ? slotAt(e.clientX, handItemsRef.current.length) : null)
    }
    const carryHome = (rect: DOMRect | undefined, at?: number) => {
      setBack(null)
      returnToFan(back.uid, back.card, rect, mine, at)
    }
    const onUp = async (e: MouseEvent) => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      const hr = anchors.hand.current?.getBoundingClientRect()
      const rect = backRef.current?.getBoundingClientRect()
      const overHand = hr ? e.clientY >= hr.top - BAND_PAD : false
      const at = dropSlotRef.current ?? slotAt(e.clientX, handItemsRef.current.length)
      setDropSlot(null)
      if (overHand) {
        // Into the slot the POINTER named, not the middle of the fan: the hand
        // just said where, and landing anywhere else ignores it.
        carryHome(rect, at)
        return
      }
      // Released anywhere else: the card FLIES HOME to its own cell. Snapping
      // would read as the drag having failed; it simply goes back.
      const el = backRef.current
      const to = cellEls.current[back.slot]?.getBoundingClientRect()
      if (!reduced && el && rect && to) {
        await play('playToCenter', el, { to })?.finished
      }
      if (runId.current !== mine) return
      claimed.current.add(back.slot)
      landed.current += 1
      setPlaced((placedCards) => [
        ...placedCards,
        { uid: back.uid, card: back.card, slot: back.slot },
      ])
      setBack(null)
      carryActive.current = false
      if (landed.current === cellsRef.current) finish()
    }
    // ON THE CURSOR, it is still ours — and the keeper's answer, if our time
    // runs out while it is held, carries it on from here: into a cell if the
    // answer discards it, home into the fan if not (`anchors.heldCard`).
    const stop = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      setDropSlot(null)
    }
    anchors.hold('hand-limit-back', {
      uid: back.uid,
      el: () => backRef.current,
      take: stop,
      release: () => {
        setBack(null)
        carryActive.current = false
      },
      home: () => {
        stop()
        carryHome(backRef.current?.getBoundingClientRect())
      },
    })
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      anchors.hold('hand-limit-back', null)
    }
  }, [back])

  // the lowest cell nobody has claimed. A SEARCH, not a running count: a card
  // carried back out frees its own cell, and the next pull must be able to take
  // exactly that one back (Task 8).
  const freeSlot = useCallback(() => {
    for (let i = 0; i < cellsRef.current; i += 1) if (!claimed.current.has(i)) return i
    return -1
  }, [])

  const onHandPlay = useCallback(
    (uid: string, drop: HandPlayDrop): boolean => {
      const p = latest.current.pending
      if (
        back ||
        placementReturning ||
        carryActive.current ||
        !enabled ||
        !p ||
        dispatchedRef.current ||
        closedRef.current
      )
        return false
      if (!p.options.includes(uid)) return false
      // AT THE LIMIT: refused, and the kit glides the card home — the existing
      // settle-back (`Hand.tsx`), not a new animation.
      if (pickedRef.current.length >= p.excess) return false
      const item = (state.you?.hand ?? EMPTY_HAND).find((c) => c.uid === uid)
      if (!item) return false
      // the first pull fixes the grid: the excess is known before anything moves
      if (cellsRef.current === 0) {
        cellsRef.current = p.excess
        setCells(p.excess)
      }
      const slot = freeSlot()
      if (slot < 0) return false
      claimed.current.add(slot)
      pickedRef.current = [...pickedRef.current, uid]
      setPicked(pickedRef.current)
      void flyToCell(uid, item.card, slot, drop.rect)
      return true
    },
    [back, placementReturning, enabled, state.you?.hand, flyToCell, freeSlot],
  )

  // Lit while cards are still owed, and only on the cards that answer — the
  // same rule every other hook keeps. One uniform hue rather than the
  // per-category accent: this pick COSTS a card, and the colour is the context
  // of the move, not the type of the card.
  const stateAt = useCallback(
    (index: number): HandCardState => {
      if (carryActive.current || !enabled || !pending || dispatched) return 'idle'
      if (picked.length >= pending.excess) return 'idle'
      const item = handItems[index]
      if (!item) return 'idle'
      return pending.options.includes(item.uid) ? 'playable' : 'idle'
    },
    [enabled, pending, dispatched, picked.length, handItems],
  )

  const accentAt = useCallback(
    (index: number) => (stateAt(index) === 'playable' ? 'var(--danger-accent)' : undefined),
    [stateAt],
  )

  // Hand the grid to the beat WITHOUT ending the gesture: the board is still
  // rendering the beat's shadow, whose `you.hand` still holds these cards, so
  // clearing `picked` here would pop every one of them back into the fan beside
  // its own copy flying to the heap. Same split, same reason, as
  // `_useNeutralizeStaging`'s own `release`.
  const release = useCallback(() => setHanded(true), [])
  const close = useCallback(() => {
    closedRef.current = true
  }, [])

  // The engine said no: the grid opens again and the cards go back to the fan.
  // Scoped to what arrived AFTER this dispatch, and matched on our own choice —
  // a rejected RESOLVE carries the whole original action, so the choice is
  // where the identity lives.
  useEffect(() => {
    if (!dispatched) return
    const sent = dispatchedChoice.current
    if (!sent) return
    const rejectedOurs = events.slice(watermark.current).some((e) => {
      if (e.type !== 'rejected') return false
      const a = e.action
      return (
        a.type === 'RESOLVE' &&
        a.player === sent.player &&
        a.choice.kind === 'handLimit' &&
        a.choice.cards.length === sent.cards.length &&
        a.choice.cards.every((uid, i) => uid === sent.cards[i])
      )
    })
    if (!rejectedOurs) return
    const returning = placed
      .map((p) => {
        const box = cellEls.current[p.slot]?.getBoundingClientRect()
        return box ? { uid: p.uid, card: p.card, from: box } : null
      })
      .filter((x): x is NonNullable<typeof x> => x != null)
    claimed.current.clear()
    landed.current = 0
    dispatchedRef.current = false
    dispatchedChoice.current = null
    setDispatched(false)
    setPlaced([])
    setCells(0)
    cellsRef.current = 0
    if (reduced || returning.length === 0) {
      restorePicked(sent.cards)
      return
    }
    void (async () => {
      const mine = runId.current
      const entries = returning.map((item) => ({
        ...item,
        key: `hl-arrival-${++arrivalSeq.current}`,
      }))
      const context: ArrivalContext = {
        kind: 'rejection',
        run: mine,
        entries: entries.map(({ key, uid }) => ({ key, uid })),
        rejected: [...sent.cards],
      }
      arrivalContext.current = context
      const taken = await arrival.home(entries, ending.current)
      if (runId.current !== mine) return
      if (taken) return
      if (arrivalContext.current !== context) return
      arrivalContext.current = null
      restorePicked(context.rejected)
    })()
  }, [dispatched, events, placed, reduced, arrival.home, restorePicked])

  // The pending is gone: the decision is closed and nothing here may outlive
  // it. While a beat runs, the board renders its shadow — which still carries
  // the pending — so this does not fire mid-beat; the beat's `release()` is
  // what drops the grid's render, and this is what finally clears the fan's
  // filter. Under reduced motion no beat ever runs, and this is the only path.
  useEffect(() => {
    // An accepted local decision clears the projection's pending before its
    // beat measures the standing grid. Keep the cells until that beat calls
    // `release()`; under reduced motion no beat runs, so this remains the
    // synchronous catch-up path.
    if (
      pending ||
      (dispatched && !handed && !reduced) ||
      (cellsRef.current === 0 && pickedRef.current.length === 0)
    )
      return
    runId.current += 1
    flyer.drop()
    arrival.reset()
    wipe()
  }, [pending, dispatched, handed, reduced, wipe, flyer.drop, arrival.reset])

  // A NEW MATCH wipes the gesture — the same boundary, idiom and (inert on this
  // branch, until #19 mints a per-match id) reasoning as its three siblings'.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `matchKey` is the boundary and the only dependency this may have — the resets below are plain functions recreated every render, so listing them would wipe the gesture on every render instead of once per match
  useLayoutEffect(() => {
    runId.current += 1
    wipe()
    flyer.drop()
    arrival.reset()
  }, [matchKey])

  const backOverlay = back ? (
    <div
      key="hand-limit-back"
      className={styles.backFlyer}
      ref={backRef}
      style={{
        left: cursor.current.x - back.fracX * back.w,
        top: cursor.current.y - back.fracY * back.h,
        inlineSize: back.w,
      }}
    >
      <Card card={back.card} interactive={false} width="100%" />
    </div>
  ) : null

  return {
    cells,
    placed,
    picked,
    handed,
    dispatched,
    carrying: back != null || placementReturning,
    owed: pending ? Math.max(0, pending.excess - picked.length) : 0,
    aiPicked,
    overlay: [...flyer.overlay, ...arrival.overlay, ...(backOverlay ? [backOverlay] : [])],
    gapAt: back ? dropSlot : arrival.gapAt,
    gapSize: back ? 1 : arrival.gapSize,
    handItems,
    stateAt,
    accentAt,
    onHandPlay,
    onCellDown,
    bindCell,
    cellAt,
    release,
    close,
  }
}

const EMPTY_HAND: NonNullable<BoardState['you']>['hand'] = []
