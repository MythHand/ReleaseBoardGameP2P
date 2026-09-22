import type { CardData } from '@release/ui'
import { CardPair, cardAreaOf, cardBoxIn, cardById, PAIR_AUX, PAIR_AUX_POSE } from '@release/ui'
import type { Leaving, Rect } from '@release/ui/animations'
import {
  enterPose,
  exitLayer,
  FLIP_MS,
  nextFrames,
  play,
  restTransform,
  scatterAt,
  useDiscardExit,
  useFlyer,
  useHandArrival,
  wait,
} from '@release/ui/animations'
import type { RefObject } from 'react'
import { useCallback, useRef } from 'react'
import {
  ATTACK_POSE,
  type BeatRun,
  type BoardAnchors,
  COVER_POSE,
  MERGE_MS,
  SHOW_HOLD,
  type StagedHandoff,
} from '~/entities/game/board'
import type { BeatPlan } from './planBeats'
import { useToCentre } from './toCentre'
import { withoutFlown } from './withoutFlown'

// The carrier a DDoS's own effect needs: the card it struck. One card is one
// carrier, and a release wearing a Code Review is one card — it stands in the
// zone as a pair and it travels as one.
const STRUCK = 'struck'

// The event-driven half of the combo pair (#100): an `attacked`/`released`
// reaching the table, and the pending pair splitting back out to the discard
// once it resolves. `_useBoardStaging.ts` is the OTHER half — the gesture that
// stands a pull-and-fold at the centre before the engine ever answers. The two
// meet at `StagedHandoff` (entities/game/board/types.ts): when the actor's own
// play is the one arriving, the staged node is already standing exactly where
// this beat would fold one in, so there is nothing to move — the beat just
// hands the table back.

// ONE EXCHANGE, ONE SEND — and LAYER COMES FROM POSITION, so a half that is not
// there must be passed as `null` and filtered here rather than skipped by the
// caller: a missing half would otherwise silently promote the next one to layer 0
// and invert the heap. Copied from `defenseBeat` rather than imported, the same
// rule `rectOf` below follows — a helper shared between two runners by import is
// how one runner's change starts moving the other's cards.
interface ExchangeHalf {
  eventId: number
  card: CardData
  aux?: CardData | null
  auxEventId?: number
  el: HTMLElement | null
  from: Rect
  pose: { rot: number; dx: number; dy: number }
}
const exchange = (halves: (ExchangeHalf | null)[]): Leaving[] =>
  halves
    .filter((h): h is ExchangeHalf => h !== null)
    .map((h, layer) => ({
      key: `x${h.eventId}`,
      card: h.card,
      aux: h.aux ?? null,
      el: h.el,
      from: h.from,
      pose: h.pose,
      layer,
      scatter: scatterAt(h.eventId),
      ...(h.auxEventId === undefined ? {} : { auxScatter: scatterAt(h.auxEventId) }),
    }))

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
  // A release DDoS knocks out of a zone goes back to its owner's hand, and when
  // that owner is us it enters the fan through the shared insert every other
  // "a card settles into the hand" motion uses.
  const arrival = useHandArrival(anchors.hand, () => {})
  // THE CARD A DDOS PULLS OUT OF A ZONE rides the shared journey to a place at
  // the centre — its own carrier, owned by that step rather than shared with the
  // fold's, so neither run can take the other's node down.
  const pulled = useToCentre()
  const latest = useRef({ anchors, staging, send, clearPaidCost, takeStagedRelease, arrival })
  latest.current = { anchors, staging, send, clearPaidCost, takeStagedRelease, arrival }

  // Attacks arrive in ATTACK_POSE, including the whole composed Sudo pair,
  // matching DefenseRelease's throwAttack and the pending render underneath.
  // Release pairs form from their two halves. Returns the carrier still held;
  // the caller hands it to pending or flies it on to the release zone.
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
      if (aux && main.category === 'attack') {
        const [el] = await flyer.raise([
          { key: 'fold', at: fromRect, content: <CardPair main={main} aux={aux} width="100%" /> },
        ])
        if (el) {
          await play('playToCenter', el, {
            from: fromRect,
            to: cRect,
            rotate: ATTACK_POSE.rot,
            dx: ATTACK_POSE.dx,
            dy: ATTACK_POSE.dy,
          })?.finished
        }
        return el ?? null
      }
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
      const plainAttack = main.category === 'attack' && !aux
      const flights = [
        mainEl
          ? play(plainAttack ? 'landInPose' : 'foldIntoPair', mainEl, {
              from: fromRect,
              box: cRect,
              ...(plainAttack ? { pose: restTransform(ATTACK_POSE) } : { dur: MERGE_MS }),
            })
          : null,
        auxEl
          ? play('foldIntoPair', auxEl, {
              from: fromRect,
              box: cRect,
              pose: PAIR_AUX_POSE,
              dur: MERGE_MS,
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

      // DDoS resolves without a defense prompt. Keep its staged card (or the
      // remote fold) visible until this beat sends it to discard itself; a
      // later pairToDiscard cannot find a pending render for this attack.
      if (plan.resolved && plan.spent && plan.spent.length > 0) {
        const mine = plan.attacker === ctx.base.selfId
        await nextFrames()
        const el =
          mine && handoff
            ? handoff.el
            : await foldIn(plan.attacker, plan.card, plan.sudo ? 'support-sudo' : undefined, ctx)
        const from = rectOf(latest.current.anchors.centre.current)
        const main = cardById(plan.card)
        const mainSpent = plan.spent.find((item) => item.card === plan.card)
        const auxSpent = plan.spent.find((item) => item.card === 'support-sudo')

        // WHAT THE THROW STRUCK COMES UP TO THE CENTRE, and stands over the card
        // that struck it — the `cover` place, the centre module's own name for
        // "the card lying over the thrown one". Every target makes the same
        // journey, whatever it is: a Monitoring, a bare release, a release under
        // Code Review, an AI card. What differs between them is the road they
        // take afterwards, not whether the table gets to see them.
        //
        // The journey itself is `toCentre`'s — travel to a named place and stay
        // there — so nothing of it is written here. And ONE CARD IS ONE CARRIER:
        // a release wearing a Code Review stands in the zone as a pair and
        // travels as one, the way every other pair on this board does.
        const a = latest.current.anchors
        const hit = plan.hit
        // the FACE, not the rules id: an AI card in a zone wears the plain id
        const struckCard = hit ? cardById(hit.face) : null
        const struckFrom = hit ? rectOf(a.releaseSlot(hit.player, hit.slot)) : null
        const overThrow = rectOf(a.cover.current)
        const rode = hit?.codeReview ? cardById(hit.codeReview.card) : null
        // ABOVE THE WHOLE EXCHANGE — the order the cards lie in at the centre,
        // asked of the exit rather than counted out here: the exchange has two
        // halves, so a carrier that must stay over both rides the rung a third
        // would have. Counting it by hand tied this beat to how the exit numbers
        // its own flights.
        const overExchange = exitLayer(2)
        if (hit && struckCard && struckFrom && overThrow) {
          const arriving = pulled.toSlot({
            key: STRUCK,
            ...(rode
              ? { content: <CardPair main={struckCard} aux={rode} width="100%" /> }
              : { card: struckCard }),
            from: struckFrom,
            to: overThrow,
            faceDown: false,
            layer: overExchange,
            motion: 'playToCenter',
            pose: COVER_POSE,
          })
          // THE SAME CARD LEAVES THE ZONE — not a copy beside one still drawn
          // there. The module raises its carrier before it awaits anything, so
          // letting the slot go HERE puts both in one React commit. And `base`
          // MOVES WITH the publish rather than only being sent: everything later
          // in this beat builds its own publish off `ctx.base`, so leaving the
          // old one in place put the card back in the zone it had already left.
          const withoutStruck = withoutFlown(ctx.base, [
            {
              key: STRUCK,
              eventId: hit.eventId,
              card: hit.card,
              source: { kind: 'release', player: hit.player, slot: hit.slot },
            },
          ])
          ctx.base = withoutStruck
          ctx.publish(withoutStruck)
          await arriving
        }

        await wait(SHOW_HOLD)
        // Hand back the staged node and remove the spent instances from the
        // shadow in the same commit as the discard carrier takes over.
        if (mine) {
          const hand = [...ctx.base.you.hand]
          for (const spent of plan.spent) {
            const uid = spent.card === plan.card ? handoff?.mainUid : handoff?.supportUid
            const at = hand.findIndex((item) =>
              uid ? item.uid === uid : item.card.id === spent.card,
            )
            if (at >= 0) hand.splice(at, 1)
          }
          // `base` moves with it, for the same reason the zone's own publish does:
          // the heap publish at the end of this beat builds on `ctx.base`, and a
          // base left behind here put the spent cards back into the fan.
          const spentHand = { ...ctx.base, you: { ...ctx.base.you, hand } }
          ctx.base = spentHand
          ctx.publish(spentHand)
          handoff?.release()
        }
        // …AND EVERYTHING LEAVES AS ONE EXCHANGE — the same shape, and the same
        // helper, the defence's own resolution uses. LAYER COMES FROM POSITION,
        // so a half that is not there goes in as `null`: the heap takes the cards
        // of one send by their layer, and the order is the engine's — it banks
        // the throw first, so the throw lies under what it struck.
        const struckNode = pulled.elOf(STRUCK)
        // I6 — the aux stands tilted, so its bounding rect is the box AROUND the
        // card; trim it back to a card box. Read before anything is taken down.
        const auxFrom = (() => {
          if (!rode || !struckNode || !overThrow) return null
          const auxEl = struckNode.querySelector<HTMLElement>('[data-aux]')
          return auxEl ? cardBoxIn(auxEl.getBoundingClientRect(), overThrow.width) : null
        })()
        const heap = exchange([
          from && main && mainSpent
            ? {
                eventId: mainSpent.eventId,
                card: main,
                aux: auxSpent ? cardById(auxSpent.card) : null,
                auxEventId: auxSpent?.eventId,
                el,
                from,
                pose: ATTACK_POSE,
              }
            : null,
          // What the throw struck, when the heap is where it goes: it leaves as
          // the pair it travelled as, and `useDiscardExit` splits the pair and
          // unwinds the aux's own tilt itself.
          hit && struckCard && overThrow && hit.home === 'discard' && hit.discardId != null
            ? {
                eventId: hit.discardId,
                card: struckCard,
                aux: rode,
                auxEventId: hit.codeReview?.eventId,
                el: struckNode,
                from: overThrow,
                pose: COVER_POSE,
              }
            : // …or only the Code Review, when the release itself is going
              // somewhere else: a Code Review is never an events-deck card and
              // never follows the release home. The pair splits here instead of
              // leaving as one `aux` — `from`/`pose` mirror exactly what the
              // exit's own split would have given this half, so the split
              // changes WHERE the card goes and nothing about how it leaves.
              // The same split, for the same reason, the sacrifice leg makes.
              hit && rode && hit.codeReview && overThrow
              ? {
                  eventId: hit.codeReview.eventId,
                  card: rode,
                  el: struckNode,
                  from: auxFrom ?? overThrow,
                  pose: { rot: COVER_POSE.rot + PAIR_AUX.rot, dx: 0, dy: 0 },
                }
              : null,
        ])

        // The pair parts company in the commit the Code Review's exit goes up:
        // our carrier keeps the release alone, so it is never drawn twice. The
        // road home WAITS on this same raise — reading the carrier before it has
        // been replaced hands back the node that is on its way out.
        const split =
          hit && struckCard && overThrow && hit.home !== 'discard' && rode
            ? pulled.raise([
                {
                  key: STRUCK,
                  at: overThrow,
                  card: struckCard,
                  layer: overExchange,
                  pose: restTransform(COVER_POSE),
                },
              ])
            : null

        const homeward = (async () => {
          if (!hit || !struckCard || !overThrow || hit.home === 'discard') return
          await split
          const node = pulled.elOf(STRUCK)
          if (hit.home === 'events') {
            // face down first, then back into the deck — the same two steps, and
            // the same wait, `aiBeat`'s `goHome` and `defenseBeat`'s
            // `sacrificedHome` already take. The flip is the card's own, so
            // there is no handle to await.
            const deck = rectOf(a.eventsBox.current)
            if (node && deck) {
              pulled.patch(STRUCK, { faceDown: true })
              await wait(FLIP_MS)
              await play('returnToDeck', node, { from: overThrow, to: cardAreaOf(deck) })?.finished
            }
            pulled.drop(STRUCK)
            return
          }
          // into our own fan through the shared insert, and into another seat
          // with `dealToSeat`, where it dissolves — a hidden hand has nothing for
          // the card to become once it arrives.
          if (hit.player === ctx.base.selfId) {
            // HANDED OVER AS THE ELEMENT, not as a rect: the insert takes the
            // card already on screen — it hides our node and carries on from that
            // very frame — so nothing comes down before something else goes up.
            // `rot` is the tilt it rests at, which the step compensates for.
            await latest.current.arrival.arrive(
              [{ key: `ddos${hit.eventId}`, card: struckCard, el: node, rot: COVER_POSE.rot }],
              ctx.base.you.hand.length,
            )
            pulled.drop(STRUCK)
            return
          }
          const seat = a.seatBox(hit.player)
          if (node && seat) await play('dealToSeat', node, { from: overThrow, to: seat })?.finished
          pulled.drop(STRUCK)
        })()

        // WHAT LANDS IN THE HEAP IS PUT THERE BY THIS BEAT, in the same breath as
        // the flight ends. Without it the carriers come down on `reset()` while
        // the heap this beat hands over still knows nothing about these cards, and
        // every one of them blinks out for the frames in between. The order is the
        // engine's own — an aux joins under the card it was played with — so the
        // handover from this publish to the projection moves nothing (I7). Rebase's
        // own exit has done exactly this since #103.
        const filed: { eventId: number; card: string }[] = []
        if (mainSpent) {
          if (auxSpent) filed.push(auxSpent)
          filed.push(mainSpent)
        }
        if (hit?.home === 'discard' && hit.discardId != null) {
          if (hit.codeReview) filed.push(hit.codeReview)
          filed.push({ eventId: hit.discardId, card: hit.card })
        } else if (hit?.codeReview) filed.push(hit.codeReview)
        const settle = () => {
          const resting = [...(ctx.base.decks.discardHeap ?? [])]
          let added = 0
          for (const item of filed) {
            const card = cardById(item.card)
            if (!card || resting.some((entry) => entry.uid === `d${item.eventId}`)) continue
            resting.push({ uid: `d${item.eventId}`, card, ...scatterAt(item.eventId) })
            added++
          }
          if (added === 0) return
          ctx.publish({
            ...ctx.base,
            decks: {
              ...ctx.base.decks,
              discardHeap: resting,
              discard: resting.at(-1)?.card,
              discardCount: ctx.base.decks.discardCount + added,
            },
          })
        }

        await Promise.all([
          heap.length > 0
            ? latest.current
                .send(heap, () => {
                  // handed over in the commit the exit's own carriers go up: the
                  // fold that held the throw, and ours when the struck card is
                  // heap-bound too
                  flyer.drop('fold')
                  if (hit?.home === 'discard') pulled.drop(STRUCK)
                })
                .then(settle)
            : Promise.resolve(flyer.drop('fold')),
          homeward,
        ])
        return
      }

      // WHAT THE CARRIER HANDS OVER TO — the same question for every seat, so
      // one answer for all of them (#101, Fix D, finding 7). Letting go of
      // whatever held the attack (the fold's carrier below, or the actor's own
      // staged node just here) is only safe because the centre's static pending
      // render takes the card over on the very same commit — its last frame IS
      // the projection. That holds whenever the `defend` pending was already on
      // screen before this batch, which is the ordinary case.
      //
      // It does NOT hold when the throw and its answer arrive in one sync flush
      // (#101, Fix C, finding 4): `base` is the board from before the batch, so
      // it carries no pending, so there is no static render, so the attack
      // blinks out the moment the carrier lets go — and the `covered` beat
      // behind it then flies a defence over an empty slot and holds it there
      // for SHOW_HOLD, covering nothing. In a star topology that flush is the
      // ordinary case for every peer that is neither attacker nor defender, and
      // on a slow link, a rejoin or a replay it is the ATTACKER's case too —
      // which Fix C missed, because their arm returns before ever reaching
      // here.
      //
      // So the beat publishes the table it just made: the attack is standing,
      // and an answer is owed. `useBeats` renders that as the shadow for the
      // rest of this beat and hands it on as the next beat's `base`, which is
      // exactly what the publish channel is for.
      //
      // Never published when the answer is OURS to give. `options` is not
      // derivable here — the engine redacts it for everyone but the owner — so
      // an empty one would tell our own board a defence is owed and offer no
      // legal card to give it. A peer who is answering has seen the attack in
      // an earlier batch anyway, which is the only way they could have answered
      // it, so this branch is unreachable for them by construction. (The
      // defender's own corner of the coalesced batch is in
      // `docs/animations/backlog.md` — closing it needs derivable `options`,
      // not a guard.)
      //
      // And never over a pending that is already standing, of ANY kind: the
      // publish spreads `...ctx.base`, so a guard that only excluded `defend`
      // would REPLACE another kind with a fabricated one rather than decline.
      // Unreachable today (a cost step resolves before a window opens), which
      // is why it is a guard and not an argument.
      //
      // KNOWN WRONG, AND NOT FIXABLE HERE: the clock (#101, Fix D, finding 9).
      // The shim has none to carry — the `attacked` event stamps no timing —
      // and the published shadow is what the WHOLE board renders, so these
      // zeros reach `deriveDock` and give every watching peer a `hold` ring
      // reading `0s`: an expired countdown for a decision that had only just
      // opened, for the length of this beat.
      //
      // Omitting the two fields is the honest reading and would work at
      // runtime — `deriveDock` asks with `'deadline' in pending` and `clock()`
      // draws a flat ring for a missing bound (`dock.ts`), and those are the
      // only readers of either field anywhere. It cannot be written: `defend`
      // declares both required, and it must, because `engineContract.test-d.ts`
      // pins the kit's pending union as structurally EXACT against the engine's
      // own `PendingView`, where a defend always carries its clock. Loosening
      // the kit to fit this shim would loosen the contract for the real
      // projection too, and smuggling an untimed object past it with a cast
      // would put the same lie one layer deeper.
      //
      // Which is the backlog's own argument, arriving from a second direction:
      // this beat is the one producer of a pending that is not the engine, and
      // what it actually needs is a separate, non-`pending` "an attack is lying
      // on the table" shape that the centre can draw and the dock never reads.
      // Recorded in `docs/animations/backlog.md` and the audit register; the
      // zeros stay until that shape exists.
      const standAttack = () => {
        if (ctx.base.pending || plan.target === ctx.base.selfId) return
        // And never for an attack that was resolved inside the play that made
        // it (#19 follow-up): a DDoS is not answerable by a defence card, so
        // the engine banks it on the spot and owes nobody a decision. A `defend`
        // fabricated here would tell the whole table an answer is owed for a
        // throw nobody can answer — and `deriveDock` would draw the known-wrong
        // `0s` expired ring over it for the length of this beat. It became
        // reachable the moment a turn-played DDoS started logging `attacked`,
        // which is the fix this rides in behind.
        if (plan.resolved) return
        ctx.publish({
          ...ctx.base,
          pending: {
            kind: 'defend',
            player: plan.target,
            attacker: plan.attacker,
            attackCard: plan.card,
            sudo: plan.sudo,
            // redacted for anyone but the owner, which here is never us
            options: [],
            openedAt: 0,
            deadline: 0,
            scope: 'hand',
          },
        })
      }

      // Adopted without comparing cards, and structurally so: the event names
      // a card ID, the handoff holds a UID, and nothing can translate between
      // them here — the adoption leans instead on `handoffRef` being non-null
      // only while a dispatched play stands, so nothing stale is adoptable.
      if (handoff?.mainUid && plan.attacker === ctx.base.selfId) {
        // the actor's own play: the staged node stands exactly where the
        // pending render takes over — nothing to move, hand the table back.
        // Published FIRST, so the render that takes over exists before the node
        // that is standing there now is let go of.
        standAttack()
        handoff.release()
        return
      }
      await nextFrames() // the shadow that renders `before` has committed (I2)
      // everyone else (and a local click-thrown window attack, which staged
      // nothing): the halves fold in from the actor's side — seat for an
      // opponent, the hand slot the card left for the local thrower (found by
      // id, as sourceOf does)
      const el = await foldIn(plan.attacker, plan.card, plan.sudo ? 'support-sudo' : undefined, ctx)
      if (!el) return
      standAttack() // see above — published before the carrier below lets go
      flyer.drop('fold') // the centre pending render takes over (last frame = projection)
    },
    [foldIn, flyer.drop, pulled.toSlot, pulled.raise, pulled.patch, pulled.drop, pulled.elOf],
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
      let handoff = s?.current

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
          await latest.current.send(
            [
              {
                key: `c${plan.cost.eventId}`,
                card: costCard,
                from: costBox,
                scatter: scatterAt(plan.cost.eventId),
              },
            ],
            () => {
              latest.current.clearPaidCost?.current?.()
              flyer.drop('cost')
            },
          )
        }
      }

      await nextFrames()
      // A plain play can be accepted in the same commit that dispatches it.
      // Board publishes that handoff in its later layout effect; preserve an
      // early capture, but let this freshly dispatched staging catch up too.
      handoff ??= latest.current.staging?.current
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
        plan.player === ctx.base.selfId && !plan.codeReview && plan.slot !== 'monitoring'
          ? rectOf(a.stage.current)
          : null
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
        // Unconditionally, before returning: this branch now shadows the
        // `if (!cRect)` line below that used to be the only thing releasing a
        // handoff on the way past. A non-null handoff here would have to be a
        // dispatched play with a null `el` — unreachable on every path traced
        // (a solo release's handoff is cleared by the catch-up effect long
        // before this beat runs), but leaving `staged` uncleared costs a
        // permanently hidden fan card, and calling it costs nothing: the
        // handoff is non-null only while a dispatched play stands, and the
        // release that just landed IS that play.
        handoff?.release()
        return
      }
      if (!cRect) {
        handoff?.release()
        return
      }
      const el = await foldIn(plan.player, plan.card, plan.codeReview, ctx)
      if (plan.slot === 'monitoring') await wait(SHOW_HOLD)
      if (el) await play('playToReleaseZone', el, { from: cRect, to: toRect })?.finished
      flyer.drop('fold')
    },
    [foldIn, flyer.drop, flyer.raise],
  )

  // pairToDiscard: the pending pair at the centre splits into two singles.
  const runPairOut = useCallback(
    async (plan: Extract<BeatPlan, { kind: 'pairToDiscard' }>, ctx: BeatRun) => {
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
                pose: main.category === 'attack' ? ATTACK_POSE : undefined,
                scatter: scatterAt(mainRef.eventId),
                auxScatter: auxRef ? scatterAt(auxRef.eventId) : undefined,
              },
            ]
          : aux && auxRef
            ? [{ key: `p${auxRef.eventId}`, card: aux, from, scatter: scatterAt(auxRef.eventId) }]
            : []
      // THE COVER LEAVES WITH IT — the defence that reflected this attack and has
      // been lying over it since. Measured off the cover SLOT, which is
      // axis-aligned by design (its tilt lives on an inner node), so the rect is
      // the true card box a flight starts from (I6); `pose: COVER_POSE` is the
      // table tilt it starts AT, the same value the exchange in `defenseBeat`
      // hands the exit. Its own layer above the attack's, because that is how
      // the two lie on the table (I9).
      const coverRef = plan.cover
      const coverAuxRef = plan.coverAux
      const cover = coverRef ? cardById(coverRef.card) : null
      const coverBox = cover ? rectOf(a.cover.current) : null
      if (cover && coverRef && coverBox)
        items.push({
          key: `p${coverRef.eventId}`,
          card: cover,
          aux: coverAuxRef ? cardById(coverAuxRef.card) : null,
          el: a.cover.current,
          from: coverBox,
          layer: 1,
          pose: COVER_POSE,
          scatter: scatterAt(coverRef.eventId),
          auxScatter: coverAuxRef ? scatterAt(coverAuxRef.eventId) : undefined,
        })
      // The centre stops holding it in the same commit the carriers go up —
      // published through `takeOff` rather than after the flight, which is
      // what left the card standing there while its own copy flew away. Both
      // halves of the centre go down together: the attack and what covered it.
      if (items.length > 0)
        await latest.current.send(items, () => {
          if (ctx.base.centreAttack || ctx.base.centreCover)
            ctx.publish({ ...ctx.base, centreAttack: undefined, centreCover: undefined })
        })
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
    // …the card pulled out of a zone, and the parked insert, for the same reason
    // the carriers are dropped: a release bouncing back into our fan must not
    // land in the next match's.
    pulled.drop()
    arrival.reset()
  }, [flyer.drop, resetExit, pulled.drop, arrival.reset])

  return {
    overlay: [...exitOverlay, ...flyer.overlay, ...pulled.overlay, ...arrival.overlay],
    runAttack,
    runRelease,
    runPairOut,
    reset,
  }
}
