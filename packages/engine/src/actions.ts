import type { CardId, CardUid, NeutralizeMethod, PlayerId, ReleaseSlot } from './state'

export type Target =
  | { kind: 'player'; player: PlayerId }
  | { kind: 'release'; player: PlayerId; slot: ReleaseSlot }
  | { kind: 'monitoring'; player: PlayerId }
  | { kind: 'card'; card: CardUid }
  // The first target that names something on the table rather than something a
  // player owns: Git Branch splits a pile, and with several out there the
  // player chooses which (rules decisions answer 3).
  | { kind: 'pile'; pile: number }

export type Choice =
  | { kind: 'discardForRelease'; card: CardUid }
  // null is an explicit "I could block this and I choose not to".
  // `combo` carries a Sudo played alongside the defence (sudo Rollback).
  // No slot rides along: a Works on my Machine reflection returns the effect as
  // it was aimed, at the attacker's release of the very type that was attacked,
  // so there is nothing for the defender to pick.
  | { kind: 'defend'; card: CardUid | null; combo?: CardUid }
  | { kind: 'neutralize503'; method: NeutralizeMethod; card?: CardUid }
  | { kind: 'crush'; method: NeutralizeMethod; card?: CardUid }
  // Security Bug names a card TYPE the opponent might hold — that is the bluff.
  | { kind: 'requestCard'; card: CardId }
  | { kind: 'giveCard'; card: CardUid }
  // An array: Memory Problem can leave a hand several cards over the limit.
  | { kind: 'handLimit'; cards: CardUid[] }
  // `toDeck` is the sudo second pick, placed on top of pile 0 unseen.
  | { kind: 'pickFromDiscard'; card: CardUid; toDeck?: CardUid }

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
