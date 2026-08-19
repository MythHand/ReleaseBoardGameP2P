import { CardPair, cardById } from '@release/ui'
import type { Leaving, Rect } from '@release/ui/animations'
import { nextFrames, play, scatterAt, useDiscardExit, useFlyer, wait } from '@release/ui/animations'
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
  const latest = useRef({ anchors, staging, send })
  latest.current = { anchors, staging, send }

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
      // the actor's own answer is already standing where the cover goes —
      // nothing to move, hand the table back
      if (mine && handoff) handoff.release()
      await wait(SHOW_HOLD)

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
      if (items.length > 0) await latest.current.send(items)
      flyer.drop('cover')
    },
    [flyer.raise, flyer.drop],
  )

  // Task 15 fills this in — the steal's zone-to-zone flight.
  const runStolen = useCallback(
    async (_plan: Extract<BeatPlan, { kind: 'stolen' }>, _ctx: BeatRun) => {},
    [],
  )

  // A new match cancels what is in the air — same reason and same idiom as
  // every other runner: both carriers belong to the runner, not the queue.
  const reset = useCallback(() => {
    flyer.drop()
    resetExit()
  }, [flyer.drop, resetExit])

  return { overlay: [...exitOverlay, ...flyer.overlay], runCovered, runStolen, reset }
}
