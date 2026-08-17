import type { ReleaseSlots } from '@release/ui'
import { cardById } from '@release/ui'
import type { Leaving, Rect } from '@release/ui/animations'
import { nextFrames, scatterAt, useDiscardExit } from '@release/ui/animations'
import { useCallback, useRef } from 'react'
import type { BeatRun, BoardAnchors, BoardState } from '~/entities/game/board'
import type { BeatPlan, DiscardCard } from './planBeats'

// A card leaves the table for the discard. The movement itself belongs to the
// shared step (`useDiscardExit`); what lives here is only where each card
// starts from, and the wait that makes measuring it honest.
//
// No onLanded: the heap is derived from these same events in toBoardState, so
// the cards this step flew are already in the projection it hands over to. A
// second set of books here would be a second source for one heap.

const rectOf = (el: Element | null): Rect | null => {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

// The shadow's lifetime scopes PER END, not per beat. The hand goes live the
// moment a card's slot has been measured — it leaves the fan as it takes off,
// which is what the playground's own drag-out does too — while the discard end
// keeps the pre-batch projection until the card actually lands, or the heap
// would show it before it arrives. `run` publishes exactly this: `ctx.base`
// with every flying card gone from wherever it stood, and `decks` untouched.
// Pure, so the beat only has to call it and hand the result to `ctx.publish`.
function withoutFlown(base: BoardState, flown: DiscardCard[]): BoardState {
  const handIndexes = new Set<number>()
  const clearedSlots = new Map<string, Set<keyof ReleaseSlots>>()
  const seatDrops = new Map<string, number>()

  for (const { source } of flown) {
    if (source.kind === 'hand') {
      handIndexes.add(source.index)
    } else if (source.kind === 'release') {
      const slots = clearedSlots.get(source.player) ?? new Set<keyof ReleaseSlots>()
      slots.add(source.slot as keyof ReleaseSlots)
      clearedSlots.set(source.player, slots)
    } else {
      seatDrops.set(source.player, (seatDrops.get(source.player) ?? 0) + 1)
    }
  }

  const withoutSlots = (release: ReleaseSlots, slots?: Set<keyof ReleaseSlots>): ReleaseSlots => {
    if (!slots) return release
    const next = { ...release }
    for (const slot of slots) next[slot] = null
    return next
  }

  return {
    ...base,
    you: {
      ...base.you,
      hand:
        handIndexes.size > 0 ? base.you.hand.filter((_, i) => !handIndexes.has(i)) : base.you.hand,
      release: withoutSlots(base.you.release, clearedSlots.get(base.selfId)),
    },
    opponents: base.opponents.map((o) => {
      const drop = seatDrops.get(o.id)
      const slots = clearedSlots.get(o.id)
      if (!drop && !slots) return o
      return {
        ...o,
        handCount: drop ? o.handCount - drop : o.handCount,
        release: withoutSlots(o.release, slots),
      }
    }),
  }
}

export function useDiscardBeat(anchors: BoardAnchors) {
  const { overlay, send, reset } = useDiscardExit(anchors.discardBox)
  const latest = useRef({ anchors, send })
  latest.current = { anchors, send }

  const whereFrom = useCallback((c: DiscardCard): Rect | null => {
    const a = latest.current.anchors
    if (c.source.kind === 'hand') return rectOf(a.handSlotAt(c.source.index))
    if (c.source.kind === 'release') return rectOf(a.releaseSlot(c.source.player, c.source.slot))
    return a.seatBox(c.source.player)
  }, [])

  const toLeaving = useCallback(
    (c: DiscardCard): Leaving | null => {
      const card = cardById(c.card)
      const from = whereFrom(c)
      if (!card || !from) return null
      // The SAME Scatter the adapter rests this card on (I7): the flight ends on
      // the pose the heap already holds for it, so nothing moves on handover.
      return { key: c.key, card, from, scatter: scatterAt(c.eventId) }
    },
    [whereFrom],
  )

  const run = useCallback(
    async (plan: Extract<BeatPlan, { kind: 'discard' }>, ctx: BeatRun) => {
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
      for (const c of plan.cards) {
        const leaving = toLeaving(c)
        if (leaving) {
          items.push(leaving)
          flown.push(c)
        }
      }
      if (items.length === 0) return
      // TAKEOFF: the fan has already let go of these cards — publish now, before
      // the flight itself, or the board would show the card twice for as long as
      // the flight lasts (once mid-air, once still sitting in its slot). The
      // discard end is deliberately left at `ctx.base`'s own — see
      // `withoutFlown`'s comment for why.
      ctx.publish(withoutFlown(ctx.base, flown))
      await latest.current.send(items)
    },
    [toLeaving],
  )

  return { overlay, run, reset }
}
