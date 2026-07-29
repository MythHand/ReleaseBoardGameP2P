import type { Action, Target } from '../actions'
import { rulesFor } from '../cards'
import type { Reduction } from '../engine'
import type { CardUid, GameState, PlayerId } from '../state'
import { onAttack, onDefend } from './attacks'
import {
  attackTargets,
  createLog,
  endTurn,
  handLimitFor,
  isWellFormedAction,
  nextSeat,
  reject,
  setHand,
} from './core'
import { onGiveCard, onRequestCard } from './handAttacks'
import { playableFor } from './project'
import { onDiscardForRelease, onPlay } from './release'
import { fireTrigger, onNeutralize } from './triggers'
import { onPass, onUnpass, onWindowExpired } from './window'

export { handLimitFor, nextSeat }

export function legalTargets(state: GameState, actor: PlayerId, card: CardUid): Target[] {
  if (!playableFor(state, actor).includes(card)) return []
  const held = state.players[actor].hand.find((c) => c.uid === card)
  if (!held) return []
  const rules = rulesFor(held.id)
  if (rules?.kind !== 'attack') return []
  return attackTargets(state, actor, held.id)
}

function onDraw(state: GameState, action: Action & { type: 'DRAW' }): Reduction {
  if (state.over) return reject(state, action, 'game is over')
  if (state.pending) return reject(state, action, 'a decision is pending')
  if (state.window) return reject(state, action, 'a reaction window is open')
  if (state.turn.player !== action.player) return reject(state, action, 'not your turn')
  if (state.turn.hasDrawn) return reject(state, action, 'already drew this turn')

  const pileIndex = action.pile ?? 0
  const pile = state.decks.main[pileIndex]
  if (!pile || pile.length === 0) return reject(state, action, 'that pile is empty')

  const card = pile[0]
  const main = state.decks.main.map((p, i) => (i === pileIndex ? p.slice(1) : p))
  const log = createLog(state.eventSeq)

  // A trigger cannot stay private: it is revealed the moment it is drawn, and it
  // never reaches the drawer's hand.
  if (rulesFor(card.id)?.kind === 'trigger') {
    const base: GameState = {
      ...state,
      decks: { ...state.decks, main },
      turn: { ...state.turn, hasDrawn: true },
    }
    log.add({
      type: 'drawn',
      player: action.player,
      pile: pileIndex,
      deckSize: main[pileIndex].length,
    })
    return { state: fireTrigger(base, log, action.player, card, action.at), events: log.events }
  }

  // Identity is private to the drawer.
  log.add({
    type: 'drawn',
    player: action.player,
    card: card.id,
    pile: pileIndex,
    deckSize: main[pileIndex].length,
    visibleTo: [action.player],
  })

  const withCard = setHand(state, action.player, [...state.players[action.player].hand, card])
  return {
    state: {
      ...withCard,
      decks: { ...withCard.decks, main },
      turn: { ...state.turn, hasDrawn: true },
      eventSeq: log.seq,
    },
    events: log.events,
  }
}

function onPush(state: GameState, action: Action & { type: 'PUSH' }): Reduction {
  if (state.over) return reject(state, action, 'game is over')
  if (state.pending) return reject(state, action, 'a decision is pending')
  if (state.window) return reject(state, action, 'a reaction window is open')
  if (state.turn.player !== action.player) return reject(state, action, 'not your turn')
  // The draw is mandatory, so a turn cannot be passed without it.
  if (!state.turn.hasDrawn) return reject(state, action, 'you must draw before pushing')

  const log = createLog(state.eventSeq)
  return { state: endTurn(state, log), events: log.events }
}

function onHandLimit(state: GameState, action: Action & { type: 'RESOLVE' }): Reduction {
  const pending = state.pending
  if (pending?.kind !== 'handLimit') return reject(state, action, 'no hand-limit decision pending')
  if (pending.player !== action.player) return reject(state, action, 'not your decision')
  const choice = action.choice
  if (choice.kind !== 'handLimit') return reject(state, action, 'wrong choice for this decision')
  // The entry guard only checks that `choice.kind` is a string, not this
  // variant's payload — a well-formed RESOLVE can still carry a handLimit
  // choice with a missing or malformed `cards` array.
  if (!Array.isArray(choice.cards)) return reject(state, action, 'malformed handLimit choice')
  if (choice.cards.length !== pending.excess) {
    return reject(state, action, `discard exactly ${pending.excess}`)
  }

  const hand = state.players[action.player].hand
  const doomed = new Set(choice.cards)
  if (choice.cards.some((uid) => !hand.some((c) => c.uid === uid))) {
    return reject(state, action, 'you do not hold that card')
  }

  const log = createLog(state.eventSeq)
  const discarded = hand.filter((c) => doomed.has(c.uid))
  for (const c of discarded) {
    log.add({ type: 'discarded', player: action.player, card: c.id, reason: 'handLimit' })
  }

  const kept = setHand(
    state,
    action.player,
    hand.filter((c) => !doomed.has(c.uid)),
  )
  const withDiscard: GameState = {
    ...kept,
    decks: { ...kept.decks, discard: [...kept.decks.discard, ...discarded] },
    pending: null,
  }
  return { state: endTurn(withDiscard, log), events: log.events }
}

function onResolve(state: GameState, action: Action & { type: 'RESOLVE' }): Reduction {
  switch (action.choice.kind) {
    case 'handLimit':
      return onHandLimit(state, action)
    case 'discardForRelease':
      return onDiscardForRelease(state, action)
    case 'defend':
      return onDefend(state, action)
    case 'requestCard':
      return onRequestCard(state, action)
    case 'giveCard':
      return onGiveCard(state, action)
    case 'neutralize503':
    case 'crush':
      return onNeutralize(state, action)
    // Every Choice variant is now handled above; this default only guards
    // against a malformed choice (any `kind` string) surviving deserialization.
    default:
      return reject(
        state,
        action,
        `unsupported choice: ${(action.choice as { kind: string }).kind}`,
      )
  }
}

export function reduce(state: GameState, action: Action): Reduction {
  // A malformed action (any shape survives JSON deserialization) is rejected
  // before any handler destructures it, so no handler needs its own guard.
  if (!isWellFormedAction(action)) {
    return reject(state, action, 'malformed action')
  }

  switch (action.type) {
    case 'DRAW':
      return onDraw(state, action)
    case 'PUSH':
      return onPush(state, action)
    case 'RESOLVE':
      return onResolve(state, action)
    case 'PLAY':
      return onPlay(state, action)
    case 'PASS':
      return onPass(state, action)
    case 'UNPASS':
      return onUnpass(state, action)
    case 'WINDOW_EXPIRED':
      return onWindowExpired(state, action)
    case 'ATTACK':
      return onAttack(state, action)
    default:
      return reject(
        state,
        action as Action,
        `unsupported action: ${String((action as Action)?.type)}`,
      )
  }
}
