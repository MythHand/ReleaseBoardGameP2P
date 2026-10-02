import { rowCells } from '@release/ui'
import type { Rect } from '@release/ui/animations'
import { play, restTransform, usePairFold } from '@release/ui/animations'
import { useCallback, useRef } from 'react'
import {
  ATTACK_POSE,
  type BeatRun,
  type BoardAnchors,
  type BoardState,
  type ShownCard,
  type ShownPlace,
  type StagedHandoff,
  shownLayout,
  shownPlaceOf,
} from '~/entities/game/board'
import { liftOff, type Place } from './cardPlace'
import type { BeatPlan } from './planBeats'
import { seatCardBox } from './seat'
import { useToCentre } from './toCentre'

// ANOTHER PLAYER'S CARD, PUT OUT AT THE CENTRE OR TAKEN BACK (resolution.md §1).
//
// Nothing here is a movement of its own. A card comes out of a seat to a place
// at the centre by the shared journey there (`useToCentre`, `takeFromSeat`), and
// goes back into a hidden hand the way every closed card does (`dealToSeat` into
// the seat's card box). WHERE it stands is `shownLayout`'s answer — the same one
// the board's render reads, so the flight lands exactly where the card then
// stands. Our own cards never come here: our gesture put them where they are.

const rectOf = (el: Element | null): Rect | null => {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

/** Where a place of the centre is on screen right now — asked of the centre module for the row, whose places are not mounted until something stands in them. */
export function placeRect(place: ShownPlace, a: BoardAnchors): Rect | null {
  if (place === 'stage') return rectOf(a.stage.current)
  const centre = rectOf(a.centre.current)
  if (!centre || place === 'solo') return centre
  // the row and the centre share one point, so a place of the row is an offset
  // from the centre place's own middle
  const cell = rowCells('staging', 2)[place === 'row0' ? 0 : 1]
  if (!cell) return null
  return {
    left: centre.left + centre.width / 2 + cell.dx - cell.w / 2,
    top: centre.top + centre.height / 2 - cell.h / 2,
    width: cell.w,
    height: cell.h,
  }
}

const shownBy = (base: BoardState, player: string): ShownCard[] =>
  (base.shown ?? []).filter((s) => s.player === player)

/** An attack at the middle — alone, or lying on its Sudo — rests at the played tilt (I11). */
const tiltOf = (place: ShownPlace | null, card: ShownCard) =>
  place === 'solo' && (card.card.category === 'attack' || card.card.id === 'support-sudo')
    ? ATTACK_POSE
    : null

/**
 * WHERE A PLAY'S OWN CARD STARTS, when its player had it out at the centre: the
 * place it stands in, and the board without it — to be published in the same
 * commit the carrier taking it over goes up, so the card is never drawn twice.
 * Null when the card was not shown: the beat starts from the seat as it always
 * did.
 */
export function shownSource(
  base: BoardState,
  player: string,
  cards: string[],
  a: BoardAnchors,
): { rect: Rect; next: BoardState } | null {
  const theirs = shownBy(base, player)
  const leaving = theirs.filter((s) => cards.includes(s.card.id))
  if (leaving.length === 0) return null
  const place = shownPlaceOf(shownLayout(theirs), leaving[0].uid)
  const rect = place ? placeRect(place, a) : null
  if (!rect) return null
  const gone = new Set(leaving.map((s) => s.uid))
  return { rect, next: { ...base, shown: (base.shown ?? []).filter((s) => !gone.has(s.uid)) } }
}

/**
 * OUR OWN PLAY, TAKEN OVER FROM THE GESTURE: the cards it holds are nowhere the
 * board draws them any more, and the gesture lets go of them — in one commit.
 *
 * The shadow a beat runs on is the board from BEFORE the batch, where our played
 * card is still in the hand AND still out at the centre. Released with either
 * left in, the gesture held nothing and the board drew the card from what was
 * left: a second DDoS stood at the middle while the real one flew to the
 * discard (#168), and an accepted attack came back into the fan for a frame
 * before the centre took it (owner's recordings, 02.10). Every place the card is
 * drawn from is `cardPlace`'s to know; this names the card.
 */
export function adoptStaged(ctx: BeatRun, handoff: StagedHandoff | null | undefined): void {
  if (!handoff) return
  liftOff(ctx, stagedPlaces(handoff), handoff)
}

const stagedPlaces = (handoff: StagedHandoff): Place[] =>
  [handoff.mainUid, handoff.supportUid].flatMap((uid) =>
    uid ? [{ kind: 'hand' as const, uid }] : [],
  )

/**
 * The board without the cards the gesture hands over, off the CENTRE only. Kept
 * for the operation beat alone, which still takes its card out of the hand by
 * position afterwards (`withoutFlown`) — taking it out by uid here first would
 * move every position after it. Goes when that beat moves onto `cardPlace`.
 */
export function withoutStaged(
  base: BoardState,
  handoff: StagedHandoff | null | undefined,
): BoardState {
  if (!handoff) return base
  const gone = new Set([handoff.mainUid, handoff.supportUid])
  const shown = base.shown ?? []
  return shown.some((s) => gone.has(s.uid))
    ? { ...base, shown: shown.filter((s) => !gone.has(s.uid)) }
    : base
}

export function useShownBeat(anchors: BoardAnchors) {
  const { overlay: flyerOverlay, raise, drop, toSlot } = useToCentre()
  const { overlay: pairOverlay, fold, release } = usePairFold()
  const latest = useRef(anchors)
  latest.current = anchors

  // seat -> the place it will stand in, face up
  const runShown = useCallback(
    async (plan: Extract<BeatPlan, { kind: 'shown' }>, ctx: BeatRun) => {
      const a = latest.current
      // The instance the batch lands on that the board does not stand yet — the
      // event names the card, the projection names which one of its copies.
      const held = new Set((ctx.base.shown ?? []).map((s) => s.uid))
      const card = ctx.after?.shown?.find(
        (s) => s.player === plan.player && s.card.id === plan.card && !held.has(s.uid),
      )
      if (!card) return
      // off the seat's counter as it takes off
      const lifted: BoardState = {
        ...ctx.base,
        opponents: ctx.base.opponents.map((o) =>
          o.id === plan.player ? { ...o, handCount: Math.max(0, o.handCount - 1) } : o,
        ),
      }
      ctx.base = lifted
      ctx.publish(lifted)
      const standing: BoardState = { ...lifted, shown: [...(lifted.shown ?? []), card] }
      const layout = shownLayout(shownBy(standing, plan.player))
      const place = shownPlaceOf(layout, card.uid)
      const to = place ? placeRect(place, a) : null
      const from = a.seatBox(plan.player)

      // IT MAKES A PAIR WITH A CARD ALREADY STANDING — the two fold together,
      // the shared step every pair on this table forms by (`usePairFold`): the
      // standing half glides out of its place, the new one comes in from the
      // seat, and they meet where the pair stands.
      const pair = layout.pair
      const partner = pair && (pair.main.uid === card.uid ? pair.aux : pair.main)
      const partnerPlace =
        partner && held.has(partner.uid)
          ? shownPlaceOf(shownLayout(shownBy(lifted, plan.player)), partner.uid)
          : null
      const partnerAt = partnerPlace ? placeRect(partnerPlace, a) : null
      if (pair && partner && partnerAt && from && to) {
        const arriving = pair.main.uid === card.uid
        const folding = fold({
          main: pair.main.card,
          aux: pair.aux.card,
          mainFrom: arriving ? from : partnerAt,
          auxFrom: arriving ? partnerAt : from,
          box: to,
          ...(pair.at === 'solo' ? { pose: restTransform(ATTACK_POSE) } : {}),
        })
        // the standing half is the fold's now
        const taken: BoardState = {
          ...lifted,
          shown: (lifted.shown ?? []).filter((s) => s.uid !== partner.uid),
        }
        ctx.base = taken
        ctx.publish(taken)
        await folding
        ctx.base = standing
        ctx.publish(standing)
        release()
        return
      }

      const tilt = tiltOf(place, card)
      if (to && from) {
        await toSlot({
          key: 'shown',
          card: card.card,
          from,
          to,
          faceDown: false,
          motion: 'takeFromSeat',
          ...(tilt ? { pose: tilt } : {}),
        })
      }
      // Landed: the board's own render takes the card over in the same commit
      // the carrier goes down in.
      ctx.base = standing
      ctx.publish(standing)
      drop('shown')
    },
    [toSlot, drop, fold, release],
  )

  // the places they stand in -> the seat, dissolving into its counter
  const runTakenBack = useCallback(
    async (plan: Extract<BeatPlan, { kind: 'takenBack' }>, ctx: BeatRun) => {
      const a = latest.current
      const theirs = shownBy(ctx.base, plan.player)
      const layout = shownLayout(theirs)
      const back = theirs.filter((s) => plan.cards.includes(s.card.id))
      const flights = back.flatMap((s) => {
        const place = shownPlaceOf(layout, s.uid)
        const at = place ? placeRect(place, a) : null
        return at ? [{ card: s, at, tilt: tiltOf(place, s) }] : []
      })
      const gone = new Set(back.map((s) => s.uid))
      const cleared: BoardState = {
        ...ctx.base,
        shown: (ctx.base.shown ?? []).filter((s) => !gone.has(s.uid)),
      }
      const seat = a.seatBox(plan.player)
      if (seat && flights.length > 0) {
        const raised = raise(
          flights.map((f) => ({
            key: `back:${f.card.uid}`,
            at: f.at,
            card: f.card.card,
            faceDown: false,
          })),
        )
        // the carriers go up and the standing render goes down in one commit
        ctx.base = cleared
        ctx.publish(cleared)
        const els = await raised
        const to = seatCardBox(seat)
        await Promise.all(
          els.map((el, i) =>
            el
              ? play('dealToSeat', el, {
                  to,
                  rotateFrom: flights[i].tilt?.rot ?? 0,
                })?.finished
              : null,
          ),
        )
      } else {
        ctx.base = cleared
        ctx.publish(cleared)
      }
      drop()
      // …and the counter takes them back as they sink into it
      const home: BoardState = {
        ...ctx.base,
        opponents: ctx.base.opponents.map((o) =>
          o.id === plan.player ? { ...o, handCount: o.handCount + back.length } : o,
        ),
      }
      ctx.base = home
      ctx.publish(home)
    },
    [raise, drop],
  )

  // a new match drops whatever is in the air
  const reset = useCallback(() => {
    drop()
    release()
  }, [drop, release])

  return {
    // the pair's node only while a pair is folding — an empty entry would read
    // as something still in the air
    overlay: pairOverlay ? [...flyerOverlay, pairOverlay] : flyerOverlay,
    runShown,
    runTakenBack,
    reset,
  }
}
