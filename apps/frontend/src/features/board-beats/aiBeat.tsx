import { cardAreaOf, cardById } from '@release/ui'
import type { Rect } from '@release/ui/animations'
import { play, scatterAt, useDiscardExit, useHandArrival, wait } from '@release/ui/animations'
import { useCallback, useRef } from 'react'
import type { BeatRun, BoardAnchors } from '~/entities/game/board'
import type { BeatPlan } from './planBeats'
import { HALLUCINATION_HOLD, TABLE_HOLD, useToCentre } from './toCentre'

// AN AI CARD, from the pile to whatever it turns out to mean.
//
// One scene with six endings, and it is one runner because the opening is one
// opening: a trigger comes off a draw pile and stands at the left as the CAUSE,
// the events deck gives up the card that explains it, and both are held long
// enough to be read. Only then do the endings differ.
//
// What must not be re-derived here is the ending. The plan read it off the
// events the engine actually emitted; a runner that looked at `eventCard` and
// decided for itself what an `ai-crush-frontend` does would be a second opinion
// about the rules, free to drift from the first.

const FLIP_MS = 420 // `flipCard`'s own duration
const BEFORE_FLIP = 220 // the card rests where it landed before it turns over
const AFTER_FLIP = 560 // the flip, plus a pause to read it by

// One key is one flyer: raising a key that is still up replaces the carrier
// rather than hanging a second node on the same name.
const TRIG = 'trig'
const EFF = 'eff'

const rectOf = (el: Element | null): Rect | null => {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

export function useAiBeat(anchors: BoardAnchors) {
  const { overlay: flyerOverlay, patch, drop, elOf, toSlot } = useToCentre()
  const exit = useDiscardExit(anchors.discardBox)
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

  const latest = useRef({ anchors, exit, arrive })
  latest.current = { anchors, exit, arrive }

  // A card leaves the table for the events deck. It turns face down first — the
  // way every card entering play turns face up first — and then shrinks back
  // into the pile it came from.
  const goHome = useCallback(
    async (key: string, from: Rect | null) => {
      patch(key, { faceDown: true })
      await wait(FLIP_MS)
      const el = elOf(key)
      const deck = rectOf(latest.current.anchors.eventsBox.current)
      if (!el || !from || !deck) return
      const anim = play('returnToDeck', el, { from, to: cardAreaOf(deck) })
      if (anim) await anim.finished
    },
    [patch, elOf],
  )

  const run = useCallback(
    async (plan: Extract<BeatPlan, { kind: 'aiEvent' }>, beat: BeatRun) => {
      ctx.current = beat
      const a = latest.current.anchors
      const trigger = cardById(plan.trigger)
      const event = cardById(plan.eventCard)
      const pile = rectOf(a.pileBox(plan.pile))
      const cause = rectOf(a.cause.current)
      const effect = rectOf(a.effect.current)
      const events = rectOf(a.eventsBox.current)
      if (!trigger || !event || !pile || !cause || !effect || !events) return

      // 1. the trigger comes off the pile and stands as the cause
      await toSlot({ key: TRIG, card: trigger, from: cardAreaOf(pile), to: cause })
      await wait(BEFORE_FLIP)
      patch(TRIG, { faceDown: false })
      await wait(AFTER_FLIP)

      // 2. the events deck gives up the card that explains it
      await toSlot({ key: EFF, card: event, from: cardAreaOf(events), to: effect })
      await wait(BEFORE_FLIP)
      patch(EFF, { faceDown: false })
      await wait(AFTER_FLIP)

      // 3. the table reads them. Hallucination lingers twice as long — the
      //    scene's own doubling, not a judgement made here.
      await wait(plan.eventCard === 'ai-hallucination' ? HALLUCINATION_HOLD : TABLE_HOLD)

      // 4. the trigger goes to the heap, on the scatter its own event id
      //    produces — one value, two readers (I7), so the heap rests it exactly
      //    where the flight put it.
      const triggerOut =
        plan.triggerDiscardId >= 0
          ? latest.current.exit
              .send([
                {
                  key: `d${plan.triggerDiscardId}`,
                  card: trigger,
                  node: elOf(TRIG),
                  scatter: scatterAt(plan.triggerDiscardId),
                },
              ])
              .then(() => drop(TRIG))
          : Promise.resolve()

      // 5. …and the AI card takes the road its ending gives it.
      const effectOut = (async () => {
        if (plan.tail.kind === 'zone') {
          const slot = rectOf(a.releaseSlot(plan.player, plan.tail.slot))
          const el = elOf(EFF)
          if (el && slot) {
            const anim = play('playToReleaseZone', el, { from: effect, to: slot })
            if (anim) await anim.finished
          }
          // It STAYS. No return home: the batch said `released`/`placed`, which
          // is what standing on the table looks like from outside the engine.
          drop(EFF)
          return
        }
        await goHome(EFF, effect)
        drop(EFF)
      })()

      await Promise.all([triggerOut, effectOut])
    },
    [toSlot, patch, drop, elOf, goHome],
  )

  const reset = useCallback(() => {
    drop()
    resetArrival()
    ctx.current = null
  }, [drop, resetArrival])

  return { overlay: [...flyerOverlay, ...handOverlay], gapAt, gapSize, run, reset }
}
