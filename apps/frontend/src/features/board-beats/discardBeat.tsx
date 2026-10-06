import { cardBoxIn, cardById, PAIR_AUX } from '@release/ui'
import type { Leaving, Rect } from '@release/ui/animations'
import {
  nextFrames,
  restTransform,
  scatterAt,
  useDiscardExit,
  useFlyer,
  wait,
} from '@release/ui/animations'
import { type RefObject, useCallback, useRef } from 'react'
import type { BeatRun, BoardAnchors, StagedHandoff } from '~/entities/game/board'
import { ALARM_POSE, GATHER_HOLD } from '~/entities/game/board'
import { liftOff } from './cardPlace'
import type { BeatPlan, DiscardCard } from './planBeats'
import { settleInto } from './toHeap'
import { withoutFlown } from './withoutFlown'

// A card leaves the table for the discard. The movement itself belongs to the
// shared step (`useDiscardExit`); what lives here is only where each card
// starts from, and the wait that makes measuring it honest.
//
// And it is in the heap from the commit its carrier comes down, filed by this
// beat like every other exit's (`toHeap`): the projection holds it too, but
// only once the queue hands over, and between the two the card was nowhere.

const rectOf = (el: Element | null): Rect | null => {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

export function useDiscardBeat(anchors: BoardAnchors, staging?: RefObject<StagedHandoff | null>) {
  const { overlay: exitOverlay, send, reset: resetExit } = useDiscardExit(anchors.discardBox)
  // The sweep's own carrier (#102): the cards a defenceless player owned are
  // drawn together at the centre before they scatter, and that draw-together
  // leg needs a flyer of its own — the exit step only ever flies FROM where a
  // card stands TO the discard, it has no notion of a stop in between.
  const flyer = useFlyer()
  const latest = useRef({ anchors, send, staging })
  latest.current = { anchors, send, staging }

  const whereFrom = useCallback((c: DiscardCard): Rect | null => {
    const a = latest.current.anchors
    if (c.source.kind === 'hand') return rectOf(a.handSlotAt(c.source.index))
    if (c.source.kind === 'release') return rectOf(a.releaseSlot(c.source.player, c.source.slot))
    return a.seatBox(c.source.player)
  }, [])

  const toLeaving = useCallback(
    (c: DiscardCard, stagedFrom?: Rect): Leaving | null => {
      const card = cardById(c.card)
      const from = stagedFrom ?? whereFrom(c)
      if (!card || !from) return null
      // The SAME Scatter the adapter rests this card on (I7): the flight ends on
      // the pose the heap already holds for it, so nothing moves on handover.
      return { key: c.key, card, from, scatter: scatterAt(c.eventId) }
    },
    [whereFrom],
  )

  const run = useCallback(
    async (plan: Extract<BeatPlan, { kind: 'discard' }>, ctx: BeatRun) => {
      const handoff = latest.current.staging?.current
      // WAIT FOR THE SHADOW, THEN MEASURE — in that order, and the order is the
      // whole point. The queue starts this from inside a layout effect, so at
      // entry React has committed the projection that ARRIVED: the card is
      // already out of the fan and its slot with it. The shadow that puts the
      // slot back is a commit away. Two frames is how we get to the other side
      // of it (the same reason the carrier waits, I2).
      //
      // Measuring before this yields `null` for a one-card hand (no flight at
      // all) and the wrong slot for a larger one — and no test can see it,
      // because a stub that hands back a detached node measures the same either
      // way. `useBeats.test.tsx` queries the probe's real DOM for exactly this.
      await nextFrames()
      const items: Leaving[] = []
      const flown: DiscardCard[] = []
      let adopted = false
      for (const c of plan.cards) {
        const uid = c.source.kind === 'hand' ? ctx.base.you?.hand[c.source.index]?.uid : undefined
        const staged = uid != null && (uid === handoff?.mainUid || uid === handoff?.supportUid)
        const centre = staged ? rectOf(latest.current.anchors.centre.current) : null
        const aux = staged && uid === handoff?.supportUid
        const auxEl = aux ? handoff?.el?.querySelector<HTMLElement>('[data-aux]') : null
        const from =
          centre && auxEl ? cardBoxIn(auxEl.getBoundingClientRect(), centre.width) : centre
        const leaving = toLeaving(c, from ?? undefined)
        if (leaving) {
          if (aux && centre) leaving.pose = { rot: PAIR_AUX.rot, dx: 0, dy: 0 }
          if (staged && handoff?.supportUid) leaving.layer = aux ? 0 : 1
          items.push(leaving)
          flown.push(c)
          adopted ||= staged
        }
      }
      if (items.length === 0 && !plan.alarm) return
      // TAKEOFF: the fan has already let go of these cards — publish now, before
      // the flight itself, or the board would show the card twice for as long as
      // the flight lasts (once mid-air, once still sitting in its slot). The
      // discard end is deliberately left at `ctx.base`'s own — see
      // `withoutFlown`'s comment for why. The run's base moves with it: the
      // heap is filed on it once they land.
      ctx.base = withoutFlown(ctx.base, flown)
      ctx.publish(ctx.base)
      // Pile selection stages Git cards at the centre. Hand that render to
      // the exit together with the shadow update, rather than flying a copy
      // from the old fan slot (which may already hold a different card).
      if (adopted) handoff?.release()
      // THE SWEEP (#102): a defenceless player's whole table does not leave
      // card by card — it is gathered at the centre first, held open long
      // enough for the table to read what happened, and only then scattered.
      // Ported from the playground's own Error503Story.sweep(items, gather).
      if (plan.gather) {
        const centre = rectOf(latest.current.anchors.centre.current)
        if (centre) {
          // A HEAP, not a neat stack: the same scatter model the discard uses,
          // so the pile at the centre reads as a pile.
          const heap = items.map((_, i) => scatterAt(i))
          const boxes = heap.map((sc) => ({
            left: centre.left + sc.dx,
            top: centre.top + sc.dy,
            width: centre.width,
            height: centre.height,
          }))
          // `from` is guaranteed here — every item in `items` came out of
          // `toLeaving`, which only ever returns one when its `from` resolved
          // (`Leaving.from` is optional in the shared type only because a
          // flight can also start from a live `node`, a case this beat never
          // produces).
          await flyer.raise(
            items.map((it, i) => ({ key: `s${i}`, card: it.card, at: it.from as Rect })),
          )
          await Promise.all(
            items.map((_, i) => {
              // the tilt travels WITH the move, so the card eases into its
              // place in the pile instead of snapping into the angle
              flyer.patch(`s${i}`, { pose: restTransform({ ...heap[i], dx: 0, dy: 0 }) })
              return flyer.glide(`s${i}`, boxes[i], 300)
            }),
          )
          // held open at the centre — the table has to be readable before the
          // cards scatter
          await wait(GATHER_HOLD)
          // Hand the step the card BOXES, not the tilted nodes: a rotated
          // node's bounding rect is the box AROUND it (I6). The step raises
          // its own flyers and unwinds the tilt in flight, so the carrier's
          // are dropped in the same turn the step's appear.
          for (let i = 0; i < items.length; i++) {
            items[i] = {
              ...items[i],
              from: boxes[i],
              pose: { rot: heap[i].rot, dx: 0, dy: 0 },
              layer: i,
            }
          }
          flyer.drop()
        }
      }
      // THE ERROR 503 THE PLAYER PASSED leaves with them (owner, 03.10): from
      // where it stands, straight, in this same send and under the rest — the
      // engine banks it first. Before, nothing flew it and the projection
      // put it in the heap in one jump.
      const alarm = plan.alarm
      const alarmCard = alarm ? cardById(alarm.card) : null
      const alarmBox = alarm ? rectOf(latest.current.anchors.centre.current) : null
      const under = alarm ? 1 : 0
      const sent: Leaving[] = [
        ...(alarm && alarmCard && alarmBox
          ? [
              {
                key: `d${alarm.eventId}`,
                card: alarmCard,
                from: alarmBox,
                pose: ALARM_POSE,
                scatter: scatterAt(alarm.eventId),
                layer: 0,
              },
            ]
          : []),
        ...items.map((it) => (under ? { ...it, layer: (it.layer ?? 0) + under } : it)),
      ]
      // …as they lay, the alarm at the bottom (`toHeap`)
      const filed = [
        ...(alarm ? [{ ...alarm, layer: 0 }] : []),
        ...flown.map((c, i) => ({
          eventId: c.eventId,
          card: c.card,
          layer: (items[i].layer ?? 0) + under,
        })),
      ]
      // What stands is the alarm alone: the fan let go of the swept cards at
      // the TAKEOFF publish above, which has to happen there and not here — the
      // sweep runs in between, and it gathers the very cards this send then
      // scatters. The alarm leaves the centre in the commit its carrier goes up.
      const letGoOfTheAlarm = alarm
        ? () => {
            liftOff(ctx, [{ kind: 'centre', card: alarm.card }])
          }
        : null
      await latest.current.send(sent, letGoOfTheAlarm)
      // nothing measured to fly it: it still leaves (a no-op once it has)
      letGoOfTheAlarm?.()
      settleInto(ctx, filed)
    },
    [toLeaving, flyer.raise, flyer.patch, flyer.glide, flyer.drop],
  )

  // A new match cancels what is in the air — the same reason and the same
  // idiom every other runner keeps its own carriers by: both the exit step's
  // flights and the sweep's own flyer belong to this runner, not the queue,
  // and a card left mid-flight would keep crossing the board of a match that
  // no longer exists.
  const reset = useCallback(() => {
    resetExit()
    flyer.drop()
  }, [resetExit, flyer.drop])

  return { overlay: [...exitOverlay, ...flyer.overlay], run, reset }
}
