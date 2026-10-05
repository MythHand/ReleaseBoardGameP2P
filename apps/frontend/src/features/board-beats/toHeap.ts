import { cardById } from '@release/ui'
import { scatterAt } from '@release/ui/animations'
import type { BoardState } from '~/entities/game/board'

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
  // by (`toDiscardHeap`): it stands for the card banked last, so a card filed
  // beneath that count lies under it — the order the projection folds them in.
  // Two cards of one batch can land in either order (a refused crush's release
  // and the trigger beside it, 03.10), and the heap must not depend on which.
  const last = heap.at(-1)
  const standIn = last?.uid?.startsWith('top') ? Number(last.uid.slice(3)) : null
  const under = standIn === null ? undefined : heap.pop()
  // A CARD THAT LANDS LATE STILL LIES WHERE IT WAS FILED. The cards already on
  // top that were filed AFTER it — a later event id — lie over it, because the
  // projection folds the heap in event order and puts it under them the moment
  // it takes over. Two beats of one batch land in whichever order their flights
  // happen to end: a crushed release and its Code Review could come down before
  // the trigger beside them, and the trigger then lay on top and dropped under
  // them a moment later (owner's recording, 04.10). Only what lay there BEFORE
  // this landing counts — the cards of one landing keep the order the table
  // gave them (`inTableOrder`), a support under its card included.
  const lying = heap.splice(0)
  // how many of the cards lying there stay UNDER a card filed by this event
  const settlesAt = (eventId: number) => {
    let at = lying.length
    while (at > 0) {
      const id = Number(lying[at - 1].uid?.match(/^d(\d+)$/)?.[1] ?? Number.NaN)
      if (!(id > eventId)) break
      at--
    }
    return at
  }
  const landed: { at: number; entry: (typeof lying)[number] }[] = []
  for (const item of inTableOrder(filed)) {
    const card = cardById(item.card)
    const uid = `d${item.eventId}`
    if (!card || lying.some((e) => e.uid === uid) || landed.some((l) => l.entry.uid === uid))
      continue
    landed.push({ at: settlesAt(item.eventId), entry: { uid, card, ...scatterAt(item.eventId) } })
  }
  for (let k = 0; k <= lying.length; k++) {
    for (const l of landed) if (l.at === k) heap.push(l.entry)
    if (k < lying.length) heap.push(lying[k])
  }
  const added = landed.length
  if (under) {
    // under the cards this landing put on top, over everything else
    const onTop = landed.filter((l) => l.at === lying.length).length
    if (standIn !== null && state.decks.discardCount + added <= standIn) heap.push(under)
    else heap.splice(heap.length - onTop, 0, under)
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
 * A card TAKEN BACK OUT of the discard — Inside's pick. The event names the
 * card, not which copy, so the topmost copy leaves: the one the projection
 * takes out for a `takenFromDiscard` (`toDiscardHeap`), so the heap the beat
 * draws while the card is in the air is the heap the live board then draws.
 */
export function withoutTopCopy(state: BoardState, card: string): BoardState {
  const heap = state.decks.discardHeap ?? []
  let at = -1
  for (let i = heap.length - 1; i >= 0; i--) {
    if (heap[i].card.id !== card) continue
    at = i
    break
  }
  if (at < 0) return state
  const remaining = heap.filter((_, i) => i !== at)
  return {
    ...state,
    decks: {
      ...state.decks,
      discardHeap: remaining,
      discard: remaining.at(-1)?.card,
      discardCount: Math.max(0, state.decks.discardCount - 1),
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
