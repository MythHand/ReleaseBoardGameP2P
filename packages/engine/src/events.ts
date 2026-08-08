import type { Action } from './actions'
import type { CardId, NeutralizeMethod, PlayerId, ReleaseSlot } from './state'

export interface EventBase {
  id: number
  // The causing event's id. A defence names the attack it answered, an attack
  // names the release it targeted — so the history tree needs no inference.
  parent?: number
  // The audience, declared by the engine because only the rules know what is
  // secret. Absent means public. The future sync layer filters on this field.
  visibleTo?: PlayerId[]
}

export type Event = EventBase &
  (
    | { type: 'dealt'; player: PlayerId; count: number }
    | { type: 'drawn'; player: PlayerId; card?: CardId; pile: number; deckSize: number }
    | { type: 'released'; player: PlayerId; slot: ReleaseSlot; card: CardId; codeReview?: CardId }
    | { type: 'placed'; player: PlayerId; card: CardId }
    | { type: 'discarded'; player: PlayerId; card: CardId; reason: DiscardReason }
    | { type: 'windowOpened'; player: PlayerId; slot: ReleaseSlot; round: number; deadline: number }
    | { type: 'windowClosed'; player: PlayerId; slot: ReleaseSlot }
    | { type: 'passed'; player: PlayerId }
    | { type: 'unpassed'; player: PlayerId }
    | { type: 'attacked'; attacker: PlayerId; card: CardId; sudo: boolean; target: PlayerId }
    | { type: 'defended'; player: PlayerId; card: CardId; effect: DefenceEffect }
    | { type: 'tookHit'; player: PlayerId }
    | { type: 'releaseDestroyed'; player: PlayerId; slot: ReleaseSlot; card: CardId }
    | { type: 'releaseStolen'; from: PlayerId; to: PlayerId; slot: ReleaseSlot; card: CardId }
    | { type: 'releaseReturned'; player: PlayerId; slot: ReleaseSlot; card: CardId }
    | { type: 'monitoringDestroyed'; player: PlayerId; card: CardId }
    | { type: 'handTransfer'; from: PlayerId; to: PlayerId; card?: CardId }
    | { type: 'requested'; attacker: PlayerId; target: PlayerId; card: CardId; hit: boolean }
    | { type: 'revealed'; player: PlayerId; card: CardId }
    | { type: 'aiRevealed'; player: PlayerId; aiCard: CardId; eventCard: CardId }
    | { type: 'neutralized'; player: PlayerId; method: NeutralizeMethod }
    | { type: 'eliminated'; player: PlayerId }
    | { type: 'turnStarted'; player: PlayerId; index: number }
    | { type: 'turnEnded'; player: PlayerId }
    | { type: 'gameOver'; winner: PlayerId; condition: 'release' | 'lastStanding' }
    | { type: 'rejected'; action: Action; reason: string }
    | { type: 'takenFromDiscard'; player: PlayerId; card: CardId; to: 'hand' | 'deck' }
  )

export type DiscardReason =
  | 'releaseCost'
  | 'handLimit'
  | 'attackSpent'
  | 'defenceSpent'
  | 'destroyed'
  | 'neutralized'
  | 'trigger'
  | 'effect'

export type DefenceEffect = 'cancel' | 'return' | 'reflect' | 'take'

export type EventType = Event['type']
