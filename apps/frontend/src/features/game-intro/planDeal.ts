import type { Event, PlayerView } from '@release/engine'

export interface DealFlight {
  round: number
  to: { kind: 'self'; index: number } | { kind: 'seat'; player: string }
  // The card's identity, when it is one this viewer may know: their own card,
  // or an opponent's face-up Debugger. Null is somebody else's closed card —
  // the projection never says what it is, and neither does this.
  card: string | null
  faceUp: boolean
}

export interface DealPlan {
  // The base pile as it stood before the deal: what is left plus what went out.
  deckBefore: number
  events: number
  // Round by round, the player first in every round — the table is dealt the
  // way a table is dealt, not player by player.
  flights: DealFlight[]
  // The finished fan, in the projection's own order. Deal into it in this order
  // and the hand never re-sorts when the intro hands over to the live board.
  hand: { uid: string; card: string }[]
}

// The opening, reconstructed. The engine dealt before any peer mounted the
// board, so this reads the finished projection backwards into the sequence that
// produced it. Pure: every timing decision belongs to the sequencer.
export function planDeal(view: PlayerView, events: Event[]): DealPlan | null {
  const deals = events.filter((e): e is Extract<Event, { type: 'dealt' }> => e.type === 'dealt')
  if (deals.length === 0) return null

  const mine = deals.find((d) => d.player === view.self.id)
  const others = view.opponents.map((o) => ({
    id: o.id,
    deal: deals.find((d) => d.player === o.id),
  }))

  const piles = view.decks.piles.reduce((sum, n) => sum + n, 0)
  const out = deals.reduce((sum, d) => sum + d.count, 0)

  const myCount = mine?.count ?? view.self.hand.length
  const rounds = Math.max(myCount, ...others.map((o) => o.deal?.count ?? 0))

  const flights: DealFlight[] = []
  for (let round = 0; round < rounds; round += 1) {
    if (round < myCount) {
      const card = view.self.hand[round]
      flights.push({
        round,
        to: { kind: 'self', index: round },
        card: card?.id ?? null,
        // The open cards are dealt first (packages/engine/src/fake/setup.ts
        // reserves the Debugger as hand[0]), so a round is open exactly while
        // it is still inside the open list.
        faceUp: round < (mine?.open?.length ?? 0),
      })
    }
    for (const o of others) {
      if (!o.deal || round >= o.deal.count) continue
      const open = o.deal.open ?? []
      flights.push({
        round,
        to: { kind: 'seat', player: o.id },
        card: round < open.length ? open[round] : null,
        faceUp: round < open.length,
      })
    }
  }

  return {
    deckBefore: piles + out,
    events: view.decks.events,
    flights,
    hand: view.self.hand.map((c) => ({ uid: c.uid, card: c.id })),
  }
}
