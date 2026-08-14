import type { Action, Target } from './actions'
import type { Event } from './events'
import type { CardId, CardUid, GameState, PlayerId, Setup } from './state'
import type { PlayerView } from './view'

// Deck composition, supplied by the caller from the card catalogue so quantities
// live in exactly one place.
export interface DeckEntry {
  id: CardId
  qty: number
}

export interface GameConfig {
  gameId: string
  // The host generates this with crypto.getRandomValues and passes it in; the
  // engine never sources randomness itself.
  seed: number
  players: { id: PlayerId; name: string }[]
  setup: Setup
  deck: DeckEntry[]
  events: DeckEntry[]
}

export interface Reduction {
  state: GameState
  events: Event[]
}

export interface Engine {
  createGame(config: GameConfig): GameState
  // The opening deal as events. Pure over the state `createGame` returned —
  // separate from it because most callers want only the state.
  setupEvents(state: GameState): Event[]
  // Total: never throws. An illegal action returns the state unchanged plus a
  // `rejected` event.
  reduce(state: GameState, action: Action): Reduction
  project(state: GameState, viewerId: PlayerId): PlayerView
  legalTargets(state: GameState, actor: PlayerId, card: CardUid): Target[]
}
