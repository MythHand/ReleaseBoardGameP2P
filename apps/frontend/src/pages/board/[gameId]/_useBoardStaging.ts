// The staging gesture (#99): pulling a card that needs a target out of the fan
// stands it at the centre and aims the arrow; a press on a lit target
// dispatches with it. Task 3 covered the pull/aim/dispatch path; Task 4 added
// the ways staging ends without a dispatch — a miss, Escape, and a rejection
// from the engine — plus the guard that keeps a cancel-in-flight from being
// dispatched by a press on the target it just left.
//
// Task 10 (#100) grows the pull into a PAIR: pulling a support (Sudo / Code
// Review) stands IT at the centre instead of a plain aim, and waits for a
// partner — clicked in the hand, not aimed at. The fold is ported from the
// playground's ComboStory (`pickPartner`/`cancelStage`): `state.comboOptions`
// stands in for its mock `validComboTarget`, and the fan's own geometry
// (`slotBox`) stands in for its local `hand` array. `staged` grew from a
// single `StagedCard` into `StagedPlay` — `support`/`main` name which half is
// which, `phase` carries a plain aim and a combo through the SAME 'target' /
// 'dispatched' outcome so `onTargetPick` and the rejected-watcher don't need
// to know which door a play came in through, and `dispatched` (the Task 3
// return) is now derived from `phase` rather than tracked separately, so the
// two can never disagree.
//
// Same render harness as boardComponent.test.tsx (forked from apps/ui's own
// Table suite) — see that file's header for why.

import type { Event } from '@release/engine'
import type {
  CardData,
  HandItem,
  HandPlayDrop,
  Point,
  TableActions,
  TableTarget,
} from '@release/ui'
import { CARD_RATIO, CARD_W, centerOf, PAIR_AUX_POSE, slotPlacement, useArrow } from '@release/ui'
import {
  enterPose,
  nextFrames,
  play,
  type Rect,
  useFlyer,
  useHandArrival,
} from '@release/ui/animations'
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
import { useReducedMotion } from '~/shared/lib/useReducedMotion'

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

// the two cards fold into a pair at the centre — ComboStory's own value
const MERGE_MS = 620

export interface StagedCard {
  uid: string
  card: CardData
  index: number // index in you.hand at pull time — where a cancel returns it
}

export interface StagedPlay {
  support: StagedCard | null // the pulled Sudo / Code Review — null for a plain aim
  main: StagedCard | null // the partner once picked, or the plain pulled card
  phase: 'aim' | 'partner' | 'target' | 'dispatched'
  merged: boolean // the pair flyer owns the centre
}

export interface BoardStaging {
  staged: StagedPlay | null
  dispatched: boolean // derived: staged?.phase === 'dispatched'
  targets: TableTarget[] // the staged card's — [] when nothing staged
  arrow: { from: Point | null; to: Point | null; active: boolean }
  overlay: ReactNode[] // flyer + return-flight overlays
  gapAt: number | null // fan gap while a cancel returns cards
  gapSize: number
  handItems: HandItem[] // you.hand minus the staged card(s)
  accentAt: (index: number) => string | undefined // partner lighting while a support awaits one
  pairRef: RefObject<HTMLDivElement | null> // the persistent pair-flyer node _Board mounts
  onHandPlay: (uid: string, drop: HandPlayDrop) => boolean
  onCardClick: (index: number) => void // the partner pick — the fold
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
  const [staged, setStaged] = useState<StagedPlay | null>(null)
  // True from the moment a cancel is ACCEPTED until its return flight lands —
  // not the same span as `!staged`. `staged` only clears in `onLanded`, ~480ms
  // into the flight (useHandArrival's FLIGHT_MS), so without this a press on
  // the seat the card was aimed at stays live for that whole glide and
  // dispatches a play for a card that is already on its way back to the fan.
  const [cancelling, setCancelling] = useState(false)
  const reduced = useReducedMotion()
  const arrowCtl = useArrow()
  const flyer = useFlyer()
  // the pair's own persistent DOM node — CardPair mounts inside it (_Board.tsx)
  // and the fold paints frame-by-frame on its `[data-main]`/`[data-aux]`
  // children, same as ComboStory's own `flyRef`.
  const pairRef = useRef<HTMLDivElement>(null)

  // handlers below run after an await (or after the SAME click bubbles past a
  // target that did not stop propagation — Seat's own onClick does not) —
  // both read refs, not state, so they see this tick's truth, not last
  // render's (I8). `stagedRef` is now the ONE thing every phase change writes
  // through `commitStaged`, so a synchronous read of `.phase` is always
  // current — no separate `dispatchedRef` to drift from it.
  const stagedRef = useRef(staged)
  const cancellingRef = useRef(cancelling)
  cancellingRef.current = cancelling
  // ComboStory's own `playing` (its `pickPartner` guard, `cancelStage`'s
  // `cancellable`): true from the moment a partner is picked until the fold's
  // `finish()` runs.
  // The fold is IRREVOCABLE once committed — merged/phase stay 'partner' for
  // the whole ~620ms `foldIntoPair` animation, so without this a cancel landing
  // mid-fold starts a return flight for a play that dispatches anyway a moment
  // later (the fold's own async closure keeps running to its `finish()`
  // regardless of what `cancel()` does), and a second click on another
  // candidate could start an overlapping second fold on top of the first.
  const foldingRef = useRef(false)

  const commitStaged = (next: StagedPlay | null) => {
    stagedRef.current = next
    setStaged(next)
  }

  const arrival = useHandArrival(anchors.hand, () => {
    // The return flight landed: the cancel is over. Synchronous, same reason
    // as `onTargetPick`'s own ref write below — a press landing in THIS tick
    // must see the cancel as already resolved, not wait for the render this
    // `setCancelling(false)` schedules.
    cancellingRef.current = false
    setCancelling(false)
    commitStaged(null)
  })

  const targets = useMemo(
    () =>
      staged?.main && staged.phase !== 'dispatched' && !cancelling
        ? (state.targets?.[staged.main.uid] ?? [])
        : [],
    [staged, cancelling, state.targets],
  )

  const handItems = useMemo(() => {
    if (!staged) return state.you.hand
    const out = new Set(
      [staged.support?.uid, staged.main?.uid].filter((uid): uid is string => Boolean(uid)),
    )
    return state.you.hand.filter((c) => !out.has(c.uid))
  }, [state.you.hand, staged])

  const aimFromCentre = useCallback(() => {
    const el = anchors.centre.current
    if (el) arrowCtl.aim(centerOf(el))
  }, [anchors.centre, arrowCtl.aim])

  // the card box of a hand card, from the FAN's own geometry, NOT a slot's
  // rotated bounding rect — a slot is rotated, so its bounding rect is the box
  // AROUND the tilted card and a flight from it jumps on the first frame (I6).
  const slotBox = useCallback(
    (i: number, total: number): Rect | undefined => {
      const hr = anchors.hand.current?.getBoundingClientRect()
      if (!hr) return undefined
      const base = slotPlacement(i, total)
      const height = CARD_W * CARD_RATIO
      return {
        left: hr.left + hr.width / 2 + base.x - CARD_W / 2,
        top: hr.bottom + base.y - height,
        width: CARD_W,
        height,
      }
    },
    [anchors.hand],
  )

  // cancel — a miss, Escape, or an invalid partner pick sends whatever is
  // standing at the centre back into the fan at once. A lone support/aim
  // returns the same single-card way Task 4 already built; a merged pair
  // returns as ComboStory's `cancelStage` does — both halves off the pair
  // flyer node, landing on the SUPPORT's own pull-time index sized 2 (one
  // group; the fan settles to projection order once `staged` clears).
  // biome-ignore lint/correctness/useExhaustiveDependencies: commitStaged closes only over refs/setStaged and is stable in effect
  const cancel = useCallback(() => {
    const s = stagedRef.current
    if (!s || s.phase === 'dispatched' || cancellingRef.current || foldingRef.current) return
    arrowCtl.stop()
    const cRect = anchors.centre.current?.getBoundingClientRect()
    if (reduced || !cRect) {
      if (pairRef.current) pairRef.current.style.opacity = '0'
      commitStaged(null)
      return
    }
    // Set synchronously, ahead of the state update — same reason as
    // `onTargetPick`'s own write: a press on the seat this card was aimed at
    // can land in THIS tick, before React commits `cancelling`'s first
    // render, and both this guard and the `targets` memo have to already
    // read the return flight as "nothing staged."
    cancellingRef.current = true
    setCancelling(true)
    if (s.merged && s.support && s.main) {
      const el = pairRef.current
      void arrival.arrive(
        [
          { key: s.support.uid, card: s.support.card, el, anchor: 'aux' as const, from: cRect },
          { key: s.main.uid, card: s.main.card, el, anchor: 'main' as const, from: cRect },
        ],
        handItems.length,
        s.support.index,
      )
      // `arrive`'s own geometry pass (above) measured the pair while it was
      // still visible — hide it now so the flight overlay's own copies are
      // the only thing on screen (ComboStory's `hideFlyer`, called right
      // after starting the same flight).
      if (el) el.style.opacity = '0'
      return
    }
    const only = s.support ?? s.main
    if (!only) return
    void arrival.arrive(
      [{ key: only.uid, card: only.card, from: cRect }],
      handItems.length,
      only.index,
    )
  }, [reduced, handItems.length, arrival.arrive, anchors.centre, arrowCtl.stop])

  // While a support waits for a partner, the cards it can fold with keep
  // their own category accent — the support's own, per ComboStory (the TYPE
  // is the message). Goes out the moment a partner is picked: the clicked
  // card is no longer in `handItems`, so there is nothing left to light
  // regardless of any candidates still technically eligible.
  const accentAt = useCallback(
    (index: number) => {
      const support = staged?.phase === 'partner' ? staged.support : null
      const item = support ? handItems[index] : undefined
      if (!support || !item) return undefined
      const partners = state.comboOptions?.[support.uid] ?? []
      return partners.includes(item.uid) ? `var(--cat-${support.card.category})` : undefined
    },
    [staged, handItems, state.comboOptions],
  )

  // GESTURE — pulling a card out of the fan puts it on the table. A card with
  // its own targets stages a plain aim (Task 3's path: `main` set, `phase:
  // 'aim'`); a support with no targets of its own but a combo partner stages
  // the pair's first half instead (`support` set, `phase: 'partner'`) — the
  // arrow is armed from the centre either way (ComboStory's `handPlay` always
  // arms it, whether or not the standing card itself can be aimed).
  // biome-ignore lint/correctness/useExhaustiveDependencies: commitStaged closes only over refs/setStaged and is stable in effect
  const onHandPlay = useCallback(
    (uid: string, drop: HandPlayDrop): boolean => {
      if (!enabled || stagedRef.current) return false
      const index = state.you.hand.findIndex((c) => c.uid === uid)
      const item = state.you.hand[index]
      if (!item) return false
      const hasTarget = (state.targets?.[uid] ?? []).length > 0
      const partners = state.comboOptions?.[uid] ?? []
      if (!hasTarget && partners.length === 0) return false // pull only what plays alone or with a partner
      const card: StagedCard = { uid, card: item.card, index }
      commitStaged(
        hasTarget
          ? { support: null, main: card, phase: 'aim', merged: false }
          : { support: card, main: null, phase: 'partner', merged: false },
      )
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
      state.comboOptions,
      reduced,
      aimFromCentre,
      flyer.raise,
      flyer.drop,
      anchors.centre,
    ],
  )

  // the fold — ported from ComboStory's `pickPartner`. The support is ALREADY
  // standing at the centre; only the partner travels, and its entry pose off
  // the pair's own frame is identity (`enterPose(cRect, cRect)`) — the
  // degenerate case, no branch, same as the main half's real one.
  // biome-ignore lint/correctness/useExhaustiveDependencies: commitStaged closes only over refs/setStaged and is stable in effect
  const onCardClick = useCallback(
    (index: number) => {
      if (!enabled || cancellingRef.current || foldingRef.current) return
      const s = stagedRef.current
      if (s?.phase !== 'partner' || !s.support) return
      const item = handItems[index]
      if (!item) return
      const support = s.support
      const partners = state.comboOptions?.[support.uid] ?? []
      if (!partners.includes(item.uid)) {
        cancel() // not a valid partner — the whole staging returns, ComboStory's own answer
        return
      }
      const cRect = anchors.centre.current?.getBoundingClientRect()
      if (!cRect) return
      arrowCtl.stop() // the choice is made — nothing is pointed at while the pair folds
      const mainIndex = state.you.hand.findIndex((c) => c.uid === item.uid)
      const main: StagedCard = { uid: item.uid, card: item.card, index: mainIndex }
      commitStaged({ support, main, phase: 'partner', merged: true })
      // the fold is committed — irrevocable until `finish()` runs (ComboStory's
      // own `playing`); `cancel()` and a second click both refuse while this is
      // true, so nothing can race the automatic dispatch that follows the fold.
      foldingRef.current = true

      // after the fold: a window covering the partner dispatches onAttack at
      // once; a partner with its own targets waits at the centre for one;
      // anything else (a release) plays straight through.
      const finish = () => {
        foldingRef.current = false
        const windowOpen = Boolean(state.window?.canAttackWith?.includes(main.uid))
        if (windowOpen) {
          commitStaged({ support, main, phase: 'dispatched', merged: true })
          actions?.onAttack?.(main.uid, support.uid)
        } else if ((state.targets?.[main.uid] ?? []).length > 0) {
          commitStaged({ support, main, phase: 'target', merged: true })
          aimFromCentre()
        } else {
          commitStaged({ support, main, phase: 'dispatched', merged: true })
          actions?.onPlay?.(main.uid, undefined, support.uid)
        }
      }

      const el = pairRef.current
      const mainHand = reduced ? undefined : slotBox(index, handItems.length)
      if (reduced || !mainHand) {
        // reduced motion (or no fan geometry to fold from) places instantly —
        // CardPair's own inline pose (identity main, PAIR_AUX_POSE aux) IS the
        // pair at rest, nothing to paint frame by frame.
        if (el) {
          el.style.left = `${cRect.left}px`
          el.style.top = `${cRect.top}px`
          el.style.width = `${cRect.width}px`
          el.style.transform = 'none'
          el.style.opacity = '1'
        }
        finish()
        return
      }
      void (async () => {
        try {
          await nextFrames() // the CardPair React just mounted has painted (I2)
          if (!el) return
          for (const anim of el.getAnimations?.({ subtree: true }) ?? []) anim.cancel() // I3
          el.style.left = `${cRect.left}px`
          el.style.top = `${cRect.top}px`
          el.style.width = `${cRect.width}px`
          el.style.transform = 'none'
          const mainEl = el.querySelector<HTMLElement>('[data-main]')
          const auxEl = el.querySelector<HTMLElement>('[data-aux]')
          if (!mainEl || !auxEl) return
          mainEl.style.transform = enterPose(mainHand, cRect)
          auxEl.style.transform = enterPose(cRect, cRect)
          el.style.opacity = '1'
          await nextFrames()

          // MERGING AT THE CENTRE — the partner arrives and the pair folds together
          const a1 = play('foldIntoPair', mainEl, { from: mainHand, box: cRect, dur: MERGE_MS })
          const a2 = play('foldIntoPair', auxEl, {
            from: cRect,
            box: cRect,
            pose: PAIR_AUX_POSE,
            dur: MERGE_MS,
            snap: true,
          })
          await Promise.all([a1?.finished, a2?.finished])
          finish()
        } finally {
          // every exit clears the lock — the early returns above (`pairRef`
          // gone, the CardPair's own markers missing) and a rejecting
          // `.finished` all bypass `finish()` entirely, and `finish()`'s own
          // clear only covers the success path. `finish()` already cleared it
          // by the time this runs there, so the second write here is a
          // harmless no-op (a boolean set to the value it already holds) —
          // it exists for the OTHER exits, not that one.
          foldingRef.current = false
        }
      })()
    },
    [
      enabled,
      handItems,
      state.comboOptions,
      state.window,
      state.targets,
      state.you.hand,
      reduced,
      slotBox,
      arrowCtl.stop,
      aimFromCentre,
      actions,
      cancel,
    ],
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: commitStaged closes only over refs/setStaged and is stable in effect
  const onTargetPick = useCallback(
    (target: TableTarget) => {
      const s = stagedRef.current
      if (!s?.main || s.phase === 'dispatched' || cancellingRef.current) return
      if (!targets.some((t) => sameTarget(t, target))) return
      arrowCtl.stop()
      // Set synchronously, ahead of the state update: Seat's own click handler
      // does not stop propagation for a `player`-kind target (ReleaseZone's
      // does), so this same click still reaches the table's handleTableClick
      // before React re-renders. That handler cancels through this hook's own
      // `cancel()`, which reads this ref — so the guard has to be true THIS
      // tick, not next render's, or the card it just dispatched would fly
      // straight back to the fan.
      commitStaged({ ...s, phase: 'dispatched' })
      actions?.onPlay?.(s.main.uid, target, s.support?.uid)
    },
    [targets, actions, arrowCtl.stop],
  )

  // the projection moved our card out of the hand: the play was accepted —
  // staging's job is done, the centre pending render takes over seamlessly
  // biome-ignore lint/correctness/useExhaustiveDependencies: commitStaged closes only over refs/setStaged and is stable in effect
  useEffect(() => {
    const s = stagedRef.current
    if (s?.phase !== 'dispatched' || !s.main) return
    if (!state.you.hand.some((c) => c.uid === s.main?.uid)) commitStaged(null)
  }, [state.you.hand])

  // the engine said no: the staged play returns to the fan. ATTACK's own
  // rejection carries both halves (`card` the main, `combo` the support), so
  // either naming ours is enough.
  // biome-ignore lint/correctness/useExhaustiveDependencies: commitStaged closes only over refs/setStaged and is stable in effect
  useEffect(() => {
    const s = stagedRef.current
    if (s?.phase !== 'dispatched') return
    const rejectedOurs = events.some((e) => {
      if (e.type !== 'rejected' || !('card' in e.action)) return false
      return (
        (s.main && e.action.card === s.main.uid) || (s.support && e.action.combo === s.support.uid)
      )
    })
    if (rejectedOurs) {
      // Synchronously, same reason as `onTargetPick`'s own write: `cancel()`
      // runs in the SAME tick, right below, and its own guard reads this
      // ref's `.phase` — leaving it at 'dispatched' would make `cancel()`
      // refuse the very return it is being called to perform. The exact
      // phase it reverts to doesn't matter beyond that guard: nothing else
      // reads it before `cancel()` replaces it with the flight's own state.
      commitStaged({ ...s, phase: s.support ? 'target' : 'aim' })
      cancel()
    }
  }, [events, cancel])

  return {
    staged,
    dispatched: staged?.phase === 'dispatched',
    targets,
    arrow: arrowCtl,
    overlay: [...flyer.overlay, ...arrival.overlay],
    gapAt: arrival.gapAt,
    gapSize: arrival.gapSize,
    handItems,
    accentAt,
    pairRef,
    onHandPlay,
    onCardClick,
    onTargetPick,
    cancel,
  }
}
