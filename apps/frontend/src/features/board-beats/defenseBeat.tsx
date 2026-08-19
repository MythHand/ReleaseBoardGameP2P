import { Card, CardPair, cardById } from '@release/ui'
import type { Leaving, Rect } from '@release/ui/animations'
import {
  nextFrames,
  play,
  scatterAt,
  useDiscardExit,
  useFlyer,
  useHandArrival,
  wait,
} from '@release/ui/animations'
import type { RefObject } from 'react'
import { useCallback, useRef } from 'react'
import type { BeatRun, BoardAnchors, StagedHandoff } from '~/entities/game/board'
import { ATTACK_POSE, COVER_POSE, SHOW_HOLD } from '~/entities/game/board'
import type { BeatPlan } from './planBeats'

// The answer to an attack (#101): a defence covers what is standing at the
// centre, and the whole exchange leaves together. `_useDefenseStaging.ts` is
// the OTHER half — the gesture that stands the local player's own answer there
// before the engine has spoken; the two meet at `StagedHandoff`, exactly as
// the combo pair's two halves do.

// same 5-line helper comboBeat.tsx keeps privately — copy it, don't import
// across runners
const rectOf = (el: Element | null): Rect | null => {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

export function useDefenseBeat(anchors: BoardAnchors, staging?: RefObject<StagedHandoff | null>) {
  const { overlay: exitOverlay, send, reset: resetExit } = useDiscardExit(anchors.discardBox)
  const flyer = useFlyer()
  // ROLLBACK's own destination, when the returned attack lands in the local
  // player's fan rather than an opponent's seat. No `onLanded` work to do:
  // unlike a draw (drawBeat.tsx), the engine already put the card into the
  // hand by mutating state (see the comment at `returning` below), so the
  // NEXT projection already carries it — this beat only has to fly it there.
  const arrival = useHandArrival(anchors.hand, () => {})
  const latest = useRef({ anchors, staging, send, arrival })
  latest.current = { anchors, staging, send, arrival }

  const runCovered = useCallback(
    async (plan: Extract<BeatPlan, { kind: 'covered' }>, ctx: BeatRun) => {
      // read BEFORE the first await, same race and same fix as comboBeat's own
      // handoff read: the staging hook's hand-watching effect clears `staged`
      // on this very prop update, and reading it later loses it
      const handoff = latest.current.staging?.current
      const mine = plan.defender === ctx.base.selfId
      await nextFrames() // the shadow that renders `before` has committed (I2)
      const a = latest.current.anchors
      const coverBox = rectOf(a.cover.current)
      const defence = cardById(plan.card)
      const ownSudo = plan.sudo ? cardById(plan.sudo) : null

      // THE COVER — the defence lies over the attack, offset and tilted the
      // other way, so the two read as two plays and not one tidy stack.
      if (coverBox && defence && !(mine && handoff?.el)) {
        const from = a.seatBox(plan.defender)
        if (from) {
          const [el] = await flyer.raise([
            {
              key: 'cover',
              at: from,
              content: ownSudo ? <CardPair main={defence} aux={ownSudo} width="100%" /> : undefined,
              card: ownSudo ? undefined : defence,
            },
          ])
          if (el) {
            await play('playToCenter', el, {
              from,
              to: coverBox,
              rotate: COVER_POSE.rot,
              dx: COVER_POSE.dx,
              dy: COVER_POSE.dy,
            })?.finished
          }
        }
      }
      await wait(SHOW_HOLD)

      // the actor's own answer was already standing where the cover goes —
      // nothing to move, hand the table back. Released HERE, immediately
      // ahead of the exit rather than before the hold above (Fix round 1,
      // Important 2): `release()` clears the local defender's own static
      // cover render at once, and `_useDefenseStaging.ts`'s `landed` gate has
      // nothing else backing that slot — releasing before the hold left it
      // blank for the whole ~1.2s span. The same "drop right before the
      // replacement takes over" ordering `comboBeat.tsx`'s own `runRelease`
      // cost leg already uses for the identical class of bug.
      if (mine && handoff) handoff.release()

      // THE EXIT — one exchange, one send. Each card carries its layer, so the
      // heap keeps the order they lay in on the table (I9), and each lands on
      // its own `discarded` event's scatter (I7).
      const attackBox = rectOf(a.centre.current)
      const items: Leaving[] = []
      // by reason as well as card: `support-sudo` can be banked on both sides
      // of one exchange, and only the reason says whose it was
      const spentOf = (card: string, reason: 'attackSpent' | 'defenceSpent') =>
        plan.spent.find((s) => s.card === card && s.reason === reason)
      const attackSpent = spentOf(plan.attackCard, 'attackSpent')
      const attackAux = plan.attackSudo ? spentOf('support-sudo', 'attackSpent') : undefined
      const attackCard = cardById(plan.attackCard)
      if (attackSpent && attackBox && attackCard) {
        items.push({
          key: `x${attackSpent.eventId}`,
          card: attackCard,
          aux: plan.attackSudo ? cardById('support-sudo') : null,
          el: a.centre.current,
          from: attackBox,
          pose: ATTACK_POSE,
          layer: 0,
          scatter: scatterAt(attackSpent.eventId),
          ...(attackAux ? { auxScatter: scatterAt(attackAux.eventId) } : {}),
        })
      }
      const defenceSpent = spentOf(plan.card, 'defenceSpent')
      if (defenceSpent && coverBox && defence) {
        const defenceAux = ownSudo ? spentOf('support-sudo', 'defenceSpent') : undefined
        items.push({
          key: `x${defenceSpent.eventId}`,
          card: defence,
          aux: ownSudo,
          el: a.cover.current,
          from: coverBox,
          pose: COVER_POSE,
          layer: 1,
          scatter: scatterAt(defenceSpent.eventId),
          ...(defenceAux ? { auxScatter: scatterAt(defenceAux.eventId) } : {}),
        })
      }
      // ROLLBACK — the attack is not burned, it is sent back. The engine puts
      // it into a hand by mutating state and emits NOTHING for it
      // (attacks.ts:245-252), so `returnTo` is derived rather than read; the
      // gap and what would close it are in docs/animations/backlog.md.
      const returning =
        plan.effect === 'return' && plan.returnTo && attackBox && attackCard
          ? (async () => {
              if (plan.returnTo === ctx.base.selfId) {
                // into our own fan, through the shared insert every other
                // "card settles into the hand" motion uses. No index: the gap
                // opens in the middle of the fan. Awaited for real (not a
                // fixed `wait(FLIGHT_MS)` run alongside it): `arrive()` spends
                // a couple of frames on `nextFrames()` before its own timer
                // even starts, so a parallel clock of the same length resolves
                // early — invisible for a single Rollback (the overlay stays
                // mounted until the hook's own reset), but a second `arrive()`
                // landing in that window would hit `flights.length > 0` and
                // silently no-op.
                await latest.current.arrival.arrive(
                  [{ key: `back${plan.eventId}`, card: attackCard, from: attackBox }],
                  ctx.base.you.hand.length,
                )
                return
              }
              // `anchors.seatBox` resolves null for the LOCAL player — never
              // reached here, since that case took the fan branch above.
              const to = a.seatBox(plan.returnTo as string)
              if (!to) return
              const [el] = await flyer.raise([{ key: 'back', at: attackBox, card: attackCard }])
              if (el) await play('playToCenter', el, { from: attackBox, to })?.finished
              flyer.drop('back')
            })()
          : undefined

      // Together, not in sequence: the exchange leaving for the discard and
      // the attack leaving for its hand are one moment, not two gestures.
      await Promise.all([items.length > 0 ? latest.current.send(items) : undefined, returning])
      flyer.drop('cover')
    },
    [flyer.raise, flyer.drop],
  )

  // Security Bug (#101, Task 15): the release the attack beat is not burned —
  // it crosses from the victim's zone into the thief's. It is entering an
  // OPPONENT's zone, where a release is read as LOD (at a glance, not in
  // full) — so it morphs on the way instead of being swapped on landing. The
  // morph is not a preset: it is a content swap on the flyer, one frame after
  // it mounts (`raise`'s own `nextFrames()`, I2), and the face's own layers
  // ease to their LOD values over the CSS transitions already on them while
  // the flight carries the card across (`ComposedFace`'s own coupling).
  const runStolen = useCallback(
    async (plan: Extract<BeatPlan, { kind: 'stolen' }>, ctx: BeatRun) => {
      await nextFrames() // the shadow that renders `before` has committed (I2)
      const a = latest.current.anchors
      // `from` is the victim's slot as it stood BEFORE this batch (I1 — the
      // beat runs against `base`, and the shadow still renders it); `to` is
      // the thief's, which the live projection has already created. Both
      // resolve for every seat, including our own (`_Board.tsx` binds a
      // release slot for the local player too, unlike `seatBox`).
      const from = rectOf(a.releaseSlot(plan.from, plan.slot))
      const to = rectOf(a.releaseSlot(plan.to, plan.slot))
      const card = cardById(plan.card)
      if (!from || !to || !card) return // nothing measurable: the projection resolves it
      const [el] = await flyer.raise([
        { key: 'steal', at: from, content: <Card card={card} interactive={false} width="100%" /> },
      ])
      if (!el) return
      // A release stolen INTO OUR OWN zone (the reflected case, and any
      // future one) is read in full, not as LOD — only a crossing into an
      // OPPONENT's zone gets the at-a-glance reading. The flip happens on
      // the same frame the travel starts, so nothing is swapped on arrival.
      if (plan.to !== ctx.base.selfId) {
        flyer.patch('steal', {
          content: <Card card={card} interactive={false} width="100%" lod />,
        })
      }
      await play('playToCenter', el, { from, to })?.finished
      flyer.drop('steal')
    },
    [flyer.raise, flyer.patch, flyer.drop],
  )

  // A new match cancels what is in the air — same reason and same idiom as
  // every other runner: both carriers belong to the runner, not the queue.
  const reset = useCallback(() => {
    flyer.drop()
    resetExit()
    arrival.reset()
  }, [flyer.drop, resetExit, arrival.reset])

  return {
    overlay: [...exitOverlay, ...flyer.overlay, ...arrival.overlay],
    runCovered,
    runStolen,
    reset,
  }
}
