import type { Action } from '../actions'
import type { Reduction } from '../engine'
import type { CardUid, GameState, PlayerId } from '../state'
import { createLog, type Log, reject, takeBack } from './core'
import { combosFor, playableFor } from './project'
import { attackOut, canAttackWith, endSudoTime, respondersFor, SUDO_PARTNER_MS } from './window'

// WHAT IS PUT OUT AT THE CENTRE IS SEEN BY EVERYONE (resolution.md §1).
//
// A play that waits for something — a Sudo for its partner, a Code Review for
// its release, a release for its cost, an attack for its target — has its cards
// lying at the centre while the player decides, and the whole table sees them.
// Taking them back is seen too. None of this is a move: the cards stay in the
// hand, and the play is still whatever completes it.

const startable = (state: GameState, player: PlayerId): Set<CardUid> => {
  const combos = combosFor(state, player)
  return new Set([
    ...playableFor(state, player),
    ...canAttackWith(state, player),
    ...Object.keys(combos),
    ...Object.values(combos).flat(),
  ])
}

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

export function onShow(state: GameState, action: Action & { type: 'SHOW' }): Reduction {
  if (state.over) return reject(state, action, 'game is over')
  if (state.eliminated.includes(action.player)) return reject(state, action, 'you are out')
  const me = state.players[action.player]
  if (!me) return reject(state, action, 'unknown player')
  const card = me.hand.find((c) => c.uid === action.card)
  if (!card) return reject(state, action, 'you do not hold that card')
  if (me.shown.includes(action.card)) return reject(state, action, 'that card is already out')
  // THE TIME TO ATTACK A FRESH RELEASE: one attack is dealt with at a time
  // (resolution.md §1). Whoever reached the table first is the one; a card put
  // out after it, or while it is being dealt with, is refused and goes home.
  const w = state.window
  const responder = w != null && respondersFor(state, w.target.player).includes(action.player)
  if (responder) {
    if (state.pending) return reject(state, action, 'an attack is being dealt with')
    const out = attackOut(state)
    if (out && out !== action.player) return reject(state, action, 'another attack is out')
  }
  // ONLY A CARD ITS PLAYER COULD START A PLAY WITH NOW — the same answers the
  // board lights the fan by: a card playable on its own, an attack thrown at a
  // fresh release, a Sudo or Code Review with a partner, and that partner.
  // Anything else at the centre is another seat's card beside this one's (#168).
  if (!startable(state, action.player).has(action.card))
    return reject(state, action, 'that card cannot be played now')
  const log = createLog(state.eventSeq)
  const shown = show(state, log, action.player, [action.card])
  if (responder && w) {
    // An attack (or its Sudo) put out uses this chance to hit: the passes made on
    // it start over — a pass is only a mark (owner, 04.10), and a mark copied
    // into the new time would let the last pass close it over the card out.
    const using = { ...w, passed: [] }
    // A Sudo put out to attack with holds the time: its attack has its own span
    // to join it, and that is the time running now (owner, 02.10).
    const window =
      !w.held && card.id === 'support-sudo'
        ? {
            ...using,
            held: action.player,
            openedAt: action.at,
            deadline: action.at + SUDO_PARTNER_MS,
          }
        : using
    return { state: { ...shown, window }, events: log.events }
  }
  return { state: shown, events: log.events }
}

export function onTakeBack(state: GameState, action: Action & { type: 'TAKE_BACK' }): Reduction {
  const me = state.players[action.player]
  if (!me) return reject(state, action, 'unknown player')
  if (me.shown.length === 0) return reject(state, action, 'nothing is out at the centre')
  const log = createLog(state.eventSeq)
  // the Sudo holding the time goes home: its time ends with it
  if (state.window?.held === action.player)
    return { state: endSudoTime(state, log, action.at), events: log.events }
  return { state: takeBack(state, log, action.player), events: log.events }
}
