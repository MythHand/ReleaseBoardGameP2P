import type { Action } from '../actions'
import type { Reduction } from '../engine'
import type { CardInstance, CardUid, GameState, HandAttackContext, PlayerId } from '../state'
import { createLog, type Log, reject, setHand } from './core'
import { finishHandAttack } from './handAttacks'
import { onCancelRelease } from './release'

const toHand = (state: GameState, player: PlayerId, cards: CardInstance[]): GameState =>
  setHand(state, player, [...state.players[player].hand, ...cards])

function logBack(log: Log, player: PlayerId, cards: CardInstance[]): void {
  if (cards.length > 0) log.add({ type: 'takenBack', player, cards: cards.map((c) => c.id) })
}

// A hand attack's cards live on the pending's context, not in the discard. The
// attack goes back to its owner. When the pending is owed by the defender of a
// reflected attack (Works on my Machine), it is the defender's cover that goes
// back to them, and the attack — already answered — is finished as spent.
function abandonHandAttack(state: GameState, player: PlayerId, context: HandAttackContext) {
  const log = createLog(state.eventSeq)
  const cover = context.cover
  if (cover && cover.player === player) {
    logBack(log, player, cover.cards)
    const withCover = toHand(state, player, cover.cards)
    const { cover: _gone, ...bare } = context
    return { state: finishHandAttack(withCover, log, bare), events: log.events }
  }
  const cards = [context.attack, ...(context.combo ? [context.combo] : [])]
  logBack(log, context.owner, cards)
  const back = toHand(state, context.owner, cards)
  return { state: { ...back, pending: null, eventSeq: log.seq }, events: log.events }
}

// The card (and its Sudo) was banked when the play opened its decision; pull
// those uids out of the discard again. A pending saved before `spent` existed
// has no uids to name, so it is cleared and the cards stay spent.
function abandonFromDiscard(state: GameState, player: PlayerId, spent: CardUid[] | undefined) {
  const log = createLog(state.eventSeq)
  const uids = new Set(spent ?? [])
  const back = state.decks.discard.filter((c) => uids.has(c.uid))
  logBack(log, player, back)
  const withHand = toHand(state, player, back)
  return {
    state: {
      ...withHand,
      decks: { ...withHand.decks, discard: withHand.decks.discard.filter((c) => !uids.has(c.uid)) },
      pending: null,
      eventSeq: log.seq,
    },
    events: log.events,
  }
}

// Keeper-only: the seat owing a decision raised by a card it played is gone, so
// the card goes back to its hand rather than the decision being guessed.
export function onAbandon(state: GameState, action: Action & { type: 'ABANDON' }): Reduction {
  const pending = state.pending
  if (!pending || pending.kind === 'systemUpgrade' || pending.player !== action.player) {
    return reject(state, action, 'nothing to abandon')
  }
  switch (pending.kind) {
    case 'discardForRelease':
      return onCancelRelease(state, {
        type: 'RESOLVE',
        player: action.player,
        choice: { kind: 'cancelRelease' },
        at: action.at,
      })
    case 'stealCard':
      return abandonHandAttack(state, action.player, pending.context)
    case 'requestCard':
      // A legacy save whose requestCard has no `context` cannot be abandoned:
      // its absent chooser is waited for instead (ruling R5).
      if (!pending.context) return reject(state, action, 'nothing to abandon')
      return abandonHandAttack(state, action.player, pending.context)
    case 'reorderTop':
      return abandonFromDiscard(state, action.player, pending.spent)
    case 'pickFromDiscard':
      if (pending.source.startsWith('ai-')) return reject(state, action, 'nothing to abandon')
      return abandonFromDiscard(state, action.player, pending.spent)
    default:
      return reject(state, action, 'nothing to abandon')
  }
}
