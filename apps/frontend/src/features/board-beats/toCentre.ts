import type { CardData } from '@release/ui'
import type { Rect } from '@release/ui/animations'
import { play, restTransform, useFlyer } from '@release/ui/animations'
import type { ReactNode } from 'react'
import { useCallback } from 'react'

// THE FLIGHT TO A PLACE AT THE CENTRE, packaged once.
//
// A card leaves where it was, travels to a named place at the centre, and STAYS
// there — so whatever comes next (a flip, a second flight, a discard exit)
// starts from where it stands rather than from where it began (I4). `drawBeat`
// had it first and `aiBeat` needs it twice; by #88's own standing rule that
// makes it a module rather than a movement to write again.
//
// It began as "out of a pile" and that is still its default, but WHERE FROM was
// never what it is about: a DDoS pulls a card out of a release zone, and that
// card makes the same journey to the same kind of place. The two things that do
// differ are named by the caller — which travel it is, and the pose the place
// holds it at — while the journey's own rules stay here.
//
// It is a hook and not a bare function so that it can own the `useFlyer` call:
// a bare function would have to be handed the carrier, and a carrier passed
// between files is how two runners end up sharing one overlay by accident.

// How long a card the SYSTEM turned up stands for the table to read it. The
// value is the example scene's — `AiCardsStory`'s `TABLE_HOLD` — and not a
// number chosen here. There is no separate "plain reveal" hold anywhere in the
// scenes, because a trigger's stand IS part of reading the AI card it pulled:
// the two stand together and leave together (`resolveGeneric`).
export const TABLE_HOLD = 2600
// Hallucination lingers twice as long — `AiCardsStory`'s own doubling.
export const HALLUCINATION_HOLD = TABLE_HOLD * 2

export function useToCentre() {
  const flyer = useFlyer()
  const { raise, pin } = flyer

  const toSlot = useCallback(
    async (args: {
      key: string
      card?: CardData
      /** …or the scene's own element, when the card travels as a pair */
      content?: ReactNode
      from: Rect
      to: Rect
      faceDown?: boolean
      /** its layer, when something else of the caller's is in the air (I9) */
      layer?: number
      /**
       * WHICH TRAVEL THIS IS. Out of a pile it is a draw, and `drawToCenter` is
       * the default because that is where this module started. Pulled off the
       * TABLE it is not a draw and says so by name.
       */
      motion?: 'drawToCenter' | 'playToCenter' | 'takeFromSeat'
      /**
       * THE POSE THE PLACE HOLDS IT AT, when that place holds a card at its own
       * angle rather than square. Given, the tilt travels WITH the card — it is
       * handed to the travel as `rotate`/`dx`/`dy` — and the card is then left
       * standing in it, which is the whole of I4 for a flight like this: `pin`
       * would cancel the filled animation and wipe the transform with it, so the
       * card would straighten the instant it arrived.
       */
      pose?: { rot: number; dx: number; dy: number }
    }): Promise<Rect | null> => {
      const { key, card, content, from, to, faceDown = true, motion = 'drawToCenter', pose } = args
      const mount = {
        key,
        at: from,
        faceDown,
        // `content === undefined`, not a truthiness test: a ReactNode may be a
        // promise in React 19's types, and a promise is always truthy
        ...(content === undefined ? { card } : { content }),
        ...(args.layer === undefined ? {} : { layer: args.layer }),
      }
      const [el] = await raise([mount])
      if (!el) return null
      const anim = play(motion, el, {
        from,
        to,
        ...(pose ? { rotate: pose.rot, dx: pose.dx, dy: pose.dy } : {}),
      })
      if (anim) await anim.finished
      // IT NOW *IS* THERE. Square arrivals are pinned — the carrier's own box
      // moves to the place, which is what every later leg measures from. A
      // tilted one is re-raised at the place carrying that tilt instead: raising
      // a live key replaces its flyer, so this is one commit — no flat frame and
      // nothing swapped on screen — and unlike `pin` it keeps the tilt.
      if (pose) await raise([{ ...mount, at: to, pose: restTransform(pose) }])
      else pin(key, to)
      return to
    },
    [raise, pin],
  )

  return { ...flyer, toSlot }
}
