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
  HandCardState,
  HandItem,
  HandPlayDrop,
  Point,
  TableActions,
  TableTarget,
} from '@release/ui'
import { CARD_RATIO, CARD_W, cardBoxIn, centerOf, slotPlacement, useArrow } from '@release/ui'
import {
  type Arriving,
  play,
  type Rect,
  restTransform,
  useFlyer,
  usePairFold,
  wait,
} from '@release/ui/animations'
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  ATTACK_POSE,
  type BoardAnchors,
  type BoardState,
  MERGE_MS,
  SHOW_HOLD,
} from '~/entities/game/board'
import { stageSlot } from '~/entities/game/board/stageSlot'
import { useToCentre } from '~/features/board-beats/toCentre'
import { useToHand } from '~/features/board-beats/toHand'
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

// The projection's target offer describes a solo play. Sudo Rebase applies
// to every draw pile, while Sudo Branch still splits the chosen one.
const rebaseAllPiles = (main: CardData, support: CardData | null) =>
  main.id === 'operation-git-rebase' && support?.id === 'support-sudo'

export interface StagedCard {
  uid: string
  card: CardData
  index: number // index in you.hand at pull time — where a cancel returns it
}

/** Where the actor's own release is, relative to the stage slot — see the
 *  `stage` state below for the whole reasoning. */
export type StageState = 'none' | 'flying' | 'standing' | 'leaving'

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
  // `color` is the hue the aim was armed with — the category of the card the
  // line leaves; undefined while nothing is aiming.
  arrow: { from: Point | null; to: Point | null; color?: string; active: boolean }
  overlay: ReactNode[] // flyer + return-flight overlays
  gapAt: number | null // fan gap while a cancel returns cards
  gapSize: number
  handItems: HandItem[] // you.hand minus the staged card(s)
  /** the uids that are NOT in the fan right now — standing at the centre, or
   * held there while a cost is owed. Whoever fills the fan subtracts this, so a
   * card lying at the centre is never drawn in the hand as well (#168). */
  handOut: ReadonlySet<string>
  accentAt: (index: number) => string | undefined // partner lighting while a support awaits one
  /** what a fan slot reads as — 'playable' for the cards that answer the step
   * the turn side is actually waiting on (today: a standing release's cost),
   * 'selected' for a waiting support's own partners, 'idle' at rest */
  stateAt: (index: number) => HandCardState
  /** the pair the fold step is carrying, while it carries one (`usePairFold`) */
  pairNode: () => HTMLDivElement | null
  /** the uids a carrier is holding right now — a place draws its card unless it
   * is the one travelling */
  carrying: string[]
  onHandPlay: (uid: string, drop: HandPlayDrop) => boolean
  /** a click in the fan: the partner pick (the fold), or a
   * release played at rest. Returns whether this gesture TOOK the click — false
   * leaves it to the plain click gesture (`_useBoardInteractions`), which owns
   * the window's attack affordance. */
  onCardClick: (index: number) => boolean
  onTargetPick: (target: TableTarget) => void
  cancel: () => void
  /** the hand uids that may pay a staged release's cost — [] when none is owed */
  costOptions: string[]
  /** the cost is PULLED out of the fan, the same gesture every other "give a
   *  card" step takes — see `onCostPlay` for why this is not a click */
  onCostPlay: (uid: string, drop: HandPlayDrop) => boolean
  /** true exactly while the actor's own release is STANDING at the stage slot
   * — the one thing `_Board.tsx`'s static stage-slot render needs to know.
   * Derived from `StageState` below, so the render asks one question instead
   * of three. */
  stageStanding: boolean
  /** the card that paid a staged release's cost, once its own flight has
   * landed — held open beside the release until `clearPaidCost` below moves
   * it on (the combo beat's own job, #101 Task 11) */
  paidCost: { uid: string; card: CardData; index: number } | null
  /** the combo beat's own clear of `paidCost` (#101, Task 11), called once
   * its own discard-exit flight takes the cost over — see comboBeat.tsx's
   * `runRelease`. Also fired here directly under reduced motion, where no
   * beat ever runs to call it (see the effect below). */
  clearPaidCost: () => void
  /** the placement beat's own hand-off (#101, Fix A): the beat calls this in
   * the same synchronous burst as its carrier's own `raise`, so the static
   * render and the carrier swap in ONE commit — see `comboBeat.tsx`'s
   * `runRelease`. Threaded through a ref the same way `clearPaidCost` is, and
   * for the same reason. It moves the stage machine to `'leaving'`. */
  takeStagedRelease: () => void
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
  /**
   * The match this staging belongs to (#101, Fix C, finding 3). The board is
   * NOT remounted for a rematch — `_layout.tsx` gives `<Board>` no `key`, so
   * one component instance serves every match of a session — and everything
   * this hook holds is per-match: a pair standing at the centre, a release at
   * the stage slot, the card that paid its cost. `useBeats` already resets
   * itself on this same boundary (`intro.key`); nothing reset the gestures, so
   * a rematch that interrupted a cost step left the paid card lying on the new
   * table for good, and the new match's first beat called `clearPaidCost` /
   * `takeStagedRelease` against state belonging to a match that had ended.
   *
   * WHAT REACHES THIS ON THIS BRANCH, AS OF 2026-08-20, DOES NOT CHANGE PER
   * MATCH (#101, Fix D, finding 3) — a property of the branch, not a law: work
   * on in-place rematch (#19) gives each match an id of its own, at which point
   * this boundary becomes live on its own and the note below stops applying.
   * Re-read `startGame` before leaning on either reading.
   * `_Board.tsx` passes `intro.gameId`, which `_layout.tsx` takes
   * from `session.gameId`, which `useLobby.ts`'s `startGame` sets to
   * `current.hostId` — the host's own peer id, identical for every match played
   * in one room ("the board route is keyed by the host peer id"). So a second
   * `startGame` produces the same key and this effect never fires. The reset
   * below is right; the boundary it hangs on is inert, and `useBeats` hangs on
   * the same value with the same hole. Latent rather than live — no in-place
   * rematch exists, the only entry point remounts the board — and recorded in
   * `docs/animations/backlog.md` with what would close it: a per-match id
   * (a counter or the deal seed) minted by `startGame`, carried on
   * `GAME_STARTING` so every peer agrees on it, and handed to both hooks and
   * to `useBeats`.
   */
  matchKey?: string | null
  /**
   * The fan's private order. A card coming home lands in the MIDDLE of the fan
   * like every other arrival, so its slot has to be committed or the next
   * projection puts it back where it used to sit.
   */
  onHandArrival?: (order: string[], uid: string, at: number) => void
}

export function useBoardStaging({
  state,
  anchors,
  actions,
  events,
  enabled,
  matchKey = null,
  onHandArrival,
}: Options): BoardStaging {
  const [staged, setStaged] = useState<StagedPlay | null>(null)
  // True from the moment a cancel is ACCEPTED until its return flight lands —
  // not the same span as `!staged`. `staged` only clears in `onLanded`, ~480ms
  // into the flight (useHandArrival's FLIGHT_MS), so without this a press on
  // the seat the card was aimed at stays live for that whole glide and
  // dispatches a play for a card that is already on its way back to the fan.
  const [cancelling, setCancelling] = useState(false)
  // WHOSE CARD IS IN THE AIR, by uid. A place of the centre's row draws the card
  // standing in it unless a carrier is holding that very card — the row has two
  // places and only one of them travels at a time, so "something is flying" is
  // not an answer: it blanked the sudo while the card it enhances was still on
  // its way in.
  const [carrying, setCarrying] = useState<string[]>([])
  const reduced = useReducedMotion()
  const arrowCtl = useArrow()
  const flyer = useFlyer()
  // the pair's own persistent DOM node — CardPair mounts inside it (_Board.tsx)
  // and the fold paints frame-by-frame on its `[data-main]`/`[data-aux]`
  // children, same as ComboStory's own `flyRef`.
  // THE step, not a copy of it (`usePairFold`): two cards become a pair on the
  // table. It owns the node, mounts it invisible and reveals it in the SAME
  // tick its halves get their entry poses — which is the frame the fan lets the
  // card go in, so the handover is a swap and never a blink. The board carried
  // its own six lines here until #168; the defence gesture already called the
  // step, and this is the second of the three copies the module was packed out
  // of. Held in a ref as well, for the long-lived callbacks below (I8).
  const pair = usePairFold()
  const pairApi = useRef(pair)
  pairApi.current = pair

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
  // THE COST'S OWN CARRIER. Its own rather than the staging flyer's, because the
  // module owns the carrier it flies on — a carrier passed between owners is how
  // two gestures end up sharing one overlay by accident.
  const costCarrier = useToCentre()
  const dispatchWatermarkRef = useRef(0)
  // The same watermark for the COST, kept apart because the two dispatches are
  // independent: a release can be staged, refused and re-staged while a cost of
  // its own is in flight, and one shared mark would let either read the other's
  // rejection.
  const costWatermarkRef = useRef(0)
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
  const plainAttempt = useRef(0)

  const commitStaged = (next: StagedPlay | null) => {
    stagedRef.current = next
    setStaged(next)
  }

  // The card comes home through the shared movement (`toHand`): the middle of
  // the fan, the committed slot, and this gesture's own ending when it is in.
  const endCancel = () => {
    // The return flight landed: the cancel is over. Synchronous, same reason
    // as `onTargetPick`'s own ref write below — a press landing in THIS tick
    // must see the cancel as already resolved, not wait for the render this
    // `setCancelling(false)` schedules.
    cancellingRef.current = false
    setCancelling(false)
    commitStaged(null)
    // NOTHING IS IN THE AIR ANY MORE, so no place is holding its card back. The
    // refusal path cleared this and the landing path did not, because it left
    // the clearing to whatever staged next — and every animated staging does
    // overwrite it, which is why this never showed. A staging that runs without
    // a flight does not (reduced motion), and there the place of the row stayed
    // empty with the card standing in it. A landing clears what it started.
    setCarrying([])
    // The outgoing flight this callback belongs to has landed, so a release
    // that was `leaving` is now simply gone. Conditional, unlike the clears
    // above: this fires for EVERY arrival landing, and a plain aim's own
    // cancel must not knock a legitimately `standing` release out of its slot
    // (nothing can produce that overlap today — a release standing means no
    // other play is staged — but a machine that cannot be corrupted by an
    // unrelated caller is worth more than a comment saying it isn't).
    setStage((s) => (s === 'leaving' ? 'none' : s))
  }
  const arrival = useToHand(anchors.hand, onHandArrival)

  const targets = useMemo(
    () =>
      staged?.main &&
      staged.phase !== 'dispatched' &&
      !cancelling &&
      !rebaseAllPiles(staged.main.card, staged.support?.card ?? null)
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

  // WHERE THE ACTOR'S OWN STANDING RELEASE IS — one value, not three booleans
  // (#101, Fix C, finding 5).
  //
  // This used to be `stageLanded` + `releaseReturning` + `releasePlacing`, each
  // added by a different round for a different flight, and `_Board.tsx` asked
  // all three at once (`stageLanded && !releaseReturning && !releasePlacing`).
  // Three independent booleans describing one card's whereabouts can disagree,
  // and they did: they were reset only inside `onHandPlay`'s `soloRelease` arm,
  // so a release played a DIFFERENT way afterwards — a Code Review combo, which
  // stands its release at the centre rather than here — inherited whatever the
  // previous one left behind. Play a solo release, have it rejected, then play
  // a combo one, and the combo's release rendered at the stage slot as well as
  // in the pair: the same card on screen twice, decided by what you happened to
  // play first.
  //
  // As one machine the question does not arise. Every play sets it (see
  // `onHandPlay` and `onCardClick`'s `finish` below), so nothing can carry
  // over, and `_Board.tsx` asks one thing: is it standing?
  //
  //   none      nothing of ours is at the stage slot — including a COMBO
  //             release, which stands at the centre as half of its pair
  //   flying    a carrier is bringing it there (the pull's own flight)
  //   standing  it is there; the static render is the board's to draw
  //   leaving   a carrier is taking it away — home on a cancel, or into the
  //             zone once the placement beat takes it over
  //
  // `standing` is the only state that renders. `flying` and `leaving` are both
  // "a carrier holds this card", which is why neither may: the projected
  // `discardForRelease` pending is a network round trip behind, so a render
  // keyed on the pending alone would stand a second copy of the card under a
  // carrier already carrying it — the doubling bug this family was grown to
  // prevent, once per direction.
  const [stage, setStage] = useState<StageState>('none')
  // `paidCost` — the card that paid the cost, once ITS OWN flight (below,
  // `onCostPick`) has landed. The engine never says which uid was spent — only
  // the resolver knows, since its own pull named it —
  // so this is the one place that can hold it. By the rules the cost is shown
  // open beside the release rather than discarded on the spot; the combo beat
  // moves it on (`clearPaidCost`).
  // `index` is the slot it LEFT. Every return flight on this board names one —
  // a cancelled defence, a cancelled sudo, a cancelled pair — because a card
  // coming back from a play that did not happen belongs where it was, not in the
  // middle of the fan where an ARRIVAL lands. Captured at the pull, since the
  // fan has been laid out without the card ever since.
  const [paidCost, setPaidCost] = useState<{ uid: string; card: CardData; index: number } | null>(
    null,
  )
  // THE CARD THAT PAID, FOR THE WHOLE TIME IT IS NOT IN THE HAND — from the
  // frame the pull takes it until the projection itself stops listing it.
  //
  // One piece of state for the whole journey, because the journey has three
  // legs and the card is off the fan for all of them: travelling to the cost
  // place, lying open there, and flying to the discard. Splitting it by leg is
  // what let the card come back: `paidCost` clears the moment the beat takes the
  // card over, and the board that beat runs against is the SHADOW — the table
  // from before the engine resolved — where the card is still in the hand. So
  // the fan drew it again for the length of the discard flight, and only the
  // heap finally took it away (owner, 22.09).
  //
  // A FACT, never a memory: cleared by the projection no longer holding the
  // card, or by the card flying home when the engine refuses it.
  const [costGone, setCostGone] = useState<string | null>(null)
  // While the carrier travels, the cost slot must not draw a static copy.
  const [paying, setPaying] = useState<string | null>(null)
  // Lock synchronously: two pulls in one render must dispatch only one cost.
  // Identity also invalidates an async flight overtaken by a new hand or match.
  const costPayment = useRef<{ uid: string } | null>(null)
  const resetCostPayment = useCallback(() => {
    costPayment.current = null
    setPaying(null)
    setCostGone(null)
    setPaidCost(null)
    costCarrier.drop('cost')
  }, [costCarrier.drop])
  useLayoutEffect(() => {
    if (!costGone || state.you.hand.some((card) => card.uid === costGone)) return
    if (paying) resetCostPayment()
    else {
      costPayment.current = null
      setCostGone(null)
    }
  }, [costGone, paying, state.you.hand, resetCostPayment])

  // WHAT IS NOT IN THE FAN RIGHT NOW — the staged halves, and the release held
  // at the centre while its cost is owed. Exported rather than kept private,
  // because the fan's items do NOT always come from this hook: whichever hook
  // owns the hand builds its own list straight off the projection, and while a
  // beat runs that projection is the SHADOW — the board from BEFORE the play,
  // where these cards are still in the hand. An owner that does not subtract
  // this draws a card that is standing at the centre back into the fan, and the
  // fan then raises its zoom preview for it (#168).
  //
  // A SET THAT EMPTIES, never a memory of what has left: a refusal, an invalid
  // partner and Escape all send these cards home again, and that return is the
  // gesture working rather than a card escaping. So this says where the cards
  // are now, and says nothing at all the moment they are back in the hand.
  const handOut = useMemo(
    () =>
      new Set(
        [staged?.support?.uid, staged?.main?.uid, cost?.release, paying, costGone].filter(
          (uid): uid is string => Boolean(uid),
        ),
      ),
    // `paidCost` belongs here as much as the rest: the card lies OPEN BESIDE THE
    // RELEASE from the moment its flight lands until the beat takes it to the
    // discard, and for that whole stretch the projection still has it in the
    // hand — the engine has not resolved yet, and once it has, the shadow the
    // beat runs against is the board from before it did. Left in, the fan draws
    // a second copy of a card that is lying on the table, and it stays there
    // until the discard finally swallows it (owner, 22.09).
    [staged, cost, paying, costGone],
  )

  const handItems = useMemo(
    () => (handOut.size === 0 ? state.you.hand : state.you.hand.filter((c) => !handOut.has(c.uid))),
    [state.you.hand, handOut],
  )

  // THE ARROW LEAVES THE CARD THAT IS ASKING, not the middle of the table. The
  // two were the same thing for as long as a played card stood in the middle,
  // and stopped being the same when the centre grew a ROW: a support waiting
  // for its partner stands in the row's first place and the card it enhances in
  // the second, so the middle BETWEEN them is empty table — and an arrow drawn
  // from `anchors.centre` came out of that gap instead of out of the card.
  //
  // WHERE A CARD STANDS IS THE CENTRE MODULE'S ANSWER, asked the way every
  // flight into the row asks it (`stageSlot`). `place` is null for a card that
  // owns the middle — one that is aiming, or a folded pair — so that case
  // resolves to the very element this always used, with no branch of its own.
  // `Table`'s own arrow anchors to its source card the same way, and re-derives
  // it on every phase change rather than aiming once (apps/ui/src/table/Table).
  // An attack rests tilted; everything else rests square. Handed to a flight so
  // it arrives already in that pose instead of turning once it is down.
  const attackPose = (card: CardData) =>
    card.category === 'attack'
      ? { rotate: ATTACK_POSE.rot, dx: ATTACK_POSE.dx, dy: ATTACK_POSE.dy }
      : {}

  // THE CARD IS THE ARGUMENT, not just its place: the same card decides where
  // the line starts and what colour it is drawn in, so both are said in one
  // call. Splitting them is how the hue went stale — the board re-derived it
  // from `staged` with a rule of its own ("the support, if there is one"),
  // which outlived the moment a sudo hands the aim over to the card it
  // enhances: the arrow left the attack and stayed the sudo's yellow (#168).
  const aimFromPlay = useCallback(
    (card: StagedCard, place: number | null) => {
      const el = (place == null ? null : stageSlot(anchors, place)) ?? anchors.centre.current
      if (el) arrowCtl.aim(centerOf(el), undefined, `var(--cat-${card.card.category})`)
    },
    [anchors, arrowCtl.aim],
  )

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

  // SENDING CARDS HOME — every return flight in `cancel()` below goes through
  // here, for one reason: `arrival.arrive` can refuse (#101, Fix D, finding 2).
  // It takes one flight at a time and it needs a fan to measure, and either way
  // it simply does not start — while the cancel that called it has already
  // blanked the pair node and armed `cancelling`, both of which are cleared by
  // that flight's own landing and nowhere else. So a refusal left both halves
  // invisible with `staged` still merged, and the moment the pending cleared the
  // fan's merged-pair guard went back up over a pair nobody could see: dead for
  // the rest of the match. The sibling reduced-motion branch had a hand-back for
  // exactly this; the flying one did not.
  //
  // `arrive` now answers whether it TOOK the flight. Taken: its landing clears
  // everything, as before. Refused with another arrival already in the air:
  // that one lands and clears it for us, so this must NOT step in — putting the
  // cards back under a flight still carrying them is the doubling this whole
  // family of guards exists to prevent. Refused with nothing flying at all:
  // nothing will ever land, so the gesture is put back by hand — the same four
  // clears `onLanded` performs, no more.
  // Read through a ref, not closed over: `flyHome` is a dependency of the cancel
  // effects, so a new identity per render would re-run them — and re-running a
  // cancel wipes a staging that has just been made.
  const ending = useRef(endCancel)
  ending.current = endCancel
  const flyHome = useCallback(
    (items: Arriving[]) => {
      const end = ending.current
      // every card of this flight is in the air, so no place draws it
      setCarrying(items.map((it) => it.key))
      void arrival.home(items, end).then((flew) => {
        // nothing will ever land, so the gesture is put back by hand — the same
        // clears the landing performs, no more. A card waiting its turn behind
        // another flight is NOT this case: it lands, and ends the gesture then.
        if (!flew) end()
      })
    },
    [arrival.home],
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
      if (costPayment.current) return
      arrowCtl.stop()
      actions?.onResolve?.({ kind: 'cancelRelease' })
      // A COMBO release is still staged at this point and a solo one is not,
      // and that asymmetry is deliberate on both sides (#101, Fix C): the
      // catch-up effect below clears `staged` for a solo release because
      // `_Board.tsx` can rebuild its render from the projection's own pending,
      // and leaves it for a combo because it cannot — `pendingView` carries
      // `release` but not `codeReview`, so `staged` is the ONLY thing that
      // knows the pair. Which means the pair is standing at the CENTRE, on the
      // pair flyer, and both halves have to go home from there. The earlier
      // version of this branch was written for the solo case alone: it flew
      // one card home from the stage slot — empty, for a combo — left the Code
      // Review behind, and never cleared `staged`, so the fan stayed inert.
      const merged = stagedRef.current
      if (merged?.merged && merged.support && merged.main) {
        const cRect = anchors.centre.current?.getBoundingClientRect()
        const el = pairApi.current.node()
        if (reduced || !cRect) {
          // no flight, so nothing will land to clear this later — the machine
          // has to be put back by hand, or the fan never becomes live again
          pairApi.current.release()
          commitStaged(null)
          return
        }
        cancellingRef.current = true
        setCancelling(true)
        flyHome([
          {
            key: merged.support.uid,
            card: merged.support.card,
            el,
            anchor: 'aux' as const,
            from: cRect,
          },
          {
            key: merged.main.uid,
            card: merged.main.card,
            el,
            anchor: 'main' as const,
            from: cRect,
          },
        ])
        // measured while it was still up (`arrive` reads every source rect
        // before it awaits anything), taken down now — the step's own node goes
        // with `release()`, the same order the plain merged cancel below uses.
        // `staged` itself is cleared by the arrival's own landing, which is
        // what keeps both halves out of the fan for the whole flight.
        pairApi.current.release()
        return
      }
      // A SOLO release: `staged` is already null, and the card is standing at
      // the stage slot. It is still in `you.hand` — the engine never took it
      // out (only `placeRelease` filters the hand, and that runs after the
      // cost is paid) — so it is found there by the uid the pending names.
      const held = state.you.hand.find((c) => c.uid === cost.release)
      const from = anchors.stage.current?.getBoundingClientRect()
      if (!reduced && from && held) {
        // `state.pending` is a network round trip away from clearing —
        // essentially always slower than a single animation frame — so
        // `_Board.tsx`'s static stage-slot render (still keyed off that same,
        // not-yet-cleared pending) would otherwise stand the release at the
        // slot a second time, on top of this very flight carrying it away.
        setStage('leaving')
        // …to the slot it left, like every other return. `heldAt` is -1 while the
        // fan is drawn without it (the ordinary case for a standing release), and
        // the insert reads a missing index as "the middle" — which is what an
        // ARRIVAL gets and a return should not, so it is passed only when the fan
        // still knows the place.
        flyHome([{ key: held.uid, card: held.card, from }])
        return
      }
      // Reduced motion, or nothing measurable: there is no flight to guard
      // against and none to land, so the machine goes back at once.
      setStage('none')
      return
    }
    const s = stagedRef.current
    if (!s || s.phase === 'dispatched' || cancellingRef.current || foldingRef.current) return
    plainAttempt.current += 1
    flyer.drop('stage')
    arrowCtl.stop()
    const cRect = anchors.centre.current?.getBoundingClientRect()
    if (reduced || !cRect) {
      pairApi.current.release()
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
      const el = pairApi.current.node()
      flyHome([
        { key: s.support.uid, card: s.support.card, el, anchor: 'aux' as const, from: cRect },
        { key: s.main.uid, card: s.main.card, el, anchor: 'main' as const, from: cRect },
      ])
      // `arrive`'s own geometry pass (above) measured the pair while it was
      // still up — take it down now so the flight overlay's own copies are
      // the only thing on screen (ComboStory's `hideFlyer`, called right
      // after starting the same flight).
      pairApi.current.release()
      return
    }
    // Two cards that never folded — a sudo and the card it enhances, each in its
    // own place of the row. They go home from where they actually stand: the
    // middle holds neither of them.
    if (s.support && s.main) {
      const first = stageSlot(anchors, 0)?.getBoundingClientRect() ?? cRect
      const second = stageSlot(anchors, 1)?.getBoundingClientRect() ?? cRect
      flyHome([
        { key: s.support.uid, card: s.support.card, from: first },
        { key: s.main.uid, card: s.main.card, from: second },
      ])
      return
    }
    const only = s.support ?? s.main
    if (!only) return
    // A waiting support stands in the row's first place; a card that AIMS stands
    // in the middle. Either way it leaves from where it is.
    const home = s.support ? (stageSlot(anchors, 0)?.getBoundingClientRect() ?? cRect) : cRect
    flyHome([{ key: only.uid, card: only.card, from: home }])
  }, [
    reduced,
    flyHome,
    anchors.centre,
    anchors.stage,
    arrowCtl.stop,
    cost,
    state.you.hand,
    actions,
    flyer.drop,
  ])

  // A card waiting for a target belongs to the current turn only. When the
  // timer ends that turn, no table click or Escape arrives to call `cancel`,
  // so the card otherwise stays over the next player's decisions (including
  // a System Upgrade discard owed by this seat). A dispatched play belongs to
  // the beat instead and must keep its existing hand-off path.
  useEffect(() => {
    const waiting = stagedRef.current
    if (waiting && waiting.phase !== 'dispatched' && state.turn !== state.selfId) cancel()
  }, [state.turn, state.selfId, cancel])

  // While a support waits for a partner, the cards it can fold with keep
  // their own category accent — the support's own, per ComboStory (the TYPE
  // is the message). Goes out the moment a partner is picked: the clicked
  // card is no longer in `handItems`, so there is nothing left to light
  // regardless of any candidates still technically eligible.
  //
  // A standing release's own price is the one step whose hue is NOT the card's
  // type (#101, Fix B): every card that may pay lights in the loss hue
  // (`--danger-accent`, whose token comment is literally "a pick that COSTS
  // you a card"). The approved scene calls this "the exception in colour, not
  // in rule" — what is lit is still exactly what answers the open step, and
  // that set is the engine's (`pending.options`), never the whole fan.
  const accentAt = useCallback(
    (index: number) => {
      const item = handItems[index]
      if (!item) return undefined
      if (costOptions.length > 0) {
        return costOptions.includes(item.uid) ? 'var(--danger-accent)' : undefined
      }
      const support = staged?.phase === 'partner' ? staged.support : null
      if (!support) return undefined
      const partners = state.comboOptions?.[support.uid] ?? []
      return partners.includes(item.uid) ? `var(--cat-${support.card.category})` : undefined
    },
    [staged, handItems, costOptions, state.comboOptions],
  )

  // What each fan slot READS as — the half `accentAt` alone cannot say, since
  // `Hand`'s own fallback turns any accent into 'selected' and nothing else
  // into 'idle' (Hand.tsx: `stateAt?.(i) ?? (accentAt?.(i) ? 'selected' : 'idle')`).
  // The rule, from the approved scene: the fan lights only while a step is
  // actually waiting on a choice FROM it, and only on the cards that answer
  // that step — a glow with nothing asked reads as "already selected", not as
  // "available". Nothing is lit at rest, and the fallback for a waiting
  // support is reproduced verbatim so #100's own combo reading is untouched.
  const stateAt = useCallback(
    (index: number): HandCardState => {
      const item = handItems[index]
      if (!item) return 'idle'
      // The same gate `onCostPick` opens with: while the opening owns the
      // table the click is refused, so the card must not look clickable.
      // Reachable on a rejoin that replays the opening into a pending already
      // owed to us (fix round 1, L2).
      if (!enabled) return 'idle'
      // …and the moment a card has been GIVEN, nothing in the fan is payable any
      // more. The pending is what lights them up and it lives until the engine
      // resolves — which is long after the player has chosen: the card is in the
      // air, then lying open at the centre, then on its way to the discard, and
      // the whole fan stayed lit through all of it (owner, 22.09).
      if (costOptions.length > 0 && !costGone)
        return costOptions.includes(item.uid) ? 'playable' : 'idle'
      if (costOptions.length > 0) return 'idle'
      return accentAt(index) ? 'selected' : 'idle'
    },
    [enabled, handItems, costOptions, costGone, accentAt],
  )

  // STAGING A RELEASE — the one play that stands at the STAGE slot rather than
  // the centre, and the one that BOTH roads out of the fan lead to: pulled
  // (`onHandPlay`, just below) or clicked at rest (`onCardClick`, further down).
  //
  // It lives in one place because the two roads used to diverge, and the
  // divergence was invisible (#101, Fix D, finding 1). A release is `playable`
  // with nothing to aim at and no partner to fold with — `targetsFor` gives it
  // no targets and `combosFor` keys only on a SUPPORT's uid, so `comboOptions`
  // never carries a release — and `Hand` turns a press released under the drag
  // threshold into a plain click. So a release reached the table by clicking as
  // well as by pulling, and the click road went straight to
  // `_useBoardInteractions`, which dispatches the play and touches nothing here:
  // the stage machine stayed at `none`, `stageStanding` was false, `handItems`
  // hid the card because the pending named it, and the release rendered NOWHERE
  // for its whole cost step while the ask line under the centre asked the player
  // to pay for it.
  //
  // `from` is the only thing the two roads differ on — the drag flyer's own rect
  // for a pull, the card's own fan slot for a click, which has no drop rect at
  // all. Both are card boxes rather than rotated slot rects (I6), and neither is
  // measured under reduced motion, where there is no flight to start.
  // biome-ignore lint/correctness/useExhaustiveDependencies: commitStaged closes only over refs/setStaged and is stable in effect
  const stageSoloRelease = useCallback(
    (card: StagedCard, from: Rect | undefined) => {
      commitStaged({ support: null, main: card, phase: 'dispatched', merged: false })
      // A release is on its way to the stage slot and says so; every other pull
      // leaves that slot empty and says THAT (see `onHandPlay` below). Setting it
      // on every play is what stops one inheriting the last one's whereabouts
      // (#101, Fix C, finding 5).
      setStage('flying')
      dispatchWatermarkRef.current = eventsRef.current.length
      // fresh play, fresh cycle — a stale `paidCost` from an earlier release
      // this match must not bleed into this one
      setPaidCost(null)
      actions?.onPlay?.(card.uid, undefined, undefined)
      void (async () => {
        const to = anchors.stage.current?.getBoundingClientRect()
        if (!reduced && from && to) {
          const [el] = await flyer.raise([{ key: 'stage', card: card.card, at: from }])
          if (el) await play('playToCenter', el, { from, to })?.finished
          flyer.drop('stage')
        }
        // the carrier has dropped it (or, under reduced motion, there was
        // never one) — `_Board.tsx`'s static render may take over now, not a
        // moment before. Guarded on `flying` rather than written outright: a
        // cancel or a rejection can land inside this flight's own span, and
        // the release must not come back to `standing` after it has left.
        setStage((s) => (s === 'flying' ? 'standing' : s))
      })()
    },
    [reduced, anchors.stage, flyer.raise, flyer.drop, actions],
  )

  // Clicks and pulls share the same centre staging; only their starting rect differs.
  // biome-ignore lint/correctness/useExhaustiveDependencies: commitStaged only writes refs/state
  const stageAtCentre = useCallback(
    (card: StagedCard, hasTarget: boolean, from?: Rect) => {
      commitStaged(
        hasTarget
          ? { support: null, main: card, phase: 'aim', merged: false }
          : { support: card, main: null, phase: 'partner', merged: false },
      )
      setStage('none')
      void (async () => {
        if (!reduced && from) {
          setCarrying([card.uid])
          try {
            const [el] = await flyer.raise([{ key: 'stage', card: card.card, at: from }])
            // MEASURED AFTER THE RAISE, not before it. A support waiting for its
            // partner flies to the first place of the centre's assembling ROW,
            // and that place is mounted by the commit above — it does not exist
            // yet when this body starts. A card that AIMS has been played, and
            // keeps the middle it always had.
            const place = hasTarget ? null : 0
            const to = (
              (place == null ? null : stageSlot(anchors, place)) ?? anchors.centre.current
            )?.getBoundingClientRect()
            if (el && to)
              await play('playToCenter', el, { from, to, ...attackPose(card.card) })?.finished
          } catch {
            // A `void`ed body is watched by nobody: let it reject and the whole
            // app gets an unhandled rejection. The card is staged either way —
            // the flight is how it got there, not whether it did.
          }
          flyer.drop('stage')
          setCarrying([])
        }
        // out of the place it has just landed in — the same one the flight
        // above aimed at, so the arrow starts where the card ended
        aimFromPlay(card, hasTarget ? null : 0)
      })()
    },
    [anchors, reduced, flyer.raise, flyer.drop, aimFromPlay],
  )

  // A standalone play is read at the centre before its effect is sent.
  // Targeted cards and combo partners keep their existing decision step.
  // biome-ignore lint/correctness/useExhaustiveDependencies: commitStaged only updates refs and state
  const stagePlain = useCallback(
    (card: StagedCard, from: Rect | undefined, attack: boolean) => {
      const attempt = ++plainAttempt.current
      commitStaged({ support: null, main: card, phase: 'aim', merged: false })
      setStage('none')
      const current = () =>
        attempt === plainAttempt.current &&
        !cancellingRef.current &&
        stagedRef.current?.main?.uid === card.uid &&
        stagedRef.current.phase === 'aim'
      const dispatch = () => {
        if (!current()) return
        commitStaged({ support: null, main: card, phase: 'dispatched', merged: false })
        dispatchWatermarkRef.current = eventsRef.current.length
        if (attack) actions?.onAttack?.(card.uid, undefined)
        else actions?.onPlay?.(card.uid, undefined, undefined)
      }
      if (reduced) {
        dispatch()
        return
      }
      void (async () => {
        const to = anchors.centre.current?.getBoundingClientRect()
        if (to && from) {
          const [el] = await flyer.raise([{ key: 'stage', card: card.card, at: from }])
          if (!current()) return
          // INTO THE POSE IT WILL REST IN, not into a flat landing it then
          // corrects. An attack lies tilted at the centre (I11: the tilt is
          // what says it has been PLAYED), so the flight ends already turned —
          // the same `rotate`/`dx`/`dy` the combo and defence flights pass, for
          // the same reason.
          if (el) await play('playToCenter', el, { from, to, ...attackPose(card.card) })?.finished
          if (!current()) return
          flyer.drop('stage')
        }
        await wait(SHOW_HOLD)
        dispatch()
      })()
    },
    [actions, anchors.centre, reduced, flyer.raise, flyer.drop],
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
      const attack = Boolean(state.window?.canAttackWith?.includes(uid))
      const plain =
        !hasTarget &&
        partners.length === 0 &&
        !soloRelease &&
        ((state.playable.includes(uid) &&
          (item.card.category === 'operation' || item.card.category === 'protection')) ||
          attack)
      if (!hasTarget && partners.length === 0 && !soloRelease && !plain) return false
      const card: StagedCard = { uid, card: item.card, index }
      // A release goes through the shared road above — the same one the click
      // takes — so the two can never again disagree about where the card is.
      // Placed after the guards on purpose: a refused pull touches no state.
      if (plain) {
        stagePlain(card, drop.rect, attack)
        return true
      }
      if (soloRelease) {
        stageSoloRelease(card, drop.rect)
        return true
      }
      stageAtCentre(card, hasTarget, drop.rect)
      return true
    },
    [
      enabled,
      state.you.hand,
      state.targets,
      state.comboOptions,
      state.playable,
      stageSoloRelease,
      stageAtCentre,
      stagePlain,
      state.window,
    ],
  )

  // The cost flies out of the fan and is held OPEN beside the release: by the
  // rules a release costs a card, and the cost is shown to the table rather
  // than vanishing into the discard on its way past. `_Board.tsx` owns the
  // static render of it (`paidCost`, set below the moment this flight lands) —
  // the combo beat flies it on to the discard once the release itself settles
  // (#101, Task 11: comboBeat.tsx's `runRelease`), measuring the slot rather
  // than adopting this flyer (this hook's own flyer is gone by then anyway —
  // `drop('cost')` two lines below).
  const onCostPick = useCallback(
    (uid: string, at?: DOMRect) => {
      if (!enabled || costPayment.current || !costOptions.includes(uid)) return
      // measured against `handItems` — the array the fan actually RENDERS
      // (the staged release is already excluded from it) — not `you.hand`,
      // which still carries it and so is one slot short of what is on screen:
      // `slotPlacement`'s x/y/rotation are a function of (index, total), and
      // both would be wrong against the wrong array (I6 — a flight that
      // starts where the card never was jumps on its first frame).
      const index = handItems.findIndex((c) => c.uid === uid)
      const item = handItems[index]
      if (!item) return
      const attempt = { uid }
      costPayment.current = attempt
      setPaying(uid)
      setCostGone(uid)
      void (async () => {
        const to = anchors.cost.current?.getBoundingClientRect()
        // WHERE IT PHYSICALLY IS — the rect the pull let go at when there is one,
        // and the card's own fan slot otherwise. A flight that starts where the
        // card never was jumps on its first frame (I1/I6).
        const from = reduced ? undefined : (at ?? slotBox(index, handItems.length))
        if (!reduced && from && to) {
          // THE SHARED JOURNEY — a card travels to a named place at the centre
          // and stays there, pinned, so whatever moves it on starts from where
          // it stands. Written out here once, which is one time too many: the
          // module is what `drawBeat`, `aiBeat` and the DDoS effect all take.
          await costCarrier.toSlot({
            key: 'cost',
            card: item.card,
            from,
            to,
            faceDown: false,
            motion: 'playToCenter',
          })
        }
        // the swap from carrier to static render happens in the SAME commit —
        // the approved source's own `payCost` idiom (`setCost` / `drop('fly')`
        // together) — so there is never a frame with neither on screen.
        if (costPayment.current !== attempt) return
        setPaidCost({ uid, card: item.card, index })
        setPaying(null)
        costCarrier.drop('cost')
        costWatermarkRef.current = eventsRef.current.length
        actions?.onResolve?.({ kind: 'discardForRelease', card: uid })
      })().catch(() => {
        if (costPayment.current === attempt) resetCostPayment()
      })
    },
    [
      enabled,
      costOptions,
      handItems,
      reduced,
      slotBox,
      anchors.cost,
      costCarrier.toSlot,
      costCarrier.drop,
      actions,
      resetCostPayment,
    ],
  )

  // THE COST IS PULLED OUT OF THE HAND, never clicked. Every other step that
  // asks for a card from the fan takes it the same way — a defence answering an
  // attack, a Debugger answering a 503, the hand limit, System Upgrade — and the
  // discipline is written beside the 503's own line: one gesture per step. This
  // was the one place that still took a click, which made paying for a release
  // read as a different kind of act from every other card you give up.
  //
  // `drop` is where the player let go. Dropping it back over your own hand is
  // changing your mind, so the card simply stays — the same answer the 503's own
  // pull gives, and the reason this returns a boolean: false hands the gesture
  // back to the fan, which settles the card home itself.
  const onCostPlay = useCallback(
    (uid: string, drop: HandPlayDrop): boolean => {
      if (!enabled || costPayment.current || !costOptions.includes(uid)) return false
      // let go over your own hand and nothing is spent — the card settles back
      // into the fan, which is what the fan does with a refused pull
      const hand = anchors.hand.current?.getBoundingClientRect()
      const home =
        hand &&
        drop.x >= hand.left &&
        drop.x <= hand.right &&
        drop.y >= hand.top &&
        drop.y <= hand.bottom
      if (home) return false
      onCostPick(uid, drop.rect)
      return true
    },
    [enabled, costOptions, anchors.hand, onCostPick],
  )

  // the fold — ported from ComboStory's `pickPartner`. The support is ALREADY
  // standing at the centre; only the partner travels, and its entry pose off
  // the pair's own frame is identity (`enterPose(cRect, cRect)`) — the
  // degenerate case, no branch, same as the main half's real one.
  // biome-ignore lint/correctness/useExhaustiveDependencies: commitStaged closes only over refs/setStaged and is stable in effect
  const onCardClick = useCallback(
    (index: number): boolean => {
      // Taken, not passed on: a fold in progress and a return flight in the air
      // both mean this gesture owns the fan, and handing the click to the plain
      // click gesture instead would dispatch a second play over the first. Under
      // `!enabled` that gesture's own actions are inert anyway, so the refusal
      // costs nothing and stays in one place.
      if (!enabled || cancellingRef.current || foldingRef.current) return true
      // A COST IS NOT PAID BY CLICKING. It is pulled out of the fan like every
      // other card given up (`onCostPlay`), so this gesture takes the click and
      // does nothing with it rather than passing it on: while a cost is owed the
      // only thing a fan card can do is pay, and handing the click to the plain
      // play gesture would start a play the engine is about to refuse.
      if (costOptions.length > 0) return true
      const s = stagedRef.current
      // A click chooses a combo partner; it never starts a play.
      if (!s) return false
      if (s.phase !== 'partner' || !s.support) return false
      const item = handItems[index]
      if (!item) return true
      const support = s.support
      const partners = state.comboOptions?.[support.uid] ?? []
      if (!partners.includes(item.uid)) {
        cancel() // not a valid partner — the whole staging returns, ComboStory's own answer
        return true
      }
      const cRect = anchors.centre.current?.getBoundingClientRect()
      if (!cRect) return true
      arrowCtl.stop() // the choice is made — nothing is pointed at while the pair folds
      const mainIndex = state.you.hand.findIndex((c) => c.uid === item.uid)
      const main: StagedCard = { uid: item.uid, card: item.card, index: mainIndex }
      // HOW THE TWO STAND IS THE SITUATION'S, not one rule for both yellows. A
      // Code Review RIDES the release it pays for: they lie one on the other, as
      // they will lie in the heap (owner, 18.09).
      //
      // A SUDO GOES BOTH WAYS, and what it enhances decides which (owner,
      // 20.09). Beside a git operation it stays its own card: the two take the
      // two places of the centre's row and nothing folds — the row the scene
      // shows, unchanged. Under an ATTACK it is a stack: the attack lies on top
      // of it, the way the centre already draws a played attack with a sudo
      // (`centreAttack`, a `CardPair` at the middle) and the way the two will
      // lie in the heap. That the staging stood them in a row and the play then
      // stood them in a stack was the same picture told twice.
      //
      // `merged` says a PAIR owns the centre, so it is false only for the row.
      const stacked = support.card.id === 'support-sudo' && main.card.category === 'attack'
      const sideBySide = support.card.id === 'support-sudo' && !stacked
      const merged = !sideBySide
      commitStaged({ support, main, phase: 'partner', merged })
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
          commitStaged({ support, main, phase: 'dispatched', merged })
          dispatchWatermarkRef.current = eventsRef.current.length
          actions?.onAttack?.(main.uid, support.uid)
        } else if (
          (state.targets?.[main.uid] ?? []).length > 0 &&
          !rebaseAllPiles(main.card, support.card)
        ) {
          commitStaged({ support, main, phase: 'target', merged })
          // The card that aims is the MAIN one, and where it stands depends on
          // how the two were put down: side by side it took the row's second
          // place, folded it owns the middle with the support under it. It is
          // also the card the arrow is COLOURED by, for the same reason — the
          // aim is its own now, the support only enhances it.
          aimFromPlay(main, sideBySide ? 1 : null)
        } else {
          commitStaged({ support, main, phase: 'dispatched', merged })
          dispatchWatermarkRef.current = eventsRef.current.length
          // A COMBO release — the other way a release reaches the table, and
          // the one the stage machine must be told about explicitly (#101,
          // Fix C, finding 5). Its release stands at the CENTRE as half of the
          // pair, so the stage slot is empty and must render nothing; without
          // this, whatever an earlier solo release left the machine at would
          // decide, and a leftover `standing` would draw this release at the
          // stage slot as well as in the pair. `paidCost` is cleared here for
          // the same fresh-cycle reason `onHandPlay` clears it: this release
          // carries a cost too, and the last one's must not stand beside it.
          setStage('none')
          setPaidCost(null)
          actions?.onPlay?.(main.uid, undefined, support.uid)
        }
      }

      // THE CARD WHERE IT IS DRAWN, not where its slot rests. The scene folds
      // from the card itself, and the card being clicked is the HOVERED one —
      // lifted out of the fan's resting line. Measuring `slotBox` instead (the
      // fan's rect plus `slotPlacement`) started the pair's half at a place the
      // player's card had never been, so it read as the clicked card vanishing
      // and a different one flying to the sudo. The slot is rotated, so its
      // bounding rect is the box AROUND the tilted card — `cardBoxIn` trims it
      // back (I6). `slotBox` stays the fallback for when there is no node to
      // measure (reduced motion, a hand that has not painted yet).
      const liveSlot = anchors.handSlotAt(index)?.getBoundingClientRect()
      const mainHand = liveSlot ? cardBoxIn(liveSlot, CARD_W) : slotBox(index, handItems.length)
      if (!mainHand) {
        finish()
        return true
      }
      // A sudo takes the place kept open beside it, and nothing folds.
      if (sideBySide) {
        const place = stageSlot(anchors, 1)?.getBoundingClientRect()
        if (reduced || !place) {
          foldingRef.current = false
          finish()
          return true
        }
        setCarrying([main.uid])
        void (async () => {
          try {
            const [el] = await flyer.raise([{ key: 'stage-main', card: main.card, at: mainHand }])
            if (el) await play('playToCenter', el, { from: mainHand, to: place })?.finished
          } catch {
            // a `void`ed body answers for its own failure — the card is staged
            // either way, the flight is only how it got there
          }
          flyer.drop('stage-main')
          setCarrying([])
          foldingRef.current = false
          finish()
        })()
        return true
      }
      // WHERE THE PAIR FOLDS IS WHERE IT THEN STANDS.
      //
      // A Code Review folds where the support ALREADY STANDS: its own place is
      // the frame, so the aux's entry pose is the degenerate identity case and
      // the fold needs no branch for it — the same thing that used to be true of
      // the middle, back when a pulled support stood there.
      //
      // A sudo under an attack folds at the MIDDLE, because that is where a
      // played attack stands: the sudo glides out of its place in the row into
      // the middle while the attack comes down onto it from the fan. It lands at
      // the tilt a played attack rests at, which is the very pose the centre's
      // own pending render then draws the same pair at — so the handover from
      // the fold's last frame to the static render changes nothing on screen.
      const standing = stageSlot(anchors, 0)?.getBoundingClientRect() ?? cRect
      const box = stacked ? cRect : standing
      const folding = pairApi.current.fold({
        main: main.card,
        aux: support.card,
        mainFrom: mainHand,
        auxFrom: standing,
        box,
        pose: stacked ? restTransform(ATTACK_POSE) : undefined,
        dur: reduced ? 0 : MERGE_MS,
      })
      // A game action never waits on an animation nobody plays: under reduced
      // motion the pair is mounted at its resting pose and the play dispatches
      // in this same tick, rather than a frame after the step's own mount.
      if (reduced) {
        void folding
        foldingRef.current = false
        finish()
        return true
      }
      void (async () => {
        try {
          // MERGING AT THE CENTRE — the partner arrives from its own slot and
          // the two fold together. The support is already standing at the
          // centre, so its place IS the pair's frame and its entry pose is the
          // degenerate identity case — the step needs no branch for it.
          await folding
          finish()
        } catch {
          // The step refused — nothing folded, so there is nothing to finish.
          // Swallowed rather than rethrown for the same reason as the flight
          // above: this body is `void`ed, and a rejection out of it is an
          // unhandled rejection with no one to answer it. The lock is cleared
          // by the `finally` below, which is what this exit is for.
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
      return true
    },
    [
      enabled,
      handItems,
      state.comboOptions,
      state.window,
      state.targets,
      state.playable,
      state.you.hand,
      reduced,
      slotBox,
      arrowCtl.stop,
      aimFromPlay,
      stageSoloRelease,
      stageAtCentre,
      actions,
      cancel,
      costOptions,
      onCostPlay,
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
    // NOT while our own pending still stands on the very card just played
    // (#168). The beat that ADOPTS the play (`operationBeat`) starts a commit
    // LATER than the projection that accepted it, and clearing here breaks the
    // hand-over twice over: the beat reads no handoff, so it flies a second
    // copy of a card the player has already dragged to the centre; and the fan
    // stops filtering, so under the beat's own shadow — the projection from
    // BEFORE the batch, where the card is still in the hand — the played card
    // pops back into the fan, which is where that second flight comes out of.
    // The beat's own `release()` is the designed end of the staging. Under
    // reduced motion no beat runs at all, so there is nothing to wait for.
    const pending = state.pending
    const adoptedByABeat =
      !reduced &&
      pending != null &&
      'source' in pending &&
      pending.source === s.main.card.id &&
      ('actor' in pending ? pending.actor : pending.player) === state.selfId
    if (adoptedByABeat) return
    if (!state.you.hand.some((c) => c.uid === s.main?.uid)) commitStaged(null)
  }, [state.you.hand, state.pending, state.selfId, reduced])

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

  // Reduced motion's own safety net for `paidCost` (#101, Task 11): the
  // ordinary clear is the combo beat's own, timed against its discard-exit
  // flight (comboBeat.tsx's `runRelease`) — but `useBeats.ts` never runs a
  // beat at all under reduced motion, so that clear never fires either, and
  // without this `paidCost` would stand at the cost slot for the rest of the
  // match: the exact permanent-artifact defect Task 8's review caught,
  // recurring on the one path that fix cannot reach. There is no hold to time
  // this against under reduced motion — nothing here holds for anything, the
  // static render is the whole story — so the moment the pending that asked
  // for this cost resolves is the moment it is safe to drop it. A harmless
  // no-op the rest of the time: `cost` is null before any release is ever
  // played, and this never runs at all once `reduced` is false.
  useEffect(() => {
    if (!reduced || cost) return
    setPaidCost(null)
  }, [reduced, cost])

  // THE ENGINE SAID NO TO THE COST — the card goes back into the fan, and it
  // FLIES there, through the shared insert every other card returning to a hand
  // uses. Nothing brought it home before: the card was simply dropped from the
  // cost slot and the projection drew it back into the fan on the next render,
  // which is a card appearing in the hand rather than arriving in it.
  //
  // It lands at the middle of the fan, like any arrival: the slot it left is not
  // its place any more — the fan has been laid out without it ever since the
  // pull took it.
  useEffect(() => {
    const paid = paidCost
    if (!paid) return
    const fresh = events.slice(costWatermarkRef.current)
    const refused = fresh.some(
      (e) =>
        e.type === 'rejected' &&
        'choice' in e.action &&
        e.action.choice?.kind === 'discardForRelease' &&
        e.action.choice.card === paid.uid,
    )
    if (!refused) return
    costWatermarkRef.current = events.length
    costPayment.current = null
    setPaidCost(null)
    // it is coming back, so it is the fan's again — the flight below is what
    // puts it there, and until it lands the arrival's own carrier draws it
    setCostGone(null)
    const at = anchors.cost.current?.getBoundingClientRect()
    if (reduced || !at) return
    flyHome([{ key: paid.uid, card: paid.card, from: at }])
  }, [events, paidCost, anchors.cost, reduced, flyHome])

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

  // A NEW MATCH wipes the gesture (#101, Fix C, finding 3) — same boundary,
  // same idiom and the same reason as `useBeats`'s own reset: the board is not
  // remounted for a rematch, so without this everything below outlives the
  // match it belonged to. A card standing at the centre keeps standing on the
  // new table; a paid cost keeps lying beside it (`_Board.tsx` renders
  // `paidCost` ungated); the stage machine keeps a `standing` nobody can see,
  // which the first release of the NEW match would then inherit — finding 5's
  // ordering bug, one level up, where its own "unobservable within a match"
  // reasoning no longer holds.
  //
  // `useLayoutEffect`, not `useEffect`: `useBeats` arms the new match's queue
  // in a layout effect too, and a beat must never run against a gesture the
  // dead match left behind. Keyed on the match, so it fires once per rematch
  // and never on an ordinary render.
  //
  // The carriers go with it for the same reason the runners' own do: a flyer
  // mid-flight, a parked hand-arrival and an armed arrow all belong to the
  // gesture, not to the queue, and they would otherwise keep crossing a table
  // that no longer has the hand they were flying to.
  //
  // The key it hangs on does not actually change per match today — see
  // `Options.matchKey` above, and `docs/animations/backlog.md`.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `matchKey` is the boundary and the only dependency this may have. `arrowCtl.stop` and `flyer.drop` happen to be memoized, but `arrival.reset` is a plain function `useHandArrival` recreates on every render — so listing what the body touches would wipe the gesture on every render instead of once per match. The closure is this render's, which is exactly what a wipe wants.
  useLayoutEffect(() => {
    plainAttempt.current += 1
    commitStaged(null)
    cancellingRef.current = false
    foldingRef.current = false
    dispatchWatermarkRef.current = 0
    setCancelling(false)
    setStage('none')
    resetCostPayment()
    pairApi.current.release()
    arrowCtl.stop()
    flyer.drop()
    arrival.reset()
    return () => {
      plainAttempt.current += 1
      costPayment.current = null
    }
  }, [matchKey])

  // the combo beat's own clear (#100) — no flight, just done. Unguarded, unlike
  // `cancel()`: the beat only ever calls this once ITS OWN read of the handoff
  // says the staged node is the one standing at the centre, so there is
  // nothing here left to double-check.
  // The beat has taken the play over: the staging ends with no flight, and the
  // step's node goes with it — whatever renders the pair at rest now owns it
  // (`usePairFold`: the node stays up until `release()`).
  // biome-ignore lint/correctness/useExhaustiveDependencies: commitStaged and the pair API are read through refs, stable by construction
  const release = useCallback(() => {
    pairApi.current.release()
    commitStaged(null)
  }, [])

  // the combo beat's own clear of `paidCost` (#101, Task 11) — same shape as
  // `release` above (no flight, just done), but a DIFFERENT piece of state:
  // `staged`'s lifecycle ends the instant the pending echoes back (long
  // before the cost is even paid, for a solo release — see the catch-up
  // effect above), while `paidCost` outlives it on purpose, so it needs its
  // own clear rather than a ride on `release()`'s.
  const clearPaidCost = useCallback(() => setPaidCost(null), [])

  // the placement beat's own take of the standing release (#101, Fix A) — the
  // same shape and the same seam as `clearPaidCost` above, for a different
  // card at a different moment: the cost leaves ~SHOW_HOLD before the release
  // itself does, so one call cannot serve both.
  // Guarded on `standing` for the same reason the pull's own landing is
  // guarded on `flying`: the beat is the only caller, but it fires from an
  // async run that a cancel or a match reset can overtake, and a release that
  // has already gone home must not be dragged back into `leaving`.
  const takeStagedRelease = useCallback(
    () => setStage((s) => (s === 'standing' ? 'leaving' : s)),
    [],
  )

  return {
    staged,
    dispatched: staged?.phase === 'dispatched',
    targets,
    arrow: arrowCtl,
    // the fold's own node only while it is carrying one: consumers read this
    // array's LENGTH to know whether a carrier is up (`_Board.tsx`'s own solo
    // staged render), so an always-present empty slot would read as one
    overlay: [
      ...flyer.overlay,
      ...costCarrier.overlay,
      ...arrival.overlay,
      ...(pair.overlay ? [pair.overlay] : []),
    ],
    gapAt: arrival.gapAt,
    gapSize: arrival.gapSize,
    handItems,
    handOut,
    accentAt,
    stateAt,
    pairNode: pair.node,
    carrying,
    onHandPlay,
    onCardClick,
    onTargetPick,
    cancel,
    release,
    costOptions,
    onCostPlay,
    stageStanding: stage === 'standing',
    paidCost,
    clearPaidCost,
    takeStagedRelease,
  }
}
