import { Card, cardById, rowCells } from '@release/ui'
import type { Leaving, Rect } from '@release/ui/animations'
import { nextFrames, play, scatterAt, useDiscardExit, useFlyer, wait } from '@release/ui/animations'
import { type RefObject, useCallback, useRef } from 'react'
import type { BeatRun, BoardAnchors, CentreOperation, StagedHandoff } from '~/entities/game/board'
import { type Landing, liftOff, type Place, setDown } from './cardPlace'
import type { BeatPlan } from './planBeats'
import { adoptStaged, shownSource } from './shownBeat'
import { settleInto, withLanded } from './toHeap'

// DeckAnimationsStory.playSequence keeps the public play up throughout the
// effect and holds it for another 420ms before splitting it into the heap.
const CENTER_HOLD = 420
// The pause between the card settling at the centre and its effect's own
// surface (a pick grid, a row) opening over it — the same hold it keeps
// before it leaves.
const PLACED_HOLD = CENTER_HOLD
const KEY = 'public-operation'

type Spent = CentreOperation['spent']

const rectOf = (el: Element | null): Rect | null => {
  if (!el) return null
  const { left, top, width, height } = el.getBoundingClientRect()
  return { left, top, width, height }
}

// THE OPERATION STANDS ON THE TABLE, not in this beat. Where it stands is the
// board's own field (`centreOperation`), answered by the projection for as long
// as its effect runs — so a rebuilt board has it, and reduced motion draws it
// with its Sudo beside it. This beat only moves it there and away again, through
// the same two calls every other card goes through (`cardPlace`).
const leavingCentre = (operation: CentreOperation): Place[] => [
  { kind: 'centre', card: operation.card },
]

export function useOperationBeat(anchors: BoardAnchors, staging?: RefObject<StagedHandoff | null>) {
  const flyer = useFlyer()
  const exit = useDiscardExit(anchors.discardBox)
  const epoch = useRef(0)
  const latest = useRef({ anchors, staging, exit })
  latest.current = { anchors, staging, exit }
  const reset = useCallback(() => {
    epoch.current++
    flyer.drop()
    latest.current.exit.reset()
  }, [flyer.drop])

  // What the standing card's own exit looks like — one builder, because the
  // card can leave in two ways: on its own beat (`runExit`), or carried out by
  // the beat that is emptying the same centre (`handOver`).
  // WHAT LAY WHERE, for the heap — the very layer `exitItems` carries each half
  // out on. The heap takes cards as they lay on the table and decides nothing
  // about them itself, so the side that knows the table is the side that says.
  const filedAsFlown = useCallback(
    (operation: CentreOperation, spent: Spent | undefined) =>
      (spent ?? operation.spent).map((c) => ({
        ...c,
        layer: operation.sudo && c.card === 'support-sudo' ? 0 : 1,
      })),
    [],
  )

  const exitItems = useCallback((operation: CentreOperation, spent: Spent | undefined) => {
    const centre = rectOf(latest.current.anchors.centre.current)
    if (!centre) return null
    // EACH HALF LEAVES FROM WHERE IT STANDS. Paid for with a sudo, the two are
    // two cards in two places of the centre's row — the sudo enhances the card
    // beside it and stays its own card — so neither of them is at the middle
    // and neither is tucked under the other. The places are found the way the
    // row's places always are, by what they are rather than by position.
    const root = latest.current.anchors.centre.current?.parentElement
    const mainBox =
      rectOf(root?.querySelector<HTMLElement>('[data-public-operation]') ?? null) ?? centre
    const auxBox = rectOf(root?.querySelector<HTMLElement>('[data-operation-support]') ?? null)
    const items: Leaving[] = (spent ?? operation.spent).flatMap((c) => {
      const card = cardById(c.card)
      if (!card) return []
      const support = operation.sudo && c.card === 'support-sudo'
      return [
        {
          key: `operation-exit:${c.eventId}`,
          card,
          from: support ? (auxBox ?? mainBox) : mainBox,
          scatter: scatterAt(c.eventId),
          // the layer is the order they join the HEAP in, where the support
          // does lie under the card it paid for — that much is unchanged
          layer: support ? 0 : 1,
        },
      ]
    })
    return items
  }, [])

  // THE CARD LEAVES WITH THE CENTRE IT STANDS IN. An effect whose own cards go
  // to the discard empties the same centre this card rests in, and two beats
  // cannot empty it together — the queue plays them one after the other, so the
  // card would follow the rest after a visible gap. So the beat that owns that
  // centre takes this card into its own send instead. The two halves are the
  // same two moments `runExit` has internally: `takeOff` in the commit the
  // carriers go up, `settle` once they have landed.
  const handOver = useCallback(
    (ctx: BeatRun) => {
      const operation = ctx.base.centreOperation
      if (!operation) return null
      const leaving = leavingCentre(operation)
      // NO ITEMS IS STILL AN EXIT. A card with nothing to fly — no centre to
      // measure — still has to stop standing, which is why `settle` takes it
      // off the centre too: an exit with nothing in the air never runs
      // `takeOff` (owner, 23.09).
      const items = exitItems(operation, operation.spent) ?? []
      return {
        items,
        takeOff: () => {
          liftOff(ctx, leaving)
          flyer.drop()
        },
        settle: () => {
          // …AND THE CARDS GO INTO THE HEAP, the same call this beat's own exit
          // makes (`runExit`). Taken off the centre and not filed, the discard
          // was left short of its own count, and the heap answers that by
          // standing a place-holder on top whose pose is keyed to the count:
          // every card landing after it re-posed it, which reads as the whole
          // discard shuffling itself (owner, 23.09).
          liftOff(ctx, leaving)
          settleInto(ctx, filedAsFlown(operation, operation.spent))
        },
      }
    },
    [exitItems, filedAsFlown, flyer.drop],
  )

  const runPlaced = useCallback(
    async (plan: Extract<BeatPlan, { kind: 'operationPlaced' }>, ctx: BeatRun) => {
      const run = epoch.current
      const mine = plan.player === ctx.base.selfId
      const handoff = mine ? latest.current.staging?.current : null
      await handoff?.whenLanded?.()
      await nextFrames()
      if (run !== epoch.current) return
      const standing: Landing = {
        kind: 'centre',
        operation: { card: plan.card, sudo: plan.sudo === true, spent: plan.spent },
      }
      // OUR OWN PLAY ALREADY STANDS WHERE IT WILL STAND. The gesture put it out
      // at the centre, in the very places the table draws a standing operation
      // in (the middle, or the row's two places beside its Sudo), so nothing
      // flies: the table takes the cards over from the gesture in one commit.
      // A carrier raised there only stood in for the card for a few frames
      // between the gesture's copy and the table's (owner's recordings, 02.10).
      if (handoff) {
        adoptStaged(ctx, handoff)
        setDown(ctx, [standing])
        await wait(PLACED_HOLD)
        return
      }
      const a = latest.current.anchors
      const ids = [plan.card, ...(plan.sudo ? ['support-sudo'] : [])]
      // WHERE ITS CARDS ARE DRAWN NOW: put out at the centre first
      // (resolution.md §1), still in our own hand (a play with no gesture of
      // ours), or in a closed hand.
      const shownHere = (ctx.base.shown ?? []).filter(
        (s) => s.player === plan.player && ids.includes(s.card.id),
      )
      const used = new Set<string>()
      const inHand = mine
        ? ids.flatMap((id) => {
            const held = ctx.base.you.hand.find((h) => !used.has(h.uid) && h.card.id === id)
            if (!held) return []
            used.add(held.uid)
            return [held]
          })
        : []
      const sources: Place[] = mine
        ? inHand.map((h) => ({ kind: 'hand' as const, uid: h.uid }))
        : shownHere.length > 0
          ? shownHere.map((s) => ({ kind: 'shown' as const, player: plan.player, uid: s.uid }))
          : [{ kind: 'seat' as const, player: plan.player, count: ids.length }]
      const to = rectOf(a.centre.current)
      const main = cardById(plan.card)
      const aux = plan.sudo ? cardById('support-sudo') : undefined
      // Another player's card they had put out at the centre first is already
      // standing there — it starts where it stands, not at the seat.
      const shown = mine ? null : shownSource(ctx.base, plan.player, ids, a)
      const slot = inHand[0] ? a.handSlotAt(ctx.base.you.hand.indexOf(inHand[0])) : null
      const from = shown?.rect ?? rectOf(slot) ?? a.seatBox(plan.player)
      if (!to || !main || !from) {
        // nothing to fly it along: it still goes where it stands
        liftOff(ctx, sources)
        setDown(ctx, [standing])
        return
      }
      // PAID FOR WITH SUDO: two cards, not one pair. They fly to the two places
      // of the centre's row they will stand in — asked of the module rather than
      // measured, because those places are mounted by the landing this flight is
      // on its way to. The row's own point is the middle of the table, which is
      // what the centre place is.
      const places = aux
        ? rowCells('staging', 2).map((cell) => ({
            left: from.left + from.width / 2 + cell.dx - cell.w / 2,
            top: to.top + to.height / 2 - cell.h / 2,
            width: cell.w,
            height: cell.h,
          }))
        : null
      const lands = aux
        ? rowCells('staging', 2).map((cell) => ({
            left: to.left + to.width / 2 + cell.dx - cell.w / 2,
            top: to.top + to.height / 2 - cell.h / 2,
            width: cell.w,
            height: cell.h,
          }))
        : null
      // shown first, the two already stand in those two places of the row
      const starts = shown ? lands : places
      const raised = flyer.raise(
        aux && starts
          ? [
              { key: `${KEY}:aux`, at: starts[0], content: <Card card={aux} width="100%" /> },
              {
                key: KEY,
                at: starts[1],
                content: (
                  <div data-public-operation="">
                    <Card card={main} width="100%" />
                  </div>
                ),
              },
            ]
          : [
              {
                key: KEY,
                at: from,
                content: (
                  <div data-public-operation="">
                    <Card card={main} width="100%" />
                  </div>
                ),
              },
            ],
      )
      // The carriers go up in the commit the cards leave every place they were
      // drawn in — no frame shows both copies.
      liftOff(ctx, sources)
      const els = await raised
      if (run !== epoch.current) return
      if (aux && starts && lands) {
        await Promise.all(
          els.map((el, i) => (el ? play('playToCenter', el, { to: lands[i] })?.finished : null)),
        )
      } else if (els[0]) {
        await play('playToCenter', els[0], { to })?.finished
      }
      if (run !== epoch.current) return
      // Landed: the table takes the card over in the same commit the carrier
      // goes down in, so no frame shows both or neither.
      setDown(ctx, [standing], () => flyer.drop())
      await wait(PLACED_HOLD)
    },
    [flyer.raise, flyer.drop],
  )

  const runExit = useCallback(
    async (plan: Extract<BeatPlan, { kind: 'operationExit' }>, ctx: BeatRun) => {
      const operation = ctx.base.centreOperation
      if (!operation) return
      const run = epoch.current
      await wait(CENTER_HOLD)
      if (run !== epoch.current) return
      const spent = plan.spent ?? operation.spent
      const leaving = leavingCentre(operation)
      const items = exitItems(operation, spent)
      // the resting card goes in the same commit the exit's carriers go up —
      // the step's own `takeOff`, which is where this ordering now lives
      if (items)
        await latest.current.exit.send(items, () => {
          liftOff(ctx, leaving)
          flyer.drop()
        })
      if (run !== epoch.current) return
      // nothing in the air (no centre to measure, nothing to fly): it still
      // stops standing — a no-op when the exit already took it off
      liftOff(ctx, leaving)
      // the cards go into the heap in the same breath the flight ends, support
      // under the card it paid for — the shared step owns both rules now
      const withCards = withLanded(ctx.base, filedAsFlown(operation, spent))
      const pending = ctx.base.pending
      const settled = {
        ...withCards,
        pending:
          pending && 'source' in pending && pending.source === operation.card ? null : pending,
      }
      ctx.base = settled
      ctx.publish(settled)
    },
    [exitItems, filedAsFlown, flyer.drop],
  )

  return {
    handOver,
    overlay: [...flyer.overlay, ...exit.overlay],
    runPlaced,
    runExit,
    reset,
  }
}
