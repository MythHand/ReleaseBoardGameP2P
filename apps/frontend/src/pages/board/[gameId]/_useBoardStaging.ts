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
  /** the hand uids that may pay a staged release's cost — [] when none is owed */
  costOptions: string[]
  /** a click in the fan pays the cost and dispatches the RESOLVE */
  onCostPick: (uid: string) => void
  /** true once a pulled release's own flight to the stage slot has landed —
   * gates `_Board.tsx`'s static stage-slot render against the carrier that is
   * still flying it there */
  stageLanded: boolean
  /** the card that paid a staged release's cost, once its own flight has
   * landed — held open beside the release until a later task moves it on */
  paidCost: { uid: string; card: CardData } | null
  /** true while a CANCELLED release's own return flight is airborne (Task 9,
   * fix round 1) — `_Board.tsx`'s static stage-slot render must hide for this
   * span too, alongside `stageLanded`, or the return flight and the static
   * card it is carrying away are both on screen at once for as long as the
   * projected pending takes to catch up (a full round trip). Distinct from
   * `stageLanded`: that one answers whether the INCOMING flight landed, this
   * one whether an OUTGOING one has started — conflating them would hide the
   * release during the unrelated cost-payment flight too. */
  releaseReturning: boolean
  // The combo beat's own clear (#100, Task 11): once a dispatched play's
  // `attackPlaced`/`releasePlaced` beat has taken the staged node over — it is
  // already standing exactly where the pending render (or the release zone)
  // wants it — the beat calls this instead of `cancel()`, which would start a
  // return flight for a play that is not coming back.
  release: () => void
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
  // the feed as of THIS render — read for its `.length`, never scanned
  // directly outside the rejected-watcher effect below (which has its own,
  // fresher closure over `events` since it re-runs whenever the array does).
  const eventsRef = useRef(events)
  eventsRef.current = events
  // How far into the feed a dispatch had already looked, captured the instant
  // it committed `phase: 'dispatched'` (`onTargetPick`, both dispatching arms
  // of `onCardClick`'s `finish()`) — `useGame` accumulates events for the
  // whole match and the rejected-watcher below only reads what came AFTER
  // this point. Without it, a card rejected once and later re-dispatched
  // reads its own OLD rejection off the feed the moment anything else syncs
  // in between — the same watermark discipline `useBeats` applies to this
  // same array, keyed there by event id; here by length, since it is captured
  // fresh at every dispatch rather than held for a whole match.
  const dispatchWatermarkRef = useRef(0)
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
    // Unconditional, same reason `commitStaged(null)` above is: this callback
    // fires for EVERY arrival landing, whichever cancel started it (a plain
    // aim/pair's own single-card cancel never touches this flag, so clearing
    // it here is a harmless no-op for that path — see `releaseReturning`'s own
    // declaration below for what it guards).
    setReleaseReturning(false)
  })

  const targets = useMemo(
    () =>
      staged?.main && staged.phase !== 'dispatched' && !cancelling
        ? (state.targets?.[staged.main.uid] ?? [])
        : [],
    [staged, cancelling, state.targets],
  )

  // The engine holds a `discardForRelease` while the release stands at the
  // centre, and names in `options` exactly which cards may pay (neither the
  // release itself nor a comboed Code Review can). Read, never re-derived —
  // legality is always the engine's answer.
  const cost =
    state.pending?.kind === 'discardForRelease' && state.pending.player === state.selfId
      ? state.pending
      : null
  const costOptions = useMemo(() => cost?.options ?? [], [cost])

  // Two pieces of local, purely-visual state a release's own cost cycle needs
  // that neither `staged`'s phase machine nor the projection can supply:
  //
  // `stageLanded` — true once the LOCAL flight that carries a pulled release
  // from the fan to the stage slot has actually finished (or at once, under
  // reduced motion). `_Board.tsx`'s static stage-slot render is gated on this:
  // without it, on a fast connection (the host peer's own round trip can be
  // near-instant) the projected `discardForRelease` pending can arrive WHILE
  // that flight is still in the air, and a static render keyed only off the
  // pending would stand the release at the slot a SECOND time, on top of the
  // carrier still flying it there.
  //
  // `paidCost` — the card that paid the cost, once ITS OWN flight (below,
  // `onCostPick`) has landed. The engine never says which uid was spent — only
  // the resolver knows, since it is the resolver's own click that named it —
  // so this is the one place that can hold it. It is not cleared once set: by
  // the rules the cost is shown open beside the release, not discarded on the
  // spot, and moving it on from there is a later task's job (see `onCostPick`).
  const [stageLanded, setStageLanded] = useState(false)
  const [paidCost, setPaidCost] = useState<{ uid: string; card: CardData } | null>(null)
  // `releaseReturning` — a THIRD, deliberately separate flag (Task 9, fix round
  // 1): true from the moment a cancel starts the release's animated return
  // flight until that flight lands. It is not folded into `stageLanded` above,
  // even though both gate the same static render — `stageLanded` answers "has
  // the INCOMING flight finished", this answers "is an OUTGOING one airborne
  // right now", and conflating the two would make `_Board.tsx`'s guard read as
  // one concern when it is actually two. Without it: `state.pending` is a
  // network round trip away from clearing (essentially always slower than a
  // single animation frame), so the projected `discardForRelease` pending —
  // and so `stagedRelease`'s other two inputs, `costPending`/`stagedReleaseLocal`
  // — stays exactly as it was for the whole return flight, and a static render
  // keyed only off THOSE would stand the release at the stage slot a SECOND
  // time, on top of the return flight carrying the very same card away. Never
  // set on the reduced-motion path (there is no flight to guard), which is
  // already correct without it: `cost` itself clears on the very next render.
  const [releaseReturning, setReleaseReturning] = useState(false)

  const handItems = useMemo(() => {
    const out = new Set(
      [staged?.support?.uid, staged?.main?.uid, cost?.release].filter((uid): uid is string =>
        Boolean(uid),
      ),
    )
    if (out.size === 0) return state.you.hand
    return state.you.hand.filter((c) => !out.has(c.uid))
  }, [state.you.hand, staged, cost])

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
    // The release awaiting its cost is the one dispatched play that CAN be
    // taken back: the engine holds it as a pending and has emitted nothing, so
    // nobody else has seen it. The engine is told first and the card flies
    // home on its own — a rejection cannot strand it, because the pending
    // either clears or it does not, and the projection is what puts the card
    // back in the fan either way. This sits AHEAD of the `dispatched` guard
    // below: `staging.staged` is already null by the time `cost` exists (the
    // catch-up effect above clears it the moment the pending echoes back), so
    // this branch cannot be folded into the `s`-based cancel that follows.
    if (cost) {
      arrowCtl.stop()
      actions?.onResolve?.({ kind: 'cancelRelease' })
      // The release is still in `you.hand` — the engine never took it out
      // (only `placeRelease` filters the hand, and that runs after the cost is
      // paid), so the card to fly home is found there by the uid the pending
      // names.
      const held = state.you.hand.find((c) => c.uid === cost.release)
      const from = anchors.stage.current?.getBoundingClientRect()
      if (!reduced && from && held) {
        // Fix round 1 (post-review): `state.pending` is a network round trip
        // away from clearing — essentially always slower than a single
        // animation frame — so `_Board.tsx`'s static stage-slot render (still
        // keyed off that same, not-yet-cleared pending) would otherwise stand
        // the release at the slot a second time, on top of this very flight
        // carrying it away. Set only on this animated branch: under reduced
        // motion there is no flight to guard, and `cost` itself clears on the
        // very next render regardless.
        setReleaseReturning(true)
        void arrival.arrive([{ key: held.uid, card: held.card, from }], handItems.length)
      }
      return
    }
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
  }, [
    reduced,
    handItems.length,
    arrival.arrive,
    anchors.centre,
    anchors.stage,
    arrowCtl.stop,
    cost,
    state.you.hand,
    actions,
  ])

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
  //
  // A release with no Code Review to pair has neither: no target to aim, no
  // partner to fold with. By the rules it still stands at the centre while
  // its cost is paid (#101, Task 8) — the solo half of the same allowance the
  // combo fold's own `finish()` already gives a release ("anything else…
  // plays straight through"), so it stages and dispatches AT ONCE, the same
  // way `onTargetPick`/`finish()` commit `phase: 'dispatched'` synchronously
  // alongside their own dispatch. Staging it (rather than leaving `staged`
  // untouched) is what gets it the rest of this hook's machinery for free:
  // `handItems` hides it from the fan the INSTANT this returns — not once a
  // network round-trip echoes the pending back — and a rejection (the
  // watcher below) sends it back to the fan exactly like any other refused
  // play. `_Board.tsx` still renders it from the projection's own
  // `discardForRelease.release`, never from `staged` — see the clearing
  // effect further down for why `staged` does not linger once that pending
  // lands.
  // biome-ignore lint/correctness/useExhaustiveDependencies: commitStaged closes only over refs/setStaged and is stable in effect
  const onHandPlay = useCallback(
    (uid: string, drop: HandPlayDrop): boolean => {
      if (!enabled || stagedRef.current) return false
      const index = state.you.hand.findIndex((c) => c.uid === uid)
      const item = state.you.hand[index]
      if (!item) return false
      const hasTarget = (state.targets?.[uid] ?? []).length > 0
      const partners = state.comboOptions?.[uid] ?? []
      // `hasTarget`/`partners` already gate the other two branches on
      // playability for free: `state.targets`/`state.comboOptions` only carry
      // an entry for a card the projection already counts as playable
      // (targetsFor/combosFor, packages/engine/src/fake/project.ts). A release
      // has neither to lean on, so its own playability — the slot open, the
      // cap not hit, a card left to pay with — is checked here explicitly;
      // skipping it would let an unaffordable release fly to the centre only
      // to have the engine reject it a beat later.
      const soloRelease =
        !hasTarget &&
        partners.length === 0 &&
        item.card.category === 'release' &&
        state.playable.includes(uid)
      if (!hasTarget && partners.length === 0 && !soloRelease) return false // pull only what plays alone, with a partner, or a release
      const card: StagedCard = { uid, card: item.card, index }
      commitStaged(
        hasTarget
          ? { support: null, main: card, phase: 'aim', merged: false }
          : soloRelease
            ? { support: null, main: card, phase: 'dispatched', merged: false }
            : { support: card, main: null, phase: 'partner', merged: false },
      )
      if (soloRelease) {
        dispatchWatermarkRef.current = eventsRef.current.length
        // fresh play, fresh cycle — a stale `paidCost` from an earlier release
        // this match must not bleed into this one, and `stageLanded` starts
        // false again: the flight below has not carried this card yet.
        setStageLanded(false)
        setPaidCost(null)
        actions?.onPlay?.(uid, undefined, undefined)
      }
      void (async () => {
        // a solo release flies to the STAGE slot, where it is meant to stand;
        // every other pull still flies to the plain attack/aim centre
        const to = (soloRelease ? anchors.stage : anchors.centre).current?.getBoundingClientRect()
        if (!reduced && drop.rect && to) {
          const [el] = await flyer.raise([{ key: 'stage', card: item.card, at: drop.rect }])
          if (el) await play('playToCenter', el, { from: drop.rect, to })?.finished
          flyer.drop('stage')
        }
        // the carrier has dropped it (or, under reduced motion, there was
        // never one) — `_Board.tsx`'s static render may take over now, not a
        // moment before (see `stageLanded`'s own comment above).
        if (soloRelease) setStageLanded(true)
        else aimFromCentre()
      })()
      return true
    },
    [
      enabled,
      state.you.hand,
      state.targets,
      state.comboOptions,
      state.playable,
      reduced,
      aimFromCentre,
      flyer.raise,
      flyer.drop,
      anchors.centre,
      anchors.stage,
      actions,
    ],
  )

  // The cost flies out of the fan and is held OPEN beside the release: by the
  // rules a release costs a card, and the cost is shown to the table rather
  // than vanishing into the discard on its way past. `_Board.tsx` owns the
  // static render of it (`paidCost`, set below the moment this flight lands) —
  // a later task flies it on to the discard once the release itself settles;
  // it will measure the slot, not adopt this flyer.
  const onCostPick = useCallback(
    (uid: string) => {
      if (!enabled || !costOptions.includes(uid)) return
      // measured against `handItems` — the array the fan actually RENDERS
      // (the staged release is already excluded from it) — not `you.hand`,
      // which still carries it and so is one slot short of what is on screen:
      // `slotPlacement`'s x/y/rotation are a function of (index, total), and
      // both would be wrong against the wrong array (I6 — a flight that
      // starts where the card never was jumps on its first frame).
      const index = handItems.findIndex((c) => c.uid === uid)
      const item = handItems[index]
      if (!item) return
      void (async () => {
        const to = anchors.cost.current?.getBoundingClientRect()
        const from = reduced ? undefined : slotBox(index, handItems.length)
        if (!reduced && from && to) {
          const [el] = await flyer.raise([{ key: 'cost', card: item.card, at: from }])
          if (el) await play('playToCenter', el, { from, to })?.finished
        }
        // the swap from carrier to static render happens in the SAME commit —
        // the approved source's own `payCost` idiom (`setCost` / `drop('fly')`
        // together) — so there is never a frame with neither on screen.
        setPaidCost({ uid, card: item.card })
        flyer.drop('cost')
        actions?.onResolve?.({ kind: 'discardForRelease', card: uid })
      })()
    },
    [
      enabled,
      costOptions,
      handItems,
      reduced,
      slotBox,
      anchors.cost,
      flyer.raise,
      flyer.drop,
      actions,
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
      // A cost owed routes here too (Board wires the same click through
      // whichever gesture is live, rather than a second handler): the click
      // names a fan card by INDEX, resolved against `handItems` — the same
      // rendered order `onCostPick`'s own caller expects a uid from.
      if (costOptions.length > 0) {
        const item = handItems[index]
        if (item) onCostPick(item.uid)
        return
      }
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
        // Defense in depth, same reason `onTargetPick`'s own `foldingRef`
        // check exists: a press on a lit seat mid-fold is meant to be refused
        // by that guard, but this re-reads `stagedRef.current` rather than
        // trusting it was — so a dispatch that landed here by ANY route is
        // never clobbered by this closure's own, now-stale idea of the outcome.
        //
        // UNPROVEN, on record rather than inferred (#117 review): every route
        // that can commit a dispatch today funnels through `onTargetPick`,
        // which `foldingRef` already refuses for the whole fold — so no test
        // can currently make this line's removal fail, and mutation-testing
        // confirmed it (all 21 staging tests stay green without it; the one
        // full-run casualty is an unrelated intro test, by accident). It
        // guards the route that does not exist yet — the one place every
        // future dispatcher funnels through before `staged` is touched again
        // — which is exactly why a green suite after deleting it proves
        // nothing. Do not remove it on that evidence.
        if (stagedRef.current?.phase === 'dispatched') return
        const windowOpen = Boolean(state.window?.canAttackWith?.includes(main.uid))
        if (windowOpen) {
          commitStaged({ support, main, phase: 'dispatched', merged: true })
          dispatchWatermarkRef.current = eventsRef.current.length
          actions?.onAttack?.(main.uid, support.uid)
        } else if ((state.targets?.[main.uid] ?? []).length > 0) {
          commitStaged({ support, main, phase: 'target', merged: true })
          aimFromCentre()
        } else {
          commitStaged({ support, main, phase: 'dispatched', merged: true })
          dispatchWatermarkRef.current = eventsRef.current.length
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
      costOptions,
      onCostPick,
    ],
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: commitStaged closes only over refs/setStaged and is stable in effect
  const onTargetPick = useCallback(
    (target: TableTarget) => {
      const s = stagedRef.current
      // `foldingRef`: the `targets` memo lights a seat the instant a partner is
      // picked (`main` set, `phase` still 'partner') — for the whole fold, not
      // only once it settles into 'target'. Without this, a press landing in
      // that window dispatches legitimately here and the fold's own `finish()`
      // — still running regardless, unaware anything beat it to the punch —
      // clobbers the commit this line just made with its own stale 'target'.
      if (!s?.main || s.phase === 'dispatched' || cancellingRef.current || foldingRef.current)
        return
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
      dispatchWatermarkRef.current = eventsRef.current.length
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

  // A solo release's own projection catch-up: `discardForRelease` pauses on a
  // decision rather than removing anything, so the hand never loses the card
  // and the effect just above never fires for it. Once the pending shows up
  // for us, `_Board.tsx`'s `stagedRelease` (sourced from that SAME pending)
  // renders it identically — holding the local stage any longer only risks
  // outliving that render for no reason, so it clears here instead.
  // biome-ignore lint/correctness/useExhaustiveDependencies: commitStaged closes only over refs/setStaged and is stable in effect
  useEffect(() => {
    const s = stagedRef.current
    if (s?.phase !== 'dispatched' || s.support || s.main?.card.category !== 'release') return
    if (state.pending?.kind === 'discardForRelease' && state.pending.player === state.selfId) {
      commitStaged(null)
    }
  }, [state.pending, state.selfId])

  // the engine said no: the staged play returns to the fan. ATTACK's own
  // rejection carries both halves (`card` the main, `combo` the support), so
  // either naming ours is enough. Scoped to what arrived AFTER this dispatch
  // (`dispatchWatermarkRef`) — `events` accumulates for the whole match, so an
  // unwatermarked scan would keep finding this SAME card's own past rejection
  // (from an earlier, already-resolved attempt) and wrongly cancel a fresh
  // re-dispatch of it the moment anything else in the feed changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: commitStaged closes only over refs/setStaged and is stable in effect
  useEffect(() => {
    const s = stagedRef.current
    if (s?.phase !== 'dispatched') return
    const fresh = events.slice(dispatchWatermarkRef.current)
    const rejectedOurs = fresh.some((e) => {
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

  // the combo beat's own clear (#100) — no flight, just done. Unguarded, unlike
  // `cancel()`: the beat only ever calls this once ITS OWN read of the handoff
  // says the staged node is the one standing at the centre, so there is
  // nothing here left to double-check.
  // biome-ignore lint/correctness/useExhaustiveDependencies: commitStaged closes only over refs/setStaged and is stable in effect
  const release = useCallback(() => commitStaged(null), [])

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
    release,
    costOptions,
    onCostPick,
    stageLanded,
    paidCost,
    releaseReturning,
  }
}
