import type { Action } from '../actions'
import type { Reduction } from '../engine'
import type { CardUid, GameState, PlayerId } from '../state'
import { createLog, type Log, reject } from './core'

// WHAT IS PUT OUT AT THE CENTRE IS SEEN BY EVERYONE (resolution.md §1).
//
// A play that waits for something — a Sudo for its partner, a Code Review for
// its release, a release for its cost, an attack for its target — has its cards
// lying at the centre while the player decides, and the whole table sees them.
// Taking them back is seen too. None of this is a move: the cards stay in the
// hand, and the play is still whatever completes it.

const withShown = (state: GameState, player: PlayerId, shown: CardUid[]): GameState => ({
  ...state,
  players: { ...state.players, [player]: { ...state.players[player], shown } },
})

/** Put these cards of the player's hand out at the centre — the ones not out already. */
export function show(state: GameState, log: Log, player: PlayerId, uids: CardUid[]): GameState {
  const me = state.players[player]
  const fresh = me.hand.filter((c) => uids.includes(c.uid) && !me.shown.includes(c.uid))
  if (fresh.length === 0) return state
  for (const card of fresh) log.add({ type: 'shown', player, card: card.id })
  return {
    ...withShown(state, player, [...me.shown, ...fresh.map((c) => c.uid)]),
    eventSeq: log.seq,
  }
}

/** Everything the player has put out goes back into the hand, in everyone's view. */
export function takeBack(state: GameState, log: Log, player: PlayerId): GameState {
  const me = state.players[player]
  if (me.shown.length === 0) return state
  const cards = me.shown.flatMap((uid) => me.hand.find((c) => c.uid === uid)?.id ?? [])
  if (cards.length > 0) log.add({ type: 'takenBack', player, cards })
  return { ...withShown(state, player, []), eventSeq: log.seq }
}

export function onShow(state: GameState, action: Action & { type: 'SHOW' }): Reduction {
  if (state.over) return reject(state, action, 'game is over')
  if (state.eliminated.includes(action.player)) return reject(state, action, 'you are out')
  const me = state.players[action.player]
  if (!me) return reject(state, action, 'unknown player')
  if (!me.hand.some((c) => c.uid === action.card))
    return reject(state, action, 'you do not hold that card')
  if (me.shown.includes(action.card)) return reject(state, action, 'that card is already out')
  const log = createLog(state.eventSeq)
  return { state: show(state, log, action.player, [action.card]), events: log.events }
}

export function onTakeBack(state: GameState, action: Action & { type: 'TAKE_BACK' }): Reduction {
  const me = state.players[action.player]
  if (!me) return reject(state, action, 'unknown player')
  if (me.shown.length === 0) return reject(state, action, 'nothing is out at the centre')
  const log = createLog(state.eventSeq)
  return { state: takeBack(state, log, action.player), events: log.events }
}
