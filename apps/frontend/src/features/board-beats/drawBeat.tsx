import type { CardData } from '@release/ui'
import { cardAreaOf, cardById } from '@release/ui'
import type { Rect } from '@release/ui/animations'
import { nextFrames, play, scatterAt, useDiscardExit, wait } from '@release/ui/animations'
import { useCallback, useRef } from 'react'
import type { BeatRun, BoardAnchors, BoardState } from '~/entities/game/board'
import type { BeatPlan, PlannedDraw } from './planBeats'
import { seatCardBox } from './seat'
import { TABLE_HOLD, useToCentre } from './toCentre'
import { useToHand } from './toHand'

// A card is drawn. One flight to the centre, then a branch on who drew it and
// what it turned out to be — the scene is `DrawCardStory`, driven here by the
// events instead of by a click on a deck.
//
// The trigger's WHOLE life is in this beat, reveal to discard. The engine files
// it in the same batch (fake/triggers.ts:123,139), so a card left standing at
// the centre would contradict a projection that has already put it in the heap.
// It never touches a hand or a zone, so it leaves from where it stands: the
// flyer stays pinned at the centre (I4) and the shared exit step takes it from
// there.

const BEFORE_FLIP = 220 // the card rests at the centre before it turns over
const AFTER_FLIP = 560 // flipCard is 420; the rest is a pause to read it by

// An opponent's closed card. The projection never says what it is, so nothing
// here may guess: this carries no face, only the base deck's cover, and it is
// always flown faceDown. Card reads `deck` for the back and nothing else.
const COVER: CardData = {
  id: 'unknown',
  name: '',
  category: 'protection',
  deck: 'base',
  art: '',
  tags: [],
  qty: 0,
}

const rectOf = (el: Element | null): Rect | null => {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

export function useDrawBeat(
  anchors: BoardAnchors,
  /**
   * The fan's own order, for the card this beat lands in it — the same seam the
   * System Upgrade, Cherry-pick and transfer arrivals go through. A drawn card
   * has no place of its own, so it lands in the middle; committing the slot is
   * what keeps the next projection from moving it to the end.
   */
  onHandArrival?: (hand: { uid: string; card: CardData }[], uid: string, at: number) => void,
) {
  const { overlay: flyerOverlay, patch, drop, elOf, toSlot } = useToCentre()
  const exit = useDiscardExit(anchors.discardBox)

  // The run's own state, held in a ref because the whole beat is one closure and
  // the fan grows inside it (I8). Reading the board's props here instead would
  // give every card after the first the fan the batch STARTED with.
  const ctx = useRef<BeatRun | null>(null)

  // The card into the fan, whole: the uid the projection will know it by, the
  // middle of the fan, the slot committed, and the run's own base grown so the
  // next card of the batch aims at the fan this one made (I8).
  const {
    overlay: handOverlay,
    gapAt,
    gapSize,
    land,
    reset: resetArrival,
  } = useToHand(anchors.hand, onHandArrival)

  const latest = useRef({ anchors, land, exit })
  latest.current = { anchors, land, exit }

  // deck -> centre, face down. The one leg every draw has, whoever drew it.
  const toCentre = useCallback(
    (d: PlannedDraw): Promise<Rect | null> => {
      const a = latest.current.anchors
      const cell = rectOf(a.pileBox(d.pile))
      const centre = rectOf(a.centre.current)
      if (!cell || !centre) return Promise.resolve(null)
      const face = d.card ?? d.reveal?.card
      const card = (face ? cardById(face) : null) ?? COVER
      return toSlot({ key: 'draw', card, from: cardAreaOf(cell), to: centre })
    },
    [toSlot],
  )

  const run = useCallback(
    async (plan: Extract<BeatPlan, { kind: 'draw' }>, beat: BeatRun) => {
      ctx.current = beat
      for (const d of plan.draws) {
        const centre = await toCentre(d)
        if (!centre) continue

        if (d.reveal) {
          // A trigger is turned up for the whole table and stands there.
          await wait(BEFORE_FLIP)
          patch('draw', { faceDown: false })
          await wait(AFTER_FLIP)
          const card = cardById(d.reveal.card)
          if (card && d.reveal.discardId !== undefined) {
            await wait(TABLE_HOLD)
            // It leaves from the centre on the same scatter the heap already
            // rests it on (I7) — the flyer IS the card, so the step flies the
            // node rather than mounting a copy of it.
            await latest.current.exit.send(
              [
                {
                  key: `d${d.reveal.discardId}`,
                  card,
                  node: elOf('draw'),
                  scatter: scatterAt(d.reveal.discardId),
                },
              ],
              // nothing stands: the flyer IS the card, handed over as `node`,
              // so the step flies that very node and there is no copy to hide
              null,
            )
            drop('draw')
            continue
          }
          // IT STANDS. An unanswered Error 503 is held on its pending until a
          // method is chosen, so there is nothing to fly — the board's static
          // alarm render takes the slot instead. Publish first, drop second:
          // the board renders this beat's shadow while it runs
          // (_Board.tsx's `deal.shadow ?? beats.shadow ?? live`), so the
          // render is up before the carrier lets go and the slot is never
          // blank for a frame — the same handoff ordering the cover slot uses.
          //
          // `methods: []` because the beat CANNOT know them: they live on the
          // projection, and this runs against `base`. Empty is the honest
          // value and a safe one — it offers no answer, so the staging hook
          // stays inert, and the queue drains onto the live pending on the
          // next tick (a raised pending ends the batch; fireTrigger returns
          // there). A shadow of the projection for a frame, not a claim about
          // the game.
          const c = ctx.current
          if (c) {
            const next = {
              ...c.base,
              pending: {
                kind: 'neutralize503' as const,
                player: d.player,
                card: d.reveal.card,
                methods: [],
              },
            }
            c.base = next
            c.publish(next)
          }
          await nextFrames() // the publish above has committed (I2)
          drop('draw')
          continue
        }

        if (d.mine && d.card) {
          await wait(BEFORE_FLIP)
          patch('draw', { faceDown: false })
          await wait(AFTER_FLIP)
          const card = cardById(d.card)
          const at = rectOf(elOf('draw'))
          drop('draw')
          // The run is what the landing is measured against — the fan it has
          // already grown, not the projection the batch started with (I8).
          const c = ctx.current
          if (card && at && c)
            await latest.current.land(c, { card, from: at, fallbackKey: `h${d.eventId}` })
          continue
        }

        // Somebody else's, and closed. It flies to their seat as a back and
        // dissolves into the counter — a closed card has no identity in the
        // projection, so it never turns over.
        const seat = latest.current.anchors.seatBox(d.player)
        const el = elOf('draw')
        if (el && seat) {
          // `seatBox` already trims the seat to a card box (I6); this is a
          // second, smaller trim — down to `SEAT_SHRINK` of a card width — not
          // a duplicate of the first.
          const to = seatCardBox(seat)
          const anim = play('dealToSeat', el, { from: centre, to })
          if (anim) await anim.finished
        }
        drop('draw')
        const c = ctx.current
        if (c) {
          const next: BoardState = {
            ...c.base,
            opponents: c.base.opponents.map((o) =>
              o.id === d.player ? { ...o, handCount: o.handCount + 1 } : o,
            ),
          }
          c.base = next
          c.publish(next)
        }
      }
      ctx.current = null
    },
    [toCentre, patch, drop, elOf],
  )

  // A new match cancels what is in the air: every carrier this beat can leave
  // mid-flight, dropped. `drop()` with no key takes down every flyer this run
  // raised (the centre card, a closed card on its way to a seat); the arrival
  // and the exit are the SAME shared steps `discardBeat` resets for the same
  // reason, reached through here because a draw can end in either of them (a
  // trigger leaves through `exit`, a card of the drawer's own through
  // `arrive`).
  const reset = useCallback(() => {
    drop()
    resetArrival()
    exit.reset()
  }, [drop, resetArrival, exit])

  return { overlay: [...flyerOverlay, ...handOverlay, ...exit.overlay], gapAt, gapSize, run, reset }
}
