import type { Event } from '@release/engine'
import type { ReleaseSlots } from '@release/ui'
import type { BoardState } from '~/entities/game/board'

// A batch of engine events becomes the movements the board should play. Pure:
// it reads the projection as it stood BEFORE the batch, because that is the
// board still on screen — the hand slot a card is about to leave still exists
// there to be measured (I1).
//
// An event with no choreography yields no beat and passes straight through.
// That is the default, not a gap: the board is driven by the projection, and a
// beat only ever adds a way of GETTING to the next one.

export type DiscardSource =
  | { kind: 'hand'; index: number }
  | { kind: 'release'; player: string; slot: string }
  | { kind: 'seat'; player: string }

export interface DiscardCard {
  key: string
  eventId: number
  card: string
  source: DiscardSource
}

export interface BeatPlan {
  kind: 'discard'
  key: string
  cards: DiscardCard[]
}

// A card leaving a release slot names the slot it stood in. Reasons other than
// these two never come out of the zone, so they are not searched for there.
const FROM_RELEASE = new Set(['destroyed', 'neutralized'])

// `ReleaseSlots` has no string index signature (it names its four keys
// explicitly), so the lookup takes it by its own type rather than a generic
// Record — `keyof ReleaseSlots` keeps the cast at the one line that needs it.
const slotHolding = (release: ReleaseSlots, card: string): string | null =>
  (Object.keys(release) as (keyof ReleaseSlots)[]).find((k) => release[k]?.id === card) ?? null

function sourceOf(
  e: Extract<Event, { type: 'discarded' }>,
  before: BoardState,
  claimed: Set<number>,
): DiscardSource | null {
  const mine = e.player === before.selfId
  if (FROM_RELEASE.has(e.reason)) {
    const release = mine
      ? before.you.release
      : before.opponents.find((o) => o.id === e.player)?.release
    const slot = release ? slotHolding(release, e.card) : null
    return slot ? { kind: 'release', player: e.player, slot } : null
  }
  if (!mine) return { kind: 'seat', player: e.player }
  // `discarded` carries a card id, not a uid, so the slot is found by matching
  // the id against the hand that is still on screen. Two copies of one card are
  // interchangeable to look at, so the first unclaimed one is right rather than
  // merely adequate — `claimed` is what stops a pair of them sharing a slot.
  const index = before.you.hand.findIndex((h, i) => h.card.id === e.card && !claimed.has(i))
  if (index < 0) return null
  claimed.add(index)
  return { kind: 'hand', index }
}

export function planBeats(events: Event[], before: BoardState): BeatPlan[] {
  const claimed = new Set<number>()
  const cards: DiscardCard[] = []
  for (const e of events) {
    if (e.type !== 'discarded') continue
    const source = sourceOf(e, before, claimed)
    // No source means the card is not where the board can see it — a case the
    // rules have not settled (docs/animations/backlog.md). Nothing is invented:
    // it is simply not flown, and the projection still puts it in the discard.
    if (!source) continue
    cards.push({ key: `d${e.id}`, eventId: e.id, card: e.card, source })
  }
  if (cards.length === 0) return []
  return [{ kind: 'discard', key: `discard:${cards[0].eventId}`, cards }]
}
