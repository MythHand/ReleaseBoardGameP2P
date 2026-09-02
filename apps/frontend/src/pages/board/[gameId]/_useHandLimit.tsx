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
import type { CardData, HandCardState, HandItem, HandPlayDrop, TableActions } from '@release/ui'
import { play, type Rect, useFlyer, useHandArrival } from '@release/ui/animations'
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { BoardAnchors, BoardState } from '~/entities/game/board'
import { useReducedMotion } from '~/shared/lib/useReducedMotion'

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
  /** how many cards are still owed; 0 outside the decision */
  owed: number
  overlay: ReactNode[]
  handItems: HandItem[]
  stateAt: (index: number) => HandCardState
  accentAt: (index: number) => string | undefined
  onHandPlay: (uid: string, drop: HandPlayDrop) => boolean
  bindCell: (slot: number, el: HTMLDivElement | null) => void
  cellAt: (slot: number) => HTMLElement | null
  /** the beat's own hand-over — drops the grid's render, keeps the fan filtered */
  release: () => void
}

export interface Options {
  state: BoardState
  anchors: BoardAnchors
  actions?: TableActions
  events: Event[] // the feed — watched for `rejected` after dispatch
  enabled: boolean // false while the deal or an exclusive beat owns the table
  /** the match this gesture belongs to — the same boundary its siblings keep */
  matchKey?: string | null
}

export function useHandLimit({
  state,
  anchors,
  actions,
  events,
  enabled,
  matchKey = null,
}: Options): HandLimitStaging {
  const reduced = useReducedMotion()
  const flyer = useFlyer()
  const [cells, setCells] = useState(0)
  const [placed, setPlaced] = useState<GridCard[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [handed, setHanded] = useState(false)
  const [dispatched, setDispatched] = useState(false)

  // Ours to answer, or nobody's. `options` is the projection's own answer to
  // which cards may go (every uid in the hand, `[]` for everyone else), and
  // nothing here re-derives it.
  const pending =
    state.pending?.kind === 'handLimit' && state.pending.player === state.selfId
      ? state.pending
      : null

  // A flight spans several awaits and must never read a stale render (I8), so
  // everything it needs is mirrored in a ref.
  const cellsRef = useRef(0)
  const pickedRef = useRef<string[]>([])
  const dispatchedRef = useRef(false)
  const claimed = useRef(new Set<number>())
  const landed = useRef(0)
  const cellEls = useRef<Record<number, HTMLElement | null>>({})
  const flightSeq = useRef(0)
  // bumped on a match wipe — a flight from a dead match stops committing
  const runId = useRef(0)
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
      picked.length === 0 ? state.you.hand : state.you.hand.filter((c) => !picked.includes(c.uid)),
    [state.you.hand, picked],
  )
  const handItemsRef = useRef(handItems)
  handItemsRef.current = handItems

  // the cards return to the fan on a rejection — the shared step, the same one
  // a draw and an undo use, so a refused decision reads as the event it undoes
  const arrival = useHandArrival(anchors.hand, () => {
    pickedRef.current = []
    setPicked([])
  })

  const bindCell = useCallback((slot: number, el: HTMLDivElement | null) => {
    if (el) cellEls.current[slot] = el
    else delete cellEls.current[slot]
  }, [])
  const cellAt = useCallback((slot: number) => cellEls.current[slot] ?? null, [])

  const wipe = useCallback(() => {
    claimed.current.clear()
    landed.current = 0
    cellEls.current = {}
    cellsRef.current = 0
    pickedRef.current = []
    dispatchedRef.current = false
    setCells(0)
    setPlaced([])
    setPicked([])
    setHanded(false)
    setDispatched(false)
  }, [])

  // The last cell filled: the decision is complete and goes out as ONE action.
  // Fired on the LANDING rather than on the drop, so the grid is provably whole
  // when it locks — and so a carry-back can never race the dispatch.
  const finish = useCallback(() => {
    if (dispatchedRef.current) return
    dispatchedRef.current = true
    setDispatched(true)
    watermark.current = latest.current.events.length
    latest.current.actions?.onResolve?.({ kind: 'handLimit', cards: pickedRef.current })
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
      // raising also lets the grid's cells mount before they are measured
      const [el] = await flyer.raise([{ key, card, at: from, layer: slot }])
      if (runId.current !== mine) return
      const to = cellEls.current[slot]?.getBoundingClientRect()
      if (el && to) await play('playToCenter', el, { from, to })?.finished
      if (runId.current !== mine) return
      // the real card takes over the cell as the carrier goes — one commit, no
      // gap for the eye to catch
      commit()
      flyer.drop(key)
    },
    [reduced, finish, flyer.raise, flyer.drop],
  )

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
      if (!enabled || !p || dispatchedRef.current) return false
      if (!p.options.includes(uid)) return false
      // AT THE LIMIT: refused, and the kit glides the card home — the existing
      // settle-back (`Hand.tsx`), not a new animation.
      if (pickedRef.current.length >= p.excess) return false
      const item = state.you.hand.find((c) => c.uid === uid)
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
    [enabled, state.you.hand, flyToCell, freeSlot],
  )

  // Lit while cards are still owed, and only on the cards that answer — the
  // same rule every other hook keeps. One uniform hue rather than the
  // per-category accent: this pick COSTS a card, and the colour is the context
  // of the move, not the type of the card.
  const stateAt = useCallback(
    (index: number): HandCardState => {
      if (!enabled || !pending || dispatched) return 'idle'
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

  // The engine said no: the grid opens again and the cards go back to the fan.
  // Scoped to what arrived AFTER this dispatch, and matched on our own choice —
  // a rejected RESOLVE carries the whole original action, so the choice is
  // where the identity lives.
  useEffect(() => {
    if (!dispatched) return
    const rejectedOurs = events.slice(watermark.current).some((e) => {
      if (e.type !== 'rejected') return false
      const a = e.action
      return a.type === 'RESOLVE' && a.choice.kind === 'handLimit'
    })
    if (!rejectedOurs) return
    const back = placed
      .map((p) => {
        const box = cellEls.current[p.slot]?.getBoundingClientRect()
        return box ? { key: p.uid, card: p.card, from: box } : null
      })
      .filter((x): x is NonNullable<typeof x> => x != null)
    claimed.current.clear()
    landed.current = 0
    dispatchedRef.current = false
    setDispatched(false)
    setPlaced([])
    setCells(0)
    cellsRef.current = 0
    if (reduced || back.length === 0) {
      pickedRef.current = []
      setPicked([])
      return
    }
    void arrival.arrive(back, handItemsRef.current.length)
  }, [dispatched, events, placed, reduced, arrival.arrive])

  // The pending is gone: the decision is closed and nothing here may outlive
  // it. While a beat runs, the board renders its shadow — which still carries
  // the pending — so this does not fire mid-beat; the beat's `release()` is
  // what drops the grid's render, and this is what finally clears the fan's
  // filter. Under reduced motion no beat ever runs, and this is the only path.
  useEffect(() => {
    if (pending || cellsRef.current === 0) return
    wipe()
  }, [pending, wipe])

  // A NEW MATCH wipes the gesture — the same boundary, idiom and (inert on this
  // branch, until #19 mints a per-match id) reasoning as its three siblings'.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `matchKey` is the boundary and the only dependency this may have — the resets below are plain functions recreated every render, so listing them would wipe the gesture on every render instead of once per match
  useLayoutEffect(() => {
    runId.current += 1
    wipe()
    flyer.drop()
    arrival.reset()
  }, [matchKey])

  return {
    cells,
    placed,
    picked,
    handed,
    dispatched,
    owed: pending ? Math.max(0, pending.excess - picked.length) : 0,
    overlay: [...flyer.overlay, ...arrival.overlay],
    handItems,
    stateAt,
    accentAt,
    onHandPlay,
    bindCell,
    cellAt,
    release,
  }
}
