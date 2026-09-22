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
}

/**
 * The order cards join the heap in: A SUPPORT LIES UNDER THE CARD IT PAID FOR.
 *
 * The feed reports a support a moment AFTER its main — both spent by one effect
 * — so filing in feed order would rest it ON TOP and the two halves would swap
 * places the instant their flight ended. The projection's own fold keeps the
 * same order (`toBoardState`'s tuck rule), which is what makes the handover
 * from this publish to `live` move nothing (I7).
 */
export const supportFirst = (spent: Filed[]): Filed[] =>
  [...spent].sort(
    (a, b) =>
      Number(cardById(b.card)?.category === 'support') -
      Number(cardById(a.card)?.category === 'support'),
  )

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
  let added = 0
  for (const item of filed) {
    const card = cardById(item.card)
    if (!card || heap.some((entry) => entry.uid === `d${item.eventId}`)) continue
    heap.push({ uid: `d${item.eventId}`, card, ...scatterAt(item.eventId) })
    added++
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
