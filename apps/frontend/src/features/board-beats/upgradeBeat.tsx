import { cardById } from '@release/ui'
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
import { type RefObject, useCallback, useRef } from 'react'
import type { BeatRun, BoardAnchors, StagedHandoff } from '~/entities/game/board'
import { upgradeSlot } from '~/entities/game/board/upgradeSlot'
import type { BeatPlan } from './planBeats'

const THROW_DUR = 460
const THROW_STEP = 260
const THROW_SCALE = 0.42
const HOLD_MS = 2500

const rectOf = (el: Element | null): Rect | null => {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

/** What the operation card standing at this centre hands over — `operationBeat`'s
 *  `handOver()`, so its card can leave WITH the row instead of on its own beat. */
type OperationHandOver = () => {
  items: Leaving[]
  takeOff: () => void
  settle: () => void
} | null

export function useUpgradeBeat(
  anchors: BoardAnchors,
  staging?: RefObject<StagedHandoff | null>,
  operationHandOver?: OperationHandOver,
) {
  const { overlay, raise, drop, pin, elOf } = useFlyer()
  const exit = useDiscardExit(anchors.discardBox)
  const taking = useRef<BeatRun | null>(null)
  const arrival = useHandArrival(anchors.hand, (gap, cards) => {
    const ctx = taking.current
    if (!ctx) return
    const hand = [...ctx.base.you.hand]
    hand.splice(gap, 0, ...cards.map((card) => ({ uid: card.key, card: card.card })))
    ctx.base = { ...ctx.base, you: { ...ctx.base.you, hand } }
    ctx.publish(ctx.base)
  })
  const latest = useRef({ anchors, staging, exit, arrival, operationHandOver })
  latest.current = { anchors, staging, exit, arrival, operationHandOver }

  // THE WHOLE CENTRE LEAVES IN ONE SEND. The System Upgrade card stands in the
  // same centre the answers do, so it goes to the discard WITH them rather than
  // on its own beat behind them (owner, 17.09) — the queue plays beats one after
  // another, so its own beat could only start once these had landed. Its halves
  // keep layers 0/1 and the answers stack above, which is the order the engine
  // discarded them in and therefore the order the heap already holds (I9).
  const emptyCentre = useCallback(async (items: Leaving[]) => {
    const op = latest.current.operationHandOver?.()
    const all = op ? [...op.items, ...items.map((it, i) => ({ ...it, layer: 2 + i }))] : items
    const sent = latest.current.exit.send(all)
    // the carriers are up in this commit; the resting card goes down in it too
    op?.takeOff()
    await sent
    op?.settle()
  }, [])

  const run = useCallback(
    async (plan: Extract<BeatPlan, { kind: 'upgrade' }>, beat: BeatRun) => {
      const a = latest.current.anchors
      if (plan.take) {
        const take = plan.take
        const pending = beat.base.pending
        if (pending?.kind !== 'systemUpgrade') return
        await nextFrames()
        const from = rectOf(upgradeSlot(a, take.fromPlayer))
        const centre = rectOf(a.centre.current)
        const card = cardById(take.card)
        if (!from || !centre || !card) return
        const key = `upgrade-take:${take.uid}`
        const raised = raise([{ key, card, at: from }])
        // Reserve the departing card's cell, keeping the rest of the row fixed.
        const ctx = {
          ...beat,
          base: {
            ...beat.base,
            pending: {
              ...pending,
              thrown: pending.thrown.filter((t) => t.card.uid !== take.uid),
              owed: [...pending.owed, take.fromPlayer],
            },
          },
        }
        taking.current = ctx
        beat.publish(ctx.base)
        const [el] = await raised
        if (el) await play('playToCenter', el, { from, to: centre, duration: THROW_DUR })?.finished
        pin(key, centre)
        const clear = async () => {
          const items = (plan.clear ?? []).flatMap((t) => {
            const restCard = cardById(t.card)
            const node = upgradeSlot(a, t.player)
            return restCard && node
              ? [
                  {
                    key: `upgrade-exit:${t.eventId}`,
                    card: restCard,
                    node,
                    scatter: scatterAt(t.eventId),
                  },
                ]
              : []
          })
          await emptyCentre(items)
        }
        const receive = async () => {
          await wait(560)
          const chosen = elOf(key)
          if (take.player === beat.base.selfId) {
            await latest.current.arrival.arrive(
              [{ key: take.uid, card, el: chosen, from: centre }],
              ctx.base.you.hand.length,
            )
          } else {
            const seat = a.seatBox(take.player)
            if (chosen && seat)
              await play('dealToSeat', chosen, { from: centre, to: seat, scale: 0.7 })?.finished
            ctx.base = {
              ...ctx.base,
              opponents: ctx.base.opponents.map((p) =>
                p.id === take.player ? { ...p, handCount: p.handCount + 1 } : p,
              ),
            }
          }
          drop(key)
        }
        await Promise.all([clear(), receive()])
        beat.publish({ ...ctx.base, pending: null, decks: beat.after?.decks ?? ctx.base.decks })
        taking.current = null
        return
      }
      const local = latest.current.staging?.current
      let adopted = false
      // The queue's pre-arrival shadow must paint its row before measuring.
      await nextFrames()
      await Promise.all(
        plan.throws.map(async (t, i) => {
          if (t.player === beat.base.selfId && local) {
            adopted = true
            return
          }
          await wait(i * THROW_STEP)
          const target = rectOf(upgradeSlot(a, t.player))
          const seat = a.seatBox(t.player)
          const card = cardById(t.card)
          if (!target || !seat || !card) return
          const from = {
            left: seat.left + (seat.width - target.width * THROW_SCALE) / 2,
            top: seat.top + (seat.height - target.height * THROW_SCALE) / 2,
            width: target.width * THROW_SCALE,
            height: target.height * THROW_SCALE,
          }
          const [el] = await raise([{ key: `upgrade:${t.eventId}`, card, at: from }])
          if (el)
            await play('playToCenter', el, { from, to: target, duration: THROW_DUR })?.finished
        }),
      )
      const pending = beat.base.pending
      if (pending?.kind !== 'systemUpgrade') {
        drop()
        if (adopted) local?.release()
        return
      }
      const afterPending = beat.after?.pending
      const thrown = [...pending.thrown]
      for (const t of plan.throws) {
        if (thrown.some((entry) => entry.player === t.player)) continue
        const actual =
          afterPending?.kind === 'systemUpgrade'
            ? afterPending.thrown.find((entry) => entry.player === t.player)
            : undefined
        // Final base answers have no pending in the engine's resulting state.
        // Their event identity is only a visual key; it is never submitted.
        thrown.push(
          actual ?? { player: t.player, card: { id: t.card, uid: `upgrade:${t.eventId}` } },
        )
      }
      const answered = new Set(plan.throws.map((t) => t.player))
      const own = plan.throws.find((t) => t.player === beat.base.selfId)
      const ownUid =
        own && (local?.mainUid ?? beat.base.you.hand.find((c) => c.card.id === own.card)?.uid)
      const landed = {
        ...beat.base,
        you: { ...beat.base.you, hand: beat.base.you.hand.filter((c) => c.uid !== ownUid) },
        opponents: beat.base.opponents.map((p) =>
          answered.has(p.id) ? { ...p, handCount: Math.max(0, p.handCount - 1) } : p,
        ),
        pending: { ...pending, owed: pending.owed.filter((id) => !answered.has(id)), thrown },
      }
      // Publish and release together: until this commit the carriers own the
      // row, afterwards the public pending owns exactly the same slots.
      beat.publish(landed)
      drop()
      if (adopted) local?.release()
      if (!plan.clear) return
      await nextFrames()
      await wait(HOLD_MS)
      // THE CENTRE EMPTIES IN ONE GO. No per-card delay: the step's own rule is
      // that cards leave for the discard one by one but ALL AT ONCE, and it is
      // the simultaneity that reads as "the centre went to the discard". Sent
      // one after another they read as several separate discards (owner, 17.09).
      const items = plan.clear.flatMap((t) => {
        const card = cardById(t.card)
        const node = upgradeSlot(a, t.player)
        return card && node
          ? [
              {
                key: `upgrade-exit:${t.eventId}`,
                card,
                node,
                scatter: scatterAt(t.eventId),
              },
            ]
          : []
      })
      // The shared exit takes over the measured nodes before pending clears.
      await emptyCentre(items)
      beat.publish({ ...landed, pending: null, decks: beat.after?.decks ?? landed.decks })
    },
    [raise, drop, pin, elOf, emptyCentre],
  )

  return {
    overlay: [...overlay, ...exit.overlay, ...arrival.overlay],
    run,
    gapAt: arrival.gapAt,
    gapSize: arrival.gapSize,
  }
}
