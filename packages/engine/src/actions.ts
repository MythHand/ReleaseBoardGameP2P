import type { CardId, CardUid, NeutralizeMethod, PlayerId, ReleaseSlot } from './state'

export type Target =
  | { kind: 'player'; player: PlayerId }
  | { kind: 'release'; player: PlayerId; slot: ReleaseSlot }
  | { kind: 'monitoring'; player: PlayerId }
  | { kind: 'card'; card: CardUid }

export type Choice =
  | { kind: 'discardForRelease'; card: CardUid }
  // null is an explicit "I could block this and I choose not to".
  | { kind: 'defend'; card: CardUid | null }
  | { kind: 'neutralize503'; method: NeutralizeMethod; card?: CardUid }
  | { kind: 'crush'; method: NeutralizeMethod; card?: CardUid }
  // Security Bug names a card TYPE the opponent might hold — that is the bluff.
  | { kind: 'requestCard'; card: CardId }
  | { kind: 'giveCard'; card: CardUid }
  // An array: Memory Problem can leave a hand several cards over the limit.
  | { kind: 'handLimit'; cards: CardUid[] }

export type Action =
  | { type: 'DRAW'; player: PlayerId; pile?: number; at: number }
  | {
      type: 'PLAY'
      player: PlayerId
      card: CardUid
      target?: Target
      combo?: CardUid
      at: number
    }
  | { type: 'PUSH'; player: PlayerId; at: number }
  | { type: 'ATTACK'; player: PlayerId; card: CardUid; combo?: CardUid; at: number }
  | { type: 'PASS'; player: PlayerId; at: number }
  | { type: 'UNPASS'; player: PlayerId; at: number }
  | { type: 'WINDOW_EXPIRED'; at: number }
  | { type: 'RESOLVE'; player: PlayerId; choice: Choice; at: number }

export type ActionType = Action['type']
