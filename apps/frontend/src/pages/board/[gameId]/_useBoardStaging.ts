import type { Event } from '@release/engine'
import type {
  CardData,
  HandItem,
  HandPlayDrop,
  Point,
  TableActions,
  TableTarget,
} from '@release/ui'
import { centerOf, useArrow } from '@release/ui'
import { play, useFlyer, useHandArrival } from '@release/ui/animations'
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BoardAnchors, BoardState } from '~/entities/game/board'
import { useReducedMotion } from '~/shared/lib/useReducedMotion'

// THE staging gesture (#99): pulling a card that needs a target out of the fan
// puts it INTO the turn — it flies to the centre of the table and stands there,
// open to everyone, while the cards/seats it may aim at light up. A press on a
// lit target dispatches; a miss (Task 4) or Escape returns the whole staging to
// the fan at once. A card with no target dispatches straight from the fan
// instead (`_useBoardInteractions.onCardClick`) — this hook never sees it.
//
// Moved verbatim from the pre-#99 `_useBoardInteractions.ts` — the comparison a
// target pick still needs, structural and order-independent so a click site
// building a target object in a different field order than the projection
// still compares equal.
const sameTarget = (a: TableTarget, b: TableTarget): boolean => {
  if (a.kind !== b.kind) return false
  switch (a.kind) {
    case 'player':
      return b.kind === 'player' && a.player === b.player
    case 'release':
      return b.kind === 'release' && a.player === b.player && a.slot === b.slot
    case 'monitoring':
      return b.kind === 'monitoring' && a.player === b.player
    case 'card':
      return b.kind === 'card' && a.card === b.card
    case 'pile':
      return b.kind === 'pile' && a.pile === b.pile
  }
}

export interface StagedCard {
  uid: string
  card: CardData
  index: number // index in you.hand at pull time — where a cancel returns it
}

export interface BoardStaging {
  staged: StagedCard | null
  dispatched: boolean // true between dispatch and the projection moving
  targets: TableTarget[] // the staged card's — [] when nothing staged
  arrow: { from: Point | null; to: Point | null; active: boolean }
  overlay: ReactNode[] // flyer + return-flight overlays
  gapAt: number | null // fan gap while a cancel returns cards
  gapSize: number
  handItems: HandItem[] // you.hand minus the staged card
  onHandPlay: (uid: string, drop: HandPlayDrop) => boolean
  onTargetPick: (target: TableTarget) => void
  cancel: () => void
}

export interface Options {
  state: BoardState
  anchors: BoardAnchors
  actions?: TableActions
  events: Event[] // the feed — watched for `rejected` after dispatch
  enabled: boolean // false while the deal or an exclusive beat owns the table
}

export function useBoardStaging({
  state,
  anchors,
  actions,
  events,
  enabled,
}: Options): BoardStaging {
  const [staged, setStaged] = useState<StagedCard | null>(null)
  const [dispatched, setDispatched] = useState(false)
  const reduced = useReducedMotion()
  const arrowCtl = useArrow()
  const flyer = useFlyer()
  const arrival = useHandArrival(anchors.hand, () => setStaged(null))

  // handlers below run after an await (or after the SAME click bubbles past a
  // target that did not stop propagation — Seat's own onClick does not) —
  // both read refs, not state, so they see this tick's truth, not last
  // render's (I8).
  const stagedRef = useRef(staged)
  stagedRef.current = staged
  const dispatchedRef = useRef(dispatched)
  dispatchedRef.current = dispatched

  const targets = useMemo(
    () => (staged && !dispatched ? (state.targets?.[staged.uid] ?? []) : []),
    [staged, dispatched, state.targets],
  )

  const aimFromCentre = useCallback(() => {
    const el = anchors.centre.current
    if (el) arrowCtl.aim(centerOf(el))
  }, [anchors.centre, arrowCtl.aim])

  const onHandPlay = useCallback(
    (uid: string, drop: HandPlayDrop): boolean => {
      if (!enabled || stagedRef.current) return false
      const index = state.you.hand.findIndex((c) => c.uid === uid)
      const item = state.you.hand[index]
      if (!item) return false
      if ((state.targets?.[uid] ?? []).length === 0) return false // pull only what must aim
      setStaged({ uid, card: item.card, index })
      void (async () => {
        const cRect = anchors.centre.current?.getBoundingClientRect()
        if (!reduced && drop.rect && cRect) {
          const [el] = await flyer.raise([{ key: 'stage', card: item.card, at: drop.rect }])
          if (el) await play('playToCenter', el, { from: drop.rect, to: cRect })?.finished
          flyer.drop('stage')
        }
        aimFromCentre()
      })()
      return true
    },
    [
      enabled,
      state.you.hand,
      state.targets,
      reduced,
      aimFromCentre,
      flyer.raise,
      flyer.drop,
      anchors.centre,
    ],
  )

  const onTargetPick = useCallback(
    (target: TableTarget) => {
      const s = stagedRef.current
      if (!s || dispatchedRef.current) return
      if (!targets.some((t) => sameTarget(t, target))) return
      arrowCtl.stop()
      // Set synchronously, ahead of the state update: Seat's own click handler
      // does not stop propagation for a `player`-kind target (ReleaseZone's
      // does), so this same click still reaches the table's handleTableClick
      // before React re-renders. That handler cancels through this hook's own
      // `cancel()`, which reads this ref — so the guard has to be true THIS
      // tick, not next render's, or the card it just dispatched would fly
      // straight back to the fan.
      dispatchedRef.current = true
      setDispatched(true)
      actions?.onPlay?.(s.uid, target, undefined)
    },
    [targets, actions, arrowCtl.stop],
  )

  const cancel = useCallback(() => {
    const s = stagedRef.current
    if (!s || dispatchedRef.current) return
    arrowCtl.stop()
    const cRect = anchors.centre.current?.getBoundingClientRect()
    if (reduced || !cRect) {
      setStaged(null)
      return
    }
    // back into the fan at the slot it came from; onLanded clears `staged`
    void arrival.arrive(
      [{ key: s.uid, card: s.card, from: cRect }],
      state.you.hand.length - 1,
      s.index,
    )
  }, [reduced, state.you.hand.length, arrowCtl.stop, arrival.arrive, anchors.centre])

  // the projection moved our card out of the hand: the play was accepted —
  // staging's job is done, the centre pending render takes over seamlessly
  useEffect(() => {
    const s = stagedRef.current
    if (!s || !dispatchedRef.current) return
    if (!state.you.hand.some((c) => c.uid === s.uid)) {
      setStaged(null)
      setDispatched(false)
    }
  }, [state.you.hand])

  // the engine said no: the staged card returns to the fan
  useEffect(() => {
    const s = stagedRef.current
    if (!s || !dispatchedRef.current) return
    const rejectedOurs = events.some(
      (e) => e.type === 'rejected' && 'card' in e.action && e.action.card === s.uid,
    )
    if (rejectedOurs) {
      // Synchronously, same reason as `onTargetPick`'s own write: `cancel()`
      // runs in the SAME tick, right below, and its own guard reads this ref
      // — `setDispatched(false)` alone would not be visible to it until next
      // render, and `cancel` would refuse the very return it is being called
      // to perform.
      dispatchedRef.current = false
      setDispatched(false)
      cancel()
    }
  }, [events, cancel])

  const handItems = useMemo(
    () => (staged ? state.you.hand.filter((c) => c.uid !== staged.uid) : state.you.hand),
    [state.you.hand, staged],
  )

  return {
    staged,
    dispatched,
    targets,
    arrow: arrowCtl,
    overlay: [...flyer.overlay, ...arrival.overlay],
    gapAt: arrival.gapAt,
    gapSize: arrival.gapSize,
    handItems,
    onHandPlay,
    onTargetPick,
    cancel,
  }
}
