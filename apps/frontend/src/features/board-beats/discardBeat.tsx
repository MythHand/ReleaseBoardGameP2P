import { cardById } from '@release/ui'
import type { Leaving, Rect } from '@release/ui/animations'
import { nextFrames, scatterAt, useDiscardExit } from '@release/ui/animations'
import { useCallback, useRef } from 'react'
import type { BeatRun, BoardAnchors } from '~/entities/game/board'
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

export function useDiscardBeat(anchors: BoardAnchors) {
  const { overlay, send } = useDiscardExit(anchors.discardBox)
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
    async (plan: Extract<BeatPlan, { kind: 'discard' }>, _ctx: BeatRun) => {
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
      const items = plan.cards.map(toLeaving).filter((it): it is Leaving => it != null)
      if (items.length > 0) await latest.current.send(items)
    },
    [toLeaving],
  )

  return { overlay, run }
}
