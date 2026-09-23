import type { CardData } from '@release/ui'
import type { Leaving, Rect } from '@release/ui/animations'
import { scatterAt } from '@release/ui/animations'

// ONE EXCHANGE, ONE SEND — the shape every resolution on this board has when
// what was standing at the centre leaves together.
//
// Each card carries its layer, so the heap keeps the order they lay in on the
// table (I9), and each lands on its own `discarded` event's scatter (I7). And
// LAYER COMES FROM POSITION: a half that is not there must be passed as `null`
// and filtered here rather than skipped by the caller, or a missing first half
// silently promotes the second to layer 0 and inverts the heap.
//
// It lives in its own file because three resolutions have this exact shape — an
// attack answered by a defence, an alarm answered by any of its three methods,
// and a DDoS leaving with what it struck. It was written in the first, copied
// into the second, and the copy is what this replaces. Unlike a carrier, a pure
// function shared between runners cannot entangle them: it holds nothing.

export interface ExchangeHalf {
  eventId: number
  card: CardData
  aux?: CardData | null
  auxEventId?: number
  el: HTMLElement | null
  from: Rect
  pose: { rot: number; dx: number; dy: number }
}

export const exchange = (halves: (ExchangeHalf | null)[]): Leaving[] =>
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
