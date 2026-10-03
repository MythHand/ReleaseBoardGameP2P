import { cardById } from '@release/ui'
import { scatterAt } from '@release/ui/animations'
import { type BoardState, standInScatter } from '~/entities/game/board'

// WHAT LANDED IN THE DISCARD, PUT THERE BY THE BEAT THAT FLEW IT.
//
// The exit step (`useDiscardExit`) flies the cards and then takes its carriers
// down. The heap a beat hands on is the board from BEFORE the batch, so unless
// the beat writes the cards in itself they are nowhere at all for the frames
// between the carrier coming down and the projection catching up — and the card
// blinks out exactly as it lands. Every beat with a discard needs this, and
// three of them had grown their own copy of it (docs/animations/beat-copies.md).
//
// Pure, so a beat calls it and hands the result to `ctx.publish` — and, since
// what comes next in the same beat builds on `ctx.base`, assigns it there too
// (`settleInto` below does both).

export interface Filed {
  eventId: number
  card: string
  /**
   * WHERE IT LAY ON THE TABLE — the same number the flight carried it out on.
   * The heap takes cards exactly as they lay: what was above stays above, what
   * was under stays under. Cards that lay side by side carry no layer of their
   * own and keep the order they were put down in, which is the order their
   * events already have.
   */
  layer?: number
}

/**
 * The order cards join the heap in: THE ORDER THEY LAY IN ON THE TABLE.
 *
 * The table is the only place that knows it — which card was over which, and
 * which two merely stood side by side — and the flight carries that knowledge
 * out as each card's layer. So the heap does not decide anything about a card
 * here and does not care what card it is: it takes them bottom-up by the layer
 * they had, and cards that had none (they lay beside each other, nothing
 * overlapping) keep the order they were put down in — their own event order.
 *
 * It used to sort by CATEGORY instead — a support first, whatever the table
 * looked like. That is a rule invented here, and it is wrong the moment a
 * support stands beside its card rather than under it (owner, 23.09).
 */
export const inTableOrder = (filed: Filed[]): Filed[] =>
  [...filed].sort((a, b) => (a.layer ?? 0) - (b.layer ?? 0) || a.eventId - b.eventId)

/**
 * The board with these cards resting in the heap, each on its own `discarded`
 * event's scatter (I7). A card already in the heap is skipped rather than added
 * twice — a beat can be asked to settle what an earlier one already did.
 *
 * Returns the state unchanged when nothing was added, so a caller can publish
 * unconditionally without an extra render.
 */
export function withLanded(state: BoardState, filed: Filed[]): BoardState {
  const heap = [...(state.decks.discardHeap ?? [])]
  // A STAND-IN ON TOP STAYS THE TOP until the count passes the one it is named
  // by (`withStandIn`): it stands for the card banked last, so a card filed
  // beneath that count lies under it — the order the projection folds them in.
  // Two cards of one batch can land in either order (a refused crush's release
  // and the trigger beside it, 03.10), and the heap must not depend on which.
  const last = heap.at(-1)
  const standIn = last?.uid?.startsWith('top') ? Number(last.uid.slice(3)) : null
  const under = standIn === null ? undefined : heap.pop()
  let added = 0
  for (const item of inTableOrder(filed)) {
    const card = cardById(item.card)
    if (!card || heap.some((entry) => entry.uid === `d${item.eventId}`)) continue
    heap.push({ uid: `d${item.eventId}`, card, ...scatterAt(item.eventId) })
    added++
  }
  if (under) {
    if (standIn !== null && state.decks.discardCount + added <= standIn) heap.push(under)
    else heap.splice(heap.length - added, 0, under)
  }
  if (added === 0) return state
  return {
    ...state,
    decks: {
      ...state.decks,
      discardHeap: heap,
      discard: heap.at(-1)?.card,
      discardCount: state.decks.discardCount + added,
    },
  }
}

/**
 * …and the same thing for a beat: the cards go into the heap, the run's own
 * base MOVES WITH the publish, and the call is a no-op when there is nothing to
 * add.
 *
 * `base` moving matters as much as the publish: everything later in the same
 * beat builds its own publish off `ctx.base`, so a base left behind quietly
 * undoes this one.
 */
export function settleInto(
  ctx: { base: BoardState; publish: (state: BoardState) => void },
  filed: Filed[],
): void {
  const next = withLanded(ctx.base, filed)
  if (next === ctx.base) return
  ctx.base = next
  ctx.publish(next)
}

/**
 * A card BANKED IN SILENCE — destroyed with no `discarded` event of its own, so
 * the heap has nothing to key it by — resting where the projection rests it:
 * the stand-in for the discard's top, keyed by the count once it is banked
 * (`toDiscardHeap`, `standInScatter`). The flight lands on that same pose, so
 * the card neither jumps as it lands nor when the live board takes over.
 *
 * An earlier stand-in is no longer the top and goes, the way the projection
 * drops it. `banked` is how many cards the count takes in — a release and the
 * Code Review under it are two, and only the one on top is drawn.
 */
export function withStandIn(
  state: BoardState,
  top: { card: string; count: number; banked?: number },
): BoardState {
  const uid = `top${top.count}`
  const card = cardById(top.card)
  const heap = state.decks.discardHeap ?? []
  if (!card || heap.some((entry) => entry.uid === uid)) return state
  return {
    ...state,
    decks: {
      ...state.decks,
      discardHeap: [
        ...heap.filter((entry) => !entry.uid?.startsWith('top')),
        { uid, card, ...standInScatter(top.count) },
      ],
      discard: card,
      discardCount: state.decks.discardCount + (top.banked ?? 1),
    },
  }
}

/**
 * The opposite direction, and the one only an operation needs: its own cards are
 * STANDING at the centre while the pile already counts them, so they come out of
 * the heap for as long as they stand there.
 */
export function withoutLanded(state: BoardState, filed: { eventId: number }[]): BoardState {
  const ids = new Set(filed.map((c) => `d${c.eventId}`))
  const heap = state.decks.discardHeap
  if (!heap || ids.size === 0) return state
  const remaining = heap.filter((c) => !c.uid || !ids.has(c.uid))
  const removed = heap.length - remaining.length
  if (!removed) return state
  return {
    ...state,
    decks: {
      ...state.decks,
      discardHeap: remaining,
      discard: remaining.at(-1)?.card,
      discardCount: Math.max(0, state.decks.discardCount - removed),
    },
  }
}
