import { CardPair, cardById, PAIR_AUX_POSE } from '@release/ui'
import type { Leaving, Rect } from '@release/ui/animations'
import {
  enterPose,
  nextFrames,
  play,
  scatterAt,
  useDiscardExit,
  useFlyer,
  wait,
} from '@release/ui/animations'
import type { RefObject } from 'react'
import { useCallback, useRef } from 'react'
import {
  type BeatRun,
  type BoardAnchors,
  SHOW_HOLD,
  type StagedHandoff,
} from '~/entities/game/board'
import type { BeatPlan } from './planBeats'

// The event-driven half of the combo pair (#100): an `attacked`/`released`
// reaching the table, and the pending pair splitting back out to the discard
// once it resolves. `_useBoardStaging.ts` is the OTHER half — the gesture that
// stands a pull-and-fold at the centre before the engine ever answers. The two
// meet at `StagedHandoff` (entities/game/board/types.ts): when the actor's own
// play is the one arriving, the staged node is already standing exactly where
// this beat would fold one in, so there is nothing to move — the beat just
// hands the table back.

// same 5-line helper discardBeat.tsx keeps privately — copy it, don't import
// across runners
const rectOf = (el: Element | null): Rect | null => {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

export function useComboBeat(
  anchors: BoardAnchors,
  staging?: RefObject<StagedHandoff | null>,
  // The staging → beat seam, reused for a second fact (#101, Task 11): a
  // stable ref to `_useBoardStaging.ts`'s own `clearPaidCost`, kept current by
  // `_Board.tsx` the same way `staging` above is — a ref because its IDENTITY
  // is all this hook needs at construction time (`_Board.tsx` builds it before
  // `useBoardStaging` even runs), and a ref rather than folding it INTO
  // `StagedHandoff` because the two clear different state on different
  // lifecycles: `StagedHandoff` goes null the instant a dispatch's own staged
  // node is spoken for (often well before the cost is even paid), while
  // `paidCost` outlives that and needs its own, independently-timed clear.
  clearPaidCost?: RefObject<(() => void) | null>,
  // The same seam's THIRD fact (#101, Fix A): `_useBoardStaging.ts`'s own
  // `takeStagedRelease`, which hides the static stage-slot render of a
  // standing release. Its own ref rather than a ride on `clearPaidCost`
  // because the two fire ~SHOW_HOLD apart and for different cards — the cost
  // leaves first, the release itself last.
  takeStagedRelease?: RefObject<(() => void) | null>,
) {
  const { overlay: exitOverlay, send, reset: resetExit } = useDiscardExit(anchors.discardBox)
  const flyer = useFlyer()
  const latest = useRef({ anchors, staging, send, clearPaidCost, takeStagedRelease })
  latest.current = { anchors, staging, send, clearPaidCost, takeStagedRelease }

  // The full fold: raise a carrier at the centre, paint both halves standing
  // at the source, fold them into the pair's pose. The aux is the same
  // movement with PAIR_AUX_POSE as its rest — no branch, the degenerate case
  // (a lone card, no aux) is built in. Returns the carrier element still HELD
  // — the caller decides whether the pair stays (attack → drop, the pending
  // render is underneath) or flies on (release → playToReleaseZone first).
  const foldIn = useCallback(
    async (
      actor: string,
      cardId: string,
      auxId: string | undefined,
      ctx: BeatRun,
    ): Promise<HTMLElement | null> => {
      const a = latest.current.anchors
      const cRect = rectOf(a.centre.current)
      const main = cardById(cardId)
      const aux = auxId ? cardById(auxId) : null
      if (!cRect || !main) return null
      const mine = actor === ctx.base.selfId
      // By id, first match — two copies of one card in hand fold from the
      // FIRST slot (the same simplification `sourceOf` makes). Invisible on
      // screen; noted so it is not rediscovered as a bug.
      const handIndex = mine ? ctx.base.you.hand.findIndex((h) => h.card.id === cardId) : -1
      const fromRect =
        (mine && handIndex >= 0 ? rectOf(a.handSlotAt(handIndex)) : null) ?? a.seatBox(actor)
      if (!fromRect) return null
      const [el] = await flyer.raise([
        aux
          ? { key: 'fold', at: cRect, content: <CardPair main={main} aux={aux} width="100%" /> }
          : { key: 'fold', at: cRect, card: main },
      ])
      if (!el) return null
      for (const anim of el.getAnimations?.({ subtree: true }) ?? []) anim.cancel() // I3
      const mainEl = aux ? el.querySelector<HTMLElement>('[data-main]') : el
      const auxEl = aux ? el.querySelector<HTMLElement>('[data-aux]') : null
      if (mainEl) mainEl.style.transform = enterPose(fromRect, cRect)
      if (auxEl) auxEl.style.transform = enterPose(fromRect, cRect)
      await nextFrames() // the painted frame at the source (I2)
      const flights = [
        mainEl ? play('foldIntoPair', mainEl, { from: fromRect, box: cRect, dur: 620 }) : null,
        auxEl
          ? play('foldIntoPair', auxEl, {
              from: fromRect,
              box: cRect,
              pose: PAIR_AUX_POSE,
              dur: 620,
              snap: true,
            })
          : null,
      ]
      await Promise.all(flights.map((f) => f?.finished))
      return el
    },
    [flyer.raise],
  )

  // attackPlaced: the play reaches the centre. Local staging → it is ALREADY
  // there: adopt and release. No staging → fold/fly in from where it came.
  //
  // The handoff is read HERE, synchronously, before the first `await` — not
  // after `nextFrames()` as the fold that follows needs it (I2). `useBeats`'s
  // watching effect and `_useBoardStaging.ts`'s own hand-watching effect both
  // react to the SAME prop update (the batch that carries this event also
  // updates `live`, per `useBeats.ts`'s own "I1" note), and on the very FIRST
  // render of that update `beats.shadow` is still null — so `state` is
  // briefly `live` (the card ALREADY out of the hand) before this beat's own
  // `running` state exists to pin it back to `before`. `_useBoardStaging`'s
  // effect sees that empty hand and clears `staged` (believing the play was
  // simply accepted, its usual case) — a passive effect, so it can only fire
  // once this synchronous render burst is done. Reading the handoff HERE,
  // still inside that same synchronous burst (`drain()` calls this beat
  // before yielding), wins the race: the value is captured before the clear
  // ever has a chance to happen. Reading it one line later, after
  // `nextFrames()`, loses it — the clear beats the read, `handoff` comes back
  // null, and the actor's own play gets folded in a second time from a hand
  // slot it already left. (found empirically: apps/frontend/src/pages/board/
  // [gameId]/__tests__/comboHandoff.test.tsx pins this.)
  const runAttack = useCallback(
    async (plan: Extract<BeatPlan, { kind: 'attackPlaced' }>, ctx: BeatRun) => {
      const { staging: s } = latest.current
      const handoff = s?.current
      // Adopted without comparing cards, and structurally so: the event names
      // a card ID, the handoff holds a UID, and nothing can translate between
      // them here — the adoption leans instead on `handoffRef` being non-null
      // only while a dispatched play stands, so nothing stale is adoptable.
      if (handoff?.mainUid && plan.attacker === ctx.base.selfId) {
        // the actor's own play: the staged node stands exactly where the
        // pending render takes over — nothing to move, hand the table back
        handoff.release()
        return
      }
      await nextFrames() // the shadow that renders `before` has committed (I2)
      // everyone else (and a local click-thrown window attack, which staged
      // nothing): the halves fold in from the actor's side — seat for an
      // opponent, the hand slot the card left for the local thrower (found by
      // id, as sourceOf does)
      const el = await foldIn(plan.attacker, plan.card, plan.sudo ? 'support-sudo' : undefined, ctx)
      if (el) flyer.drop('fold') // the centre pending render takes over (last frame = projection)
    },
    [foldIn, flyer.drop],
  )

  // releasePlaced: the pair flies into the owner's slot; the zone's static
  // support render (Task 9) is the landing pose. The handoff is captured
  // BEFORE `nextFrames()` — same race, same fix, as `runAttack` above; only
  // the CAPTURE has to happen early, since `handoff` here is a local holding
  // the object reference, not a second read of the ref.
  //
  // THE COST leg (#101, Task 11) sits right after that capture, ahead of
  // `nextFrames()` and everything that follows — not, as an earlier draft of
  // this had it, ahead of the capture itself. `handoff` must be read
  // synchronously, before this beat's first `await`, to win the exact race
  // the comment above describes; the cost leg below holds for real spans (up
  // to `SHOW_HOLD`, ~1.2s) across several `await`s of its own; a combo
  // release ALSO carries a cost (the rules charge one regardless of a Code
  // Review combo), so for that path `handoff` would already have been raced
  // away by the time those awaits let go, and the actor's own standing pair
  // would blink out from under `foldIn`'s own re-entry. Capturing first and
  // spending the cost leg's time AFTER keeps the exact same protection this
  // function already had.
  const runRelease = useCallback(
    async (plan: Extract<BeatPlan, { kind: 'releasePlaced' }>, ctx: BeatRun) => {
      const { staging: s } = latest.current
      const handoff = s?.current

      // THE COST — by the rules a release costs one card, and the cost is
      // shown to the table in the open before it goes. The actor's own is
      // already standing at the cost slot (the staging gesture put it there
      // and left it, Task 8) — for everyone else it arrives from the seat
      // now, holds, and then leaves. Either way it leaves through the shared
      // discard exit, on its own `discarded` event's scatter (I7).
      if (plan.cost) {
        const a = latest.current.anchors
        const costBox = rectOf(a.cost.current)
        const costCard = cardById(plan.cost.card)
        if (costBox && costCard) {
          if (plan.player !== ctx.base.selfId) {
            const from = a.seatBox(plan.player)
            if (from) {
              const [el] = await flyer.raise([{ key: 'cost', at: from, card: costCard }])
              if (el) await play('playToCenter', el, { from, to: costBox })?.finished
            }
          }
          await wait(SHOW_HOLD)
          // Whatever was standing at the cost slot — the actor's static
          // `paidCost` render, or (a remote player) this beat's own 'cost'
          // flyer, motionless at `costBox` since its own `playToCenter`
          // landed — and this exit's own flyer swap in the SAME commit:
          // `clearPaidCost`, `drop('cost')` and `send`'s own `setFlights`
          // (useDiscardExit.tsx) all run before any of them awaits anything,
          // so React batches them into one render. Order matters for the
          // remote path specifically — dropping the 'cost' flyer AFTER
          // `send()` resolves would leave a stationary, identical copy of the
          // card sitting at the slot for the whole ~420ms `centerToDiscard`
          // flight, doubled against the one actually travelling to the
          // discard. Each call is a no-op for the path that does not apply —
          // `clearPaidCost` for a remote player's cost, `drop('cost')` for
          // the actor's (nothing was ever raised under that key).
          latest.current.clearPaidCost?.current?.()
          flyer.drop('cost')
          await latest.current.send([
            {
              key: `c${plan.cost.eventId}`,
              card: costCard,
              from: costBox,
              scatter: scatterAt(plan.cost.eventId),
            },
          ])
        }
      }

      await nextFrames()
      const { anchors: a } = latest.current
      const cRect = rectOf(a.centre.current)
      const toRect = rectOf(a.releaseSlot(plan.player, plan.slot))
      // `releaseSlot` resolves for EVERY seat, our own included (`_Board.tsx`
      // binds one through `ReleaseZone`'s fixed SLOTS array, occupied or not)
      // — unlike `seatBox`, which is null for the local player. Nothing
      // measurable here means the projection resolves it unaided.
      if (!toRect) {
        handoff?.release()
        return
      }
      if (handoff && plan.player === ctx.base.selfId && handoff.el && cRect) {
        // the actor's staged PAIR is at the centre: fly THAT node to the slot.
        // Only a merged pair ever gets here — `_Board.tsx`'s `soloStaged`
        // excludes a release on purpose, so `handoff.el` is null for a plain
        // one (see below).
        await play('playToReleaseZone', handoff.el, { from: cRect, to: toRect })?.finished
        handoff.release()
        return
      }
      // THE ACTOR'S OWN PLAIN RELEASE — it is already standing at the STAGE
      // slot, where `_useBoardStaging.ts` flew it when it was pulled and where
      // it waited out its own cost. There is nothing to fold: measure that
      // slot and carry it home from there.
      //
      // Not through the handoff, and deliberately so. A plain release never
      // merges, so it never gets the pair flyer's persistent node, and
      // `soloStaged` excludes a release from the centre render on purpose (it
      // belongs at the stage slot, and `stagedRelease` puts it there off the
      // projection's own pending) — so `handoff.el` is null for it even before
      // the catch-up effect clears the handoff outright when that pending
      // echoes back. The handoff is simply the wrong mechanism here; the stage
      // slot's rect is what this needs, and `anchors.stage` gives it directly.
      //
      // `foldIn` is wrong for it too, which is what this replaces: the release
      // is still in `you.hand` during the pending (the engine's release path
      // emits nothing and touches no hand) but the fan does NOT render it, so
      // a hand-index lookup aims at another card's slot — or, when the release
      // was last in hand, at no slot at all, and `seatBox` is null for us.
      const stageRect =
        plan.player === ctx.base.selfId && !plan.codeReview ? rectOf(a.stage.current) : null
      const standing = cardById(plan.card)
      if (stageRect && standing) {
        // The static render is let go in the SAME commit the carrier goes up:
        // `takeStagedRelease` and `raise`'s own `setHeld` both run before
        // `raise` awaits anything, so React batches them into one render and
        // the card is never on screen twice — nor missing for a frame. The
        // approved scene's own `setStaged(null)` + `raise` idiom, and the same
        // one the cost leg above already uses for `clearPaidCost`.
        latest.current.takeStagedRelease?.current?.()
        const [el] = await flyer.raise([{ key: 'release', at: stageRect, card: standing }])
        if (el) await play('playToReleaseZone', el, { from: stageRect, to: toRect })?.finished
        // dropped as the beat ends, so the carrier and the projection's own
        // zone render swap in one commit (`useBeats`'s drain does the rest of
        // that batch synchronously)
        flyer.drop('release')
        return
      }
      if (!cRect) {
        handoff?.release()
        return
      }
      const el = await foldIn(plan.player, plan.card, plan.codeReview, ctx)
      if (el) await play('playToReleaseZone', el, { from: cRect, to: toRect })?.finished
      flyer.drop('fold')
    },
    [foldIn, flyer.drop, flyer.raise],
  )

  // pairToDiscard: the pending pair at the centre splits into two singles.
  const runPairOut = useCallback(
    async (plan: Extract<BeatPlan, { kind: 'pairToDiscard' }>, _ctx: BeatRun) => {
      await nextFrames()
      const a = latest.current.anchors
      const el = a.centre.current?.querySelector<HTMLElement>('[data-pending-play]') ?? null
      const from = el ? rectOf(el) : null
      if (!from) return // nothing measurable: the projection resolves it (never stranded)
      const mainRef = plan.main
      const auxRef = plan.aux
      const main = mainRef ? cardById(mainRef.card) : null
      const aux = auxRef ? cardById(auxRef.card) : null
      // note the pair split lands on scatterAt(eventId) of each half's own
      // `discarded` event — the same Scatter toDiscardHeap rests them on (I7).
      // `auxScatter` is what carries that for the AUX half specifically:
      // `useDiscardExit`'s own pair-split (`expand()`) has no other way to
      // learn the aux's discard event id, and without it the aux would fly to
      // a random `jitter()` and snap to its real rest the instant the heap
      // takes over.
      const items: Leaving[] =
        main && mainRef
          ? [
              {
                key: `p${mainRef.eventId}`,
                card: main,
                aux,
                el,
                from,
                layer: 0,
                scatter: scatterAt(mainRef.eventId),
                auxScatter: auxRef ? scatterAt(auxRef.eventId) : undefined,
              },
            ]
          : aux && auxRef
            ? [{ key: `p${auxRef.eventId}`, card: aux, from, scatter: scatterAt(auxRef.eventId) }]
            : []
      if (items.length > 0) await latest.current.send(items)
    },
    [],
  )

  // A new match cancels what is in the air, same reason and same idiom as
  // discardBeat/drawBeat/deckBeat: this runner's carriers are its own flyer
  // (a pair halfway across the table under 'fold', a cost under 'cost', a
  // release on its way to the zone under 'release' — `drop()` with no key
  // takes all of them) and the pair-out's discard exit (shared with
  // `discardBeat`, dropped for the same reason it is there). All of them
  // belong to the runner, not the queue, so all of them are cleared here.
  const reset = useCallback(() => {
    flyer.drop()
    resetExit()
  }, [flyer.drop, resetExit])

  return { overlay: [...exitOverlay, ...flyer.overlay], runAttack, runRelease, runPairOut, reset }
}
