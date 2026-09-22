import type { Event } from '@release/engine'
import { Card, cardById, rowCells } from '@release/ui'
import type { Leaving, Rect } from '@release/ui/animations'
import { nextFrames, play, scatterAt, useDiscardExit, useFlyer, wait } from '@release/ui/animations'
import { type RefObject, useCallback, useRef, useState } from 'react'
import type { BeatRun, BoardAnchors, BoardState, StagedHandoff } from '~/entities/game/board'
import type { BeatPlan, DiscardCard } from './planBeats'
import { settleInto, withLanded, withoutLanded } from './toHeap'
import { withoutFlown } from './withoutFlown'

// DeckAnimationsStory.playSequence keeps the public play up throughout the
// effect and holds it for another 420ms before splitting it into the heap.
const CENTER_HOLD = 420
// The pause between the card settling at the centre and its effect's own
// surface (a pick grid, a row) opening over it — the same hold it keeps
// before it leaves.
const PLACED_HOLD = CENTER_HOLD
const KEY = 'public-operation'

/** The operation card resting at the centre, drawn by the table itself. */
export interface OperationLanded {
  card: string
  sudo: boolean
}
const rectOf = (el: Element | null): Rect | null => {
  if (!el) return null
  const { left, top, width, height } = el.getBoundingClientRect()
  return { left, top, width, height }
}

function lastEventIndex(events: Event[], matches: (event: Event) => boolean): number {
  for (let i = events.length - 1; i >= 0; i--) if (matches(events[i])) return i
  return -1
}

function pendingOperation(
  state: BoardState,
  events: Event[],
): Extract<BeatPlan, { kind: 'operationPlaced' }> | null {
  const pending = state.pending
  if (!pending || !('source' in pending) || !pending.source) return null
  const main = cardById(pending.source)
  if (main?.category !== 'operation') return null
  const player = 'actor' in pending ? pending.actor : pending.player
  const opened = lastEventIndex(
    events,
    (e) => e.type === 'operationPlayed' && e.player === player && e.card === main.id,
  )
  const first =
    opened >= 0
      ? events.findIndex(
          (e, i) =>
            i > opened &&
            e.type === 'discarded' &&
            e.reason === 'effect' &&
            e.player === player &&
            e.card === main.id,
        )
      : lastEventIndex(
          events,
          (e) =>
            e.type === 'discarded' &&
            e.reason === 'effect' &&
            e.player === player &&
            e.card === main.id,
        )
  const spent = events
    .slice(first, first + 2)
    .flatMap((e, i) =>
      e.type === 'discarded' &&
      e.reason === 'effect' &&
      e.player === player &&
      (i === 0 ? e.card === main.id : e.card === 'support-sudo')
        ? [{ eventId: e.id, card: e.card }]
        : [],
    )
  const sudo =
    spent.some((c) => c.card === 'support-sudo') || ('sudo' in pending && pending.sudo === true)
  return {
    kind: 'operationPlaced',
    key: 'restored-operation',
    eventId: events[opened]?.id ?? events[first]?.id ?? 0,
    player,
    card: main.id,
    sudo,
    spent,
  }
}

// the operation's own cards STAND at the centre while the pile already counts
// them — the shared step's own opposite direction
const withoutSpent = withoutLanded

export function withoutPendingOperation(state: BoardState, events: Event[]): BoardState {
  return withoutSpent(state, pendingOperation(state, events)?.spent ?? [])
}

export function useOperationBeat(anchors: BoardAnchors, staging?: RefObject<StagedHandoff | null>) {
  const flyer = useFlyer()
  const exit = useDiscardExit(anchors.discardBox)
  const [standing, setStanding] = useState(false)
  // A card that has landed rests on the TABLE, not on the carrier: the carrier
  // is the flight layer, above every surface the effect then opens (useFlyer's
  // own contract — the resting card takes over and the node is dropped).
  const [landed, setLanded] = useState<OperationLanded | null>(null)
  const held = useRef<Extract<BeatPlan, { kind: 'operationPlaced' }> | null>(null)
  const epoch = useRef(0)
  const latest = useRef({ anchors, staging, exit })
  latest.current = { anchors, staging, exit }
  const reset = useCallback(() => {
    epoch.current++
    held.current = null
    setStanding(false)
    setLanded(null)
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
    (
      operation: Extract<BeatPlan, { kind: 'operationPlaced' }>,
      spent: { eventId: number; card: string }[] | undefined,
    ) =>
      (spent ?? operation.spent).map((c) => ({
        ...c,
        layer: operation.sudo && c.card === 'support-sudo' ? 0 : 1,
      })),
    [],
  )

  const exitItems = useCallback(
    (
      operation: Extract<BeatPlan, { kind: 'operationPlaced' }>,
      spent: { eventId: number; card: string }[] | undefined,
    ) => {
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
    },
    [],
  )

  // THE CARD LEAVES WITH THE CENTRE IT STANDS IN. An effect whose own cards go
  // to the discard empties the same centre this card rests in, and two beats
  // cannot empty it together — the queue plays them one after the other, so the
  // card would follow the rest after a visible gap. So the beat that owns that
  // centre takes this card into its own send instead. The two halves are the
  // same two moments `runExit` has internally: `takeOff` in the commit the
  // carriers go up, `settle` once they have landed.
  const handOver = useCallback(
    (ctx: BeatRun) => {
      const operation = held.current
      if (!operation) return null
      // NO ITEMS IS STILL AN EXIT. A card with nothing to fly — no centre to
      // measure, no node to carry — still has to stop standing: the only thing
      // that ever takes it off the table is this settle, so returning nothing
      // here left it at the centre for the rest of the match, long after its
      // effect was over (owner, 23.09).
      const items = exitItems(operation, operation.spent) ?? []
      return {
        items,
        takeOff: () => {
          setLanded(null)
          flyer.drop()
        },
        settle: () => {
          // …AND THE CARDS GO INTO THE HEAP, the same call this beat's own exit
          // makes (`runExit`). While the card stands at the centre the heap is
          // drawn without it — it cannot be in two places — so whoever takes it
          // away is the one who has to put it back. Handed over and not filed,
          // the discard was left one card short of its own count, and the heap
          // answers that by standing a place-holder on top whose pose is keyed
          // to the count: every card landing after it re-posed it, which reads
          // as the whole discard shuffling itself (owner, 23.09).
          settleInto(ctx, filedAsFlown(operation, operation.spent))
          held.current = null
          setStanding(false)
        },
      }
    },
    [exitItems, filedAsFlown, flyer.drop],
  )

  // Nothing travels on a restore: the card is already resting at the centre.
  const restore = useCallback((state: BoardState, events: Event[]) => {
    const plan = pendingOperation(state, events)
    if (!plan || !cardById(plan.card)) return
    held.current = plan
    setStanding(true)
    setLanded({ card: plan.card, sudo: plan.sudo === true })
  }, [])

  const runPlaced = useCallback(
    async (plan: Extract<BeatPlan, { kind: 'operationPlaced' }>, ctx: BeatRun) => {
      const run = epoch.current
      const handoff = plan.player === ctx.base.selfId ? latest.current.staging?.current : null
      await handoff?.whenLanded?.()
      await nextFrames()
      if (run !== epoch.current) return
      const a = latest.current.anchors
      const to = rectOf(a.centre.current)
      const main = cardById(plan.card)
      const aux = plan.sudo ? cardById('support-sudo') : undefined
      if (!to || !main) return
      const mine = plan.player === ctx.base.selfId
      const ids = [plan.card, ...(plan.sudo ? ['support-sudo'] : [])]
      const used = new Set<number>()
      const flown: DiscardCard[] = ids.flatMap((card, i) => {
        const uid = i === 0 ? handoff?.mainUid : handoff?.supportUid
        const index = ctx.base.you.hand.findIndex(
          (h, j) => !used.has(j) && (uid ? h.uid === uid : h.card.id === card),
        )
        if (mine && index < 0) return []
        used.add(index)
        return [
          {
            key: `operation:${i}`,
            eventId: plan.eventId,
            card,
            source: mine
              ? { kind: 'hand' as const, index }
              : { kind: 'seat' as const, player: plan.player },
          },
        ]
      })
      const hand = flown[0]?.source
      const from = handoff
        ? to
        : ((hand?.kind === 'hand' ? rectOf(a.handSlotAt(hand.index)) : null) ??
          a.seatBox(plan.player))
      if (!from) return
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
      const raised = flyer.raise(
        aux && places
          ? [
              { key: `${KEY}:aux`, at: places[0], content: <Card card={aux} width="100%" /> },
              {
                key: KEY,
                at: places[1],
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
      // The new carrier and the source removal commit together, including local
      // staging ownership. No intermediate frame renders both copies.
      ctx.publish(withoutFlown(ctx.base, flown))
      handoff?.release()
      held.current = plan
      setStanding(true)
      const els = await raised
      if (run !== epoch.current) return
      if (!handoff) {
        if (aux && places && lands) {
          await Promise.all(
            els.map((el, i) =>
              el ? play('playToCenter', el, { from: places[i], to: lands[i] })?.finished : null,
            ),
          )
        } else if (els[0]) {
          await play('playToCenter', els[0], { from, to })?.finished
        }
      }
      if (run !== epoch.current) return
      // Landed: the table's own render takes the card over in the same commit
      // the carrier goes down in, so no frame shows both or neither.
      setLanded({ card: plan.card, sudo: plan.sudo === true })
      flyer.drop()
      await wait(PLACED_HOLD)
    },
    [flyer.raise, flyer.drop],
  )

  const runExit = useCallback(
    async (plan: Extract<BeatPlan, { kind: 'operationExit' }>, ctx: BeatRun) => {
      const operation = held.current
      if (!operation) return
      const run = epoch.current
      await wait(CENTER_HOLD)
      if (run !== epoch.current) return
      const items = exitItems(operation, plan.spent)
      if (!items) {
        reset()
        return
      }
      // the resting card goes in the same commit the exit's carriers go up —
      // the step's own `takeOff`, which is where this ordering now lives
      await latest.current.exit.send(items, () => {
        setLanded(null)
        flyer.drop()
      })
      if (run !== epoch.current) return
      // the cards go into the heap in the same breath the flight ends, support
      // under the card it paid for — the shared step owns both rules now
      const withCards = withLanded(ctx.base, filedAsFlown(operation, plan.spent))
      const pending = ctx.base.pending
      const settled = {
        ...withCards,
        pending:
          pending && 'source' in pending && pending.source === operation.card ? null : pending,
      }
      ctx.base = settled
      ctx.publish(settled)
      held.current = null
      setStanding(false)
    },
    [exitItems, filedAsFlown, flyer.drop, reset],
  )
  const withoutHeld = useCallback((state: BoardState): BoardState => {
    return withoutSpent(state, held.current?.spent ?? [])
  }, [])
  return {
    restore,
    withoutHeld,
    handOver,
    overlay: [...flyer.overlay, ...exit.overlay],
    standing,
    landed,
    runPlaced,
    runExit,
    reset,
  }
}
