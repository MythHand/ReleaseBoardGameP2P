import { CARD_W, cardBoxIn, cardById } from '@release/ui'
import type { Rect } from '@release/ui/animations'
import { play, useFlyer, useHandArrival, wait } from '@release/ui/animations'
import { useCallback, useRef } from 'react'
import type { BeatRun, BoardAnchors, BoardState } from '~/entities/game/board'
import type { BeatPlan } from './planBeats'

// A card changes hands. One surface seen from three sides — you take a card,
// you lose one, or you watch one cross the table — and they are one runner
// because the flight is one flight: a seat, the centre, a destination. What
// differs is which end is a hand and which is a seat, and whether the card has
// an identity this peer is entitled to at all.
//
// THE BRANCH THAT MATTERS is not `role`, it is `plan.card`. Present means this
// peer is a party to the transfer (the engine sets `visibleTo: [from, to]`);
// absent means it is not, and the flight closes. Nothing here re-derives who
// may see what — that answer arrived with the event, and re-deriving it is how
// a hand leaks.

const REVEAL_HOLD = 820 // face-up at the centre before it drops into the fan
const SEAT_SHRINK = 0.7 // how small a card is inside a seat — `drawBeat`'s own value

// One flyer key for the whole run: there is never more than one card in the
// air here, and a key IS a flyer — raising the same key twice replaces the
// carrier instead of hanging a second node on the same name.
const KEY = 'transfer'

const rectOf = (el: Element | null): Rect | null => {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

export function useTransferBeat(anchors: BoardAnchors) {
  const { overlay: flyerOverlay, raise, pin, patch, drop, elOf } = useFlyer()

  // The run's own context, held in a ref because the whole beat is one closure
  // and the hand it lands in is the one THIS run has grown, not the one the
  // batch started with.
  const ctx = useRef<BeatRun | null>(null)

  const {
    overlay: handOverlay,
    gapAt,
    gapSize,
    arrive,
    reset: resetArrival,
  } = useHandArrival(anchors.hand, (gap, landed) => {
    const c = ctx.current
    if (!c) return
    const hand = [...c.base.you.hand]
    hand.splice(gap, 0, ...landed.map((it) => ({ uid: it.key, card: it.card })))
    const next = { ...c.base, you: { ...c.base.you, hand } }
    c.base = next
    c.publish(next)
  })

  const latest = useRef({ anchors, arrive })
  latest.current = { anchors, arrive }

  // The donor is one card lighter the moment it leaves them. Published as its
  // own step rather than folded into the landing, because the two ends of a
  // transfer are two different players and the flight is long enough to see
  // both — and because a watcher's flight has this end and no other.
  const dropFromDonor = useCallback((player: string) => {
    const c = ctx.current
    if (!c) return
    const next: BoardState = {
      ...c.base,
      opponents: c.base.opponents.map((o) =>
        o.id === player ? { ...o, handCount: Math.max(0, o.handCount - 1) } : o,
      ),
    }
    c.base = next
    c.publish(next)
  }, [])

  const runTransfer = useCallback(
    async (plan: Extract<BeatPlan, { kind: 'handTransfer' }>, beat: BeatRun) => {
      ctx.current = beat
      try {
        if (plan.role === 'taker') {
          const a = latest.current.anchors
          const seat = a.seatBox(plan.from)
          const centre = rectOf(a.centre.current)
          const card = plan.card ? cardById(plan.card) : null
          // A taker always knows what they took — but a missing rect or an
          // unknown id ends the leg and lets the projection stand, which is the
          // contract every runner keeps.
          if (!seat || !centre || !card) return
          // out of the seat's own card box (I6), at the size a card is while it
          // is inside a hidden hand — the exact box `dealToSeat` sinks into
          const from = cardBoxIn(seat, CARD_W * SEAT_SHRINK)
          const [el] = await raise([{ key: KEY, card, at: from, faceDown: true }])
          if (el) {
            const anim = play('takeFromSeat', el, { from, to: centre })
            if (anim) await anim.finished
            pin(KEY, centre) // I4 — it IS at the centre now
          }
          dropFromDonor(plan.from)
          patch(KEY, { faceDown: false }) // Card plays its own flipCard
          await wait(REVEAL_HOLD)
          const at = rectOf(elOf(KEY))
          drop(KEY)
          // The fan as it stands RIGHT NOW, and the card lands at its END —
          // the engine appends what a hand gains and `toBoardState` passes that
          // order through untouched, so any other slot makes this beat's last
          // frame disagree with the projection it hands over to.
          const grown = ctx.current?.base.you.hand.length ?? 0
          if (at)
            await latest.current.arrive([{ key: `t${plan.eventId}`, card, from: at }], grown, grown)
          return
        }
        // victim — Task 4; watcher — Task 5. Until then they publish nothing
        // and hand their own base on untouched: the queue drains, the shadow is
        // dropped, and the live projection wins.
      } finally {
        ctx.current = null
      }
    },
    [raise, pin, patch, drop, elOf, dropFromDonor],
  )

  // A new match cancels what is in the air: the carrier this run may have left
  // mid-flight, and the parked arrival that would otherwise land a dead match's
  // card in the new one's fan.
  const reset = useCallback(() => {
    drop()
    resetArrival()
  }, [drop, resetArrival])

  return { overlay: [...flyerOverlay, ...handOverlay], gapAt, gapSize, runTransfer, reset }
}
