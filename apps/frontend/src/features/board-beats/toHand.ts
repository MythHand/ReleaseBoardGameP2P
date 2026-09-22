import type { CardData } from '@release/ui'
import type { Rect } from '@release/ui/animations'
import { useHandArrival } from '@release/ui/animations'
import { type RefObject, useCallback, useRef } from 'react'
import type { BeatRun, BoardState } from '~/entities/game/board'

// A CARD LANDS IN OUR OWN FAN — the whole movement, in one place.
//
// It was written out in five beats: the draw, the transfer, the AI effect, the
// DDoS hand-back and the defence's return. Each called the shared flight step
// and then did the rest its own way, and the rest is where all of it went
// wrong: three published the card into the run's own base and two did not, one
// named the slot by hand and the others left it to the step, and every one of
// them invented a key for a card the projection already has a name for.
//
// What the movement actually owns, and what this module now answers for:
//
//   THE NAME. `useHandArrival` hands its `key` back on landing as the card's
//   identity in the hand. A made-up one (`h4`, `t12`, `ins7`) is a card the
//   next projection does not recognise: the engine gave it a uid of its own,
//   the fan re-keys it a frame after it settled, and the player's private hand
//   order — which matches by uid — has nothing left to hold. The card slides to
//   the end of the fan, where the engine appends what a hand gains (owner,
//   22.09). The uid is knowable at that moment: `BeatRun.after` is the
//   projection the batch lands on, and the arriving card is the one it holds
//   and the base does not.
//
//   THE PLACE. No slot is named. A card that arrives has no place of its own,
//   so the step puts it in the middle of the fan — its own answer, and the one
//   every reference scene takes (`DrawCardStory`, `PickOpponentCardStory`).
//
//   THE SLOT, KEPT. Landing mid-fan is only half of it: the next projection
//   re-derives the hand from the engine, which appended the card, so the slot
//   has to be committed to the private order or the card teleports to the end
//   the moment the shadow drops. This is the seam System Upgrade and
//   Cherry-pick already went through, and the reason those two never jumped.
//
//   THE HANDOVER. The run's own base grows by the landed card, so the beat's
//   last frame equals the projection it hands to, and the card after it in the
//   same batch aims at the fan this one grew (I8). A card the base ALREADY
//   holds is not written in twice — a cancel's return never left the
//   projection — but its slot is committed all the same.

export interface Landing {
  card: CardData
  /** where it stands, for a step that raises its own carrier */
  from?: Rect | null
  /** …or the element itself, which the step measures and takes off screen */
  el?: HTMLElement | null
  /** the tilt it rests at, compensated on the way in */
  rot?: number
  /**
   * What to call the card when the projection cannot name it — no `after` yet,
   * or a hand that gained nothing. The flight is kept rather than dropped.
   */
  fallbackKey: string
}

/** the uid the arriving card answers to once the projection catches up */
function arrivingUid(base: BoardState, after: BoardState | undefined, fallback: string): string {
  const held = new Set(base.you.hand.map((c) => c.uid))
  return after?.you.hand.find((c) => !held.has(c.uid))?.uid ?? fallback
}

export function useToHand(
  hand: RefObject<HTMLDivElement | null>,
  /** the private hand order's commit — see THE SLOT, KEPT above */
  onHandArrival?: (hand: { uid: string; card: CardData }[], uid: string, at: number) => void,
) {
  // The run the current landing belongs to. A ref because a beat is one
  // closure and the fan it lands in is the one THIS run has grown.
  const run = useRef<BeatRun | null>(null)
  const commit = useRef(onHandArrival)
  commit.current = onHandArrival

  const { overlay, gapAt, gapSize, arrive, reset } = useHandArrival(hand, (gap, landed) => {
    const c = run.current
    if (!c) return
    const held = new Set(c.base.you.hand.map((h) => h.uid))
    const fresh = landed.filter((it) => !held.has(it.key))
    const next = [...c.base.you.hand]
    next.splice(gap, 0, ...fresh.map((it) => ({ uid: it.key, card: it.card })))
    commit.current?.(next, landed[0].key, gap)
    const state = { ...c.base, you: { ...c.base.you, hand: next } }
    c.base = state
    c.publish(state)
  })

  /**
   * Fly one card into the fan and settle everything that follows from it.
   * Answers whether the step took the flight — it refuses while another is in
   * the air or there is no fan to measure, and a caller that blanked the card
   * for this flight has to hear that.
   */
  const land = useCallback(
    (ctx: BeatRun, it: Landing): Promise<boolean> => {
      run.current = ctx
      const key = arrivingUid(ctx.base, ctx.after, it.fallbackKey)
      return arrive(
        [
          {
            key,
            card: it.card,
            ...(it.el ? { el: it.el } : { from: it.from ?? undefined }),
            rot: it.rot,
          },
        ],
        ctx.base.you.hand.length,
      )
    },
    [arrive],
  )

  return { overlay, gapAt, gapSize, land, reset }
}
