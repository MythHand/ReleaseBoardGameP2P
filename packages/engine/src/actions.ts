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
  | { kind: 'stealCard'; index: number }
  // An array: Memory Problem can leave a hand several cards over the limit.
  | { kind: 'handLimit'; cards: CardUid[] }
  // `toDeck` is the sudo second pick, placed on top of pile 0 unseen.
  | { kind: 'pickFromDiscard'; card: CardUid; toDeck?: CardUid }
  // The order the player committed, per pile: index 0 becomes the new top.
  // Validated as an exact permutation of what the pending offered.
  | { kind: 'reorderTop'; order: { pile: number; cards: CardUid[] }[] }
  // System Upgrade. `upgradeDiscard` comes from a seat on the roster;
  // `upgradeTake` from the actor, once every seat has answered and sudo gives
  // them the pick.
  | { kind: 'upgradeDiscard'; card: CardUid }
  | { kind: 'upgradeTake'; card: CardUid }
  // Taking a release back before its cost is paid. The release stood at the
  // centre in everyone's view, so taking it back is seen too (`takenBack`).
  | { kind: 'cancelRelease' }

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
  | { type: 'WINDOW_EXPIRED'; at: number }
  // Keeper-only, like WINDOW_EXPIRED: starts the turn's inactivity clock when
  // no committed action has stamped one — in practice exactly once, for the
  // first turn, because createGame carries no timestamp to stamp it from.
  | { type: 'CLOCK_STARTED'; at: number }
  | { type: 'RESOLVE'; player: PlayerId; choice: Choice; at: number }
  // What the table sees while a play is being made (resolution.md §1): a card
  // of one's own hand put out at the centre, and everything put out taken back.
  // Neither is a move — the card stays in the hand and the play is still the
  // PLAY/ATTACK/RESOLVE that completes it.
  | { type: 'SHOW'; player: PlayerId; card: CardUid; at: number }
  | { type: 'TAKE_BACK'; player: PlayerId; at: number }

export type ActionType = Action['type']
