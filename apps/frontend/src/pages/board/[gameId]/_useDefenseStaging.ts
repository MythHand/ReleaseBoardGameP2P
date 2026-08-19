// Answering an attack (#101, Task 16): pulling a defence out of the fan and
// dropping it over the attack answers the `defend` pending the engine owes
// us. Active only while that pending is ours — its sibling `_useBoardStaging.ts`
// owns the TURN's plays, and the two never run at once: a window suspends
// normal play, and the engine returns [] from `playableFor` while one is open
// (packages/engine/src/fake/project.ts's own first check).
//
// Legality is the projection's answer throughout: `pending.options` names the
// cards that may answer this attack. There is no separate `sudoOptions` here —
// which defences a Sudo may enhance would come from `state.comboOptions`, the
// same field the combo gesture reads — but a defend-pending's own comboOptions
// entry is a Task 17 concern (today's engine leaves it empty while any pending
// is open; see this task's own report). Nothing here re-derives either.
//
// The plain path is small and mirrors `_useBoardStaging.ts`'s own solo-release
// shape: pull commits and dispatches in the SAME tick (no aim, no partner), the
// card flies to the cover slot at COVER_POSE, and once the flyer lands (or at
// once under reduced motion) a static render at `anchors.cover` takes over —
// `landed` is that gate, the same role `stageLanded` plays for a solo release.
// This is what keeps the fallback in `defenseBeat.runCovered` dead for a local
// defence (Carry #2 of this task's brief): the beat's own
// `!(mine && handoff?.el)` check reads `el` off a REAL, already-standing node,
// in both motion modes, not a flyer that a reduced-motion path never raises.

import type { Event } from '@release/engine'
import type { CardData, HandItem, HandPlayDrop, TableActions } from '@release/ui'
import { play, type Rect, useFlyer, useHandArrival } from '@release/ui/animations'
import {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { BoardAnchors, BoardState } from '~/entities/game/board'
import { COVER_POSE } from '~/entities/game/board'
import { useReducedMotion } from '~/shared/lib/useReducedMotion'

// same 5-line helper comboBeat.tsx/defenseBeat.tsx each keep privately — copy
// it, don't import across runners.
const rectOf = (el: Element | null): Rect | null => {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

export interface DefenseStagedCard {
  uid: string
  card: CardData
  index: number // index in you.hand at pull time — where a return flight lands it
}

export interface DefenseStagedPlay {
  // reserved for Task 17's sudo enhancement (a Sudo staged first, waiting for
  // the defence it enhances) — always null on this task's plain path
  support: DefenseStagedCard | null
  main: DefenseStagedCard | null
  // 'dispatched' the instant a legal pull commits (no aim, no partner to wait
  // on); 'rejected' is the brief window between the engine saying no and the
  // return flight taking the card back — see the rejected-watcher below.
  phase: 'dispatched' | 'rejected'
}

export interface DefenseStaging {
  staged: DefenseStagedPlay | null
  overlay: ReactNode[]
  gapAt: number | null
  gapSize: number
  handItems: HandItem[]
  // reserved for Task 17 (a support's partner accent) — always undefined here
  accentAt: (index: number) => string | undefined
  defenceOptions: string[]
  // reserved for Task 17's fold — mounted by `_Board.tsx` the same way
  // `_useBoardStaging`'s own is, so the page can bind ONE persistent node to
  // whichever hook is live without a branch
  pairRef: RefObject<HTMLDivElement | null>
  onHandPlay: (uid: string, drop: HandPlayDrop) => boolean
  /** the SAME commit + flight + dispatch `onHandPlay` runs, for a card chosen
   * through `PendingPrompt`'s own card list rather than dragged out of the
   * fan (#101, Fix round 1) — the panel is a second door onto the same
   * `defend` decision, and this is what keeps both doors producing the same
   * result: the card flies from its OWN hand slot (found via
   * `anchors.handSlotAt`, the same lookup `comboBeat.tsx`'s `foldIn` uses for
   * a local click-thrown play) rather than a drag's own drop point. */
  answerWith: (uid: string) => boolean
  // reserved for Task 17 (the sudo-partner click) — a no-op on this task's
  // plain path, kept for interface parity with `_useBoardStaging`'s own
  onCardClick: (index: number) => void
  cancel: () => void
  release: () => void
  /** true once the pulled defence's own flight to the cover slot has landed
   * (or at once, under reduced motion) — gates `_Board.tsx`'s static cover
   * render against the carrier still flying it there, same role
   * `_useBoardStaging.ts`'s own `stageLanded` plays for a solo release. */
  landed: boolean
}

export interface Options {
  state: BoardState
  anchors: BoardAnchors
  actions?: TableActions
  events: Event[] // the feed — watched for `rejected` after dispatch
  enabled: boolean // false while the deal or an exclusive beat owns the table
}

export function useDefenseStaging({
  state,
  anchors,
  actions,
  events,
  enabled,
}: Options): DefenseStaging {
  const [staged, setStaged] = useState<DefenseStagedPlay | null>(null)
  const [landed, setLanded] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const reduced = useReducedMotion()
  const flyer = useFlyer()
  const pairRef = useRef<HTMLDivElement>(null)

  // same discipline as `_useBoardStaging.ts`: handlers that run after an
  // await read refs, not state, so they see this tick's truth (I8).
  const stagedRef = useRef(staged)
  const cancellingRef = useRef(cancelling)
  cancellingRef.current = cancelling
  const eventsRef = useRef(events)
  eventsRef.current = events
  // captured the instant a dispatch commits `phase: 'dispatched'` — the
  // rejected-watcher below only reads what came AFTER this point, the same
  // watermark discipline `_useBoardStaging.ts` applies to this same array.
  const dispatchWatermarkRef = useRef(0)

  const commitStaged = (next: DefenseStagedPlay | null) => {
    stagedRef.current = next
    setStaged(next)
  }

  const arrival = useHandArrival(anchors.hand, () => {
    cancellingRef.current = false
    setCancelling(false)
    commitStaged(null)
  })

  // the pending "defend" owed to us — read once so every reader downstream
  // (options, dispatch, the static render) agrees on the same instant of it.
  const pending =
    state.pending?.kind === 'defend' && state.pending.player === state.selfId ? state.pending : null
  const defenceOptions = useMemo(() => pending?.options ?? [], [pending])

  const handItems = useMemo(() => {
    const uid = staged?.main?.uid
    if (!uid) return state.you.hand
    return state.you.hand.filter((c) => c.uid !== uid)
  }, [state.you.hand, staged])

  // reserved for Task 17 — a support awaiting its partner has nothing to
  // accent on this task's plain path.
  const accentAt = useCallback((_index: number) => undefined, [])

  // The shared guard + lookup both entry points below open with: is this uid
  // actually pullable right now, and if so where does it sit in `you.hand`.
  // Neither dispatches nor flies anything — just answers "legal, and where".
  const resolveLegal = useCallback(
    (uid: string): { item: CardData; index: number } | null => {
      if (!enabled || !pending || stagedRef.current) return null
      if (!defenceOptions.includes(uid)) return null
      const index = state.you.hand.findIndex((c) => c.uid === uid)
      const item = state.you.hand[index]
      return item ? { item: item.card, index } : null
    },
    [enabled, pending, defenceOptions, state.you.hand],
  )

  // The shared half of both entry points below: commit the dispatched play,
  // fire the RESOLVE, and fly the card to the cover slot from wherever it
  // came FROM — a drag's own drop point (`onHandPlay`) or the hand slot it
  // still sits in (`answerWith`, the pending panel's own card list). Neither
  // entry point calls `flyer.raise` itself, so there is exactly one place
  // that can leave the fly-in half-built (#101, Fix round 1: PendingPrompt
  // used to bypass this whole path, reopening Carry #2 through its own door).
  // biome-ignore lint/correctness/useExhaustiveDependencies: commitStaged closes only over refs/setStaged and is stable in effect
  const commitAndFly = useCallback(
    (uid: string, card: CardData, index: number, from: Rect | undefined) => {
      commitStaged({ main: { uid, card, index }, support: null, phase: 'dispatched' })
      dispatchWatermarkRef.current = eventsRef.current.length
      setLanded(false) // fresh cycle — the flight below has not carried this card yet
      actions?.onResolve?.({ kind: 'defend', card: uid, combo: undefined })
      void (async () => {
        const to = anchors.cover.current?.getBoundingClientRect()
        if (!reduced && from && to) {
          const [el] = await flyer.raise([{ key: 'cover', card, at: from }])
          if (el) {
            await play('playToCenter', el, {
              from,
              to,
              rotate: COVER_POSE.rot,
              dx: COVER_POSE.dx,
              dy: COVER_POSE.dy,
            })?.finished
          }
          flyer.drop('cover')
        }
        // the carrier has dropped it (or, under reduced motion, there was
        // never one) — `_Board.tsx`'s static cover render may take over now,
        // not a moment before (see `landed`'s own comment above).
        setLanded(true)
      })()
    },
    [reduced, anchors.cover, actions, flyer.raise, flyer.drop],
  )

  // GESTURE — pulling a legal defence out of the fan commits and dispatches
  // at once (no aim, no partner): the plain-defence half of the allowance
  // `_useBoardStaging.ts`'s own solo release already takes for a release with
  // no Code Review to pair.
  const onHandPlay = useCallback(
    (uid: string, drop: HandPlayDrop): boolean => {
      const legal = resolveLegal(uid)
      if (!legal) return false
      commitAndFly(uid, legal.item, legal.index, drop.rect)
      return true
    },
    [resolveLegal, commitAndFly],
  )

  // The pending panel's own answer (#101, Fix round 1): `PendingPrompt`'s
  // card list + confirm button choose a uid without ever touching the fan —
  // there is no drop point to fly from, so the origin is the hand slot the
  // card still stands in, found the same way `comboBeat.tsx`'s `foldIn` finds
  // one for a local click-thrown play (`anchors.handSlotAt`, read BEFORE
  // `commitAndFly` changes `handItems` and reflows the fan out from under it).
  const answerWith = useCallback(
    (uid: string): boolean => {
      const legal = resolveLegal(uid)
      if (!legal) return false
      commitAndFly(
        uid,
        legal.item,
        legal.index,
        rectOf(anchors.handSlotAt(legal.index)) ?? undefined,
      )
      return true
    },
    [resolveLegal, anchors.handSlotAt, commitAndFly],
  )

  // reserved for Task 17 (the sudo-partner click) — nothing on this task's
  // plain path answers a hand click.
  const onCardClick = useCallback((_index: number) => {}, [])

  // cancel — only ever reached today through the rejected-watcher below: the
  // plain path has no cancellable "aiming" phase (dispatch is synchronous with
  // the pull), so a miss-click or Escape arming while `phase` is 'dispatched'
  // is refused, exactly as `_useBoardStaging.ts`'s own `cancel()` refuses a
  // dispatched play.
  // biome-ignore lint/correctness/useExhaustiveDependencies: commitStaged closes only over refs/setStaged and is stable in effect
  const cancel = useCallback(() => {
    const s = stagedRef.current
    if (!s || s.phase === 'dispatched' || cancellingRef.current) return
    const main = s.main
    if (!main) return
    const cRect = anchors.cover.current?.getBoundingClientRect()
    // whatever carrier or static render was showing the defence, gone — the
    // return flight owns it now (a no-op if nothing was raised under this key,
    // e.g. the reduced-motion path, where there never was one)
    flyer.drop('cover')
    if (reduced || !cRect) {
      commitStaged(null)
      return
    }
    cancellingRef.current = true
    setCancelling(true)
    void arrival.arrive(
      [{ key: main.uid, card: main.card, from: cRect }],
      handItems.length,
      main.index,
    )
  }, [reduced, handItems.length, arrival.arrive, anchors.cover, flyer.drop])

  // the projection moved our card out of the hand: the answer was accepted —
  // staging's job is done, the beat (or, absent one, the projection itself)
  // takes over. Same catch-up `_useBoardStaging.ts` runs for a dispatched play.
  // biome-ignore lint/correctness/useExhaustiveDependencies: commitStaged closes only over refs/setStaged and is stable in effect
  useEffect(() => {
    const s = stagedRef.current
    if (s?.phase !== 'dispatched' || !s.main) return
    if (!state.you.hand.some((c) => c.uid === s.main?.uid)) commitStaged(null)
  }, [state.you.hand])

  // the engine said no: the staged defence returns to the fan. A rejected
  // RESOLVE carries no top-level `card` (packages/engine/src/fake/core.ts's
  // `reject()` logs the whole original Action) — the card lives inside
  // `action.choice`, so the watcher matches the pending's own identity there
  // instead of `_useBoardStaging.ts`'s `'card' in e.action` check, which a
  // RESOLVE action never satisfies. Scoped to what arrived AFTER this dispatch
  // (`dispatchWatermarkRef`), same reason as `_useBoardStaging.ts`'s own watcher.
  // biome-ignore lint/correctness/useExhaustiveDependencies: commitStaged closes only over refs/setStaged and is stable in effect
  useEffect(() => {
    const s = stagedRef.current
    if (s?.phase !== 'dispatched' || !s.main) return
    const uid = s.main.uid
    const fresh = events.slice(dispatchWatermarkRef.current)
    const rejectedOurs = fresh.some((e) => {
      if (e.type !== 'rejected') return false
      const a = e.action
      return a.type === 'RESOLVE' && a.choice.kind === 'defend' && a.choice.card === uid
    })
    if (rejectedOurs) {
      // synchronously, ahead of `cancel()`'s own guard read of `.phase` — same
      // reason as `_useBoardStaging.ts`'s own write here
      commitStaged({ ...s, phase: 'rejected' })
      cancel()
    }
  }, [events, cancel])

  // the beat's own clear (Task 13's `defenseBeat.runCovered`) — no flight,
  // just done: the staged node was already standing where the cover goes, so
  // there is nothing here left to double-check. Kept distinct from the
  // flyer's own teardown below — `release()` clears the STAGING state; the
  // flyer that was carrying the visual is dropped by the SAME `onHandPlay`
  // closure once its own flight lands, `landed`'s own comment above.
  // biome-ignore lint/correctness/useExhaustiveDependencies: commitStaged closes only over refs/setStaged and is stable in effect
  const release = useCallback(() => commitStaged(null), [])

  return {
    staged,
    overlay: [...flyer.overlay, ...arrival.overlay],
    gapAt: arrival.gapAt,
    gapSize: arrival.gapSize,
    handItems,
    accentAt,
    defenceOptions,
    pairRef,
    onHandPlay,
    answerWith,
    onCardClick,
    cancel,
    release,
    landed,
  }
}
