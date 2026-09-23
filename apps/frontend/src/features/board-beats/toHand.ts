import type { CardData } from '@release/ui'
import type { Arriving, Rect } from '@release/ui/animations'
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
  onHandArrival?: (order: string[], uid: string, at: number) => void,
) {
  // What the landing belongs to: a beat's run (the card comes off the table and
  // the run's base grows by it), or a gesture bringing its own card home (the
  // projection never lost it, so there is nothing to grow — only the gesture to
  // end). One landing path, two things it can be handed.
  const run = useRef<BeatRun | null>(null)
  const coming = useRef<{
    done?: (gap: number, landed: { key: string; card: CardData }[]) => void
  } | null>(null)
  const commit = useRef(onHandArrival)
  commit.current = onHandArrival

  const { overlay, gapAt, gapSize, arrive, reset } = useHandArrival(
    hand,
    (gap, landed, fan = []) => {
      const back = coming.current
      const c = run.current

      // THE ORDER IS COMMITTED AGAINST THE FAN THE CARD LANDED IN — the one the
      // step measured on screen, not a list the caller happened to be holding.
      // The two are not the same hand whenever the exchange that brought this
      // card also took cards out of the hand: the projection this beat animates
      // away from still holds the cards that were just played, and an order
      // recorded against it places every card one or two slots off, which the
      // next projection then corrects in one jump (the sudo Rollback, owner
      // 22.09).
      // NOTHING MEASURED, NOTHING CLAIMED. An empty fan with cards in the hand
      // means the slots could not be read, and an order built from that would be
      // the landed card alone — every other card of the fan pushed behind it. The
      // player's own arrangement is not something to rewrite on a guess.
      if (fan.length > 0 || (c?.base.you.hand.length ?? 0) === 0) {
        const order = [...fan]
        order.splice(gap, 0, ...landed.map((it) => it.key))
        commit.current?.(order, landed[0].key, gap)
      }

      if (back) {
        coming.current = null
        back.done?.(gap, landed)
        return
      }
      if (!c) return
      // …and the run's own base grows by what landed, so the beat's last frame is
      // the projection it hands over to.
      //
      // AT THE SLOT IT LANDED IN, translated out of the fan's own numbering: the
      // board draws this shadow as it stands — the private order is applied to
      // the projection, not to what a beat publishes — so a card appended at the
      // end here would sit at the end of the fan for the rest of the beat and
      // move only once the projection caught up. The card to the right of the
      // gap is what the slot means, and where that card sits in the projection's
      // hand is where this one goes in.
      const held = new Set(c.base.you.hand.map((h) => h.uid))
      const fresh = landed.filter((it) => !held.has(it.key))
      if (fresh.length === 0) return
      const rightOf = fan[gap]
      const before = rightOf ? c.base.you.hand.findIndex((h) => h.uid === rightOf) : -1
      const next = [...c.base.you.hand]
      next.splice(
        before < 0 ? next.length : before,
        0,
        ...fresh.map((it) => ({ uid: it.key, card: it.card })),
      )
      const state = { ...c.base, you: { ...c.base.you, hand: next } }
      c.base = state
      c.publish(state)
    },
  )

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

  /**
   * THE CARD COMES HOME — a gesture's own card, pulled out of the fan and going
   * back into it: a play that was cancelled, one the engine refused, an answer
   * the player took back.
   *
   * The same movement as an arrival off the table, and deliberately not a second
   * one: the fan does not care where a card is flying from. It lands in the
   * MIDDLE like everything else (owner, 22.09) — which is why the slot is
   * committed here too, or the next projection would put it back where it used to
   * sit — and the gesture that blanked the card hears whether the flight was
   * taken, because a refusal is the one case where nothing else will ever put it
   * back.
   *
   * How big the fan is, and what is in it, the step counts for itself — a
   * gesture's own list and the fan on screen are not always the same hand.
   * `done` is the gesture's ending, run when the card is in, and handed the
   * slot and what landed for a gesture that has to tell one landing from
   * another.
   */
  const home = useCallback(
    (
      items: Arriving[],
      done?: (gap: number, landed: { key: string; card: CardData }[]) => void,
      /**
       * THE SLOT THE PLAYER POINTED AT — and only that. Dragging a card into a
       * place in the fan is a placement, not an arrival: the cursor named the
       * spot and the fan has to keep it. Everything else leaves this out and
       * lands in the middle, which is what an arrival means.
       */
      at?: number,
    ): Promise<boolean> => {
      run.current = null
      coming.current = { done }
      return arrive(items, undefined, at)
    },
    [arrive],
  )

  return { overlay, gapAt, gapSize, land, home, reset }
}
