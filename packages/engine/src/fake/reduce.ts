import type { Action, Target } from '../actions'
import { rulesFor } from '../cards'
import type { Reduction } from '../engine'
import { shuffle } from '../rng'
import type { CardUid, GameState, PlayerId } from '../state'
import { onAttack, onDefend } from './attacks'
import {
  attackTargets,
  createLog,
  endTurn,
  handLimitFor,
  isWellFormedAction,
  type Log,
  nextSeat,
  reject,
  setHand,
} from './core'
import { onPickFromDiscard } from './discard'
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

// Rules decisions answer 7, first case: with no draw cards left anywhere, the
// discard is taken, shuffled, and becomes a single new draw pile. Without it the
// deck is finite and the draw is mandatory, so an ordinary game does not end —
// it stops, with `onPush` refusing the turn and every pile empty.
//
// Deterministic like every other shuffle here: keyed on (seed, cursor) and the
// advanced cursor written back, so each peer recomputes the same pile from the
// same serialized state rather than agreeing over the wire.
//
// Answer 7's second case — one pile of several running out, which removes that
// pile rather than recycling anything — is not here. It cannot be reached while
// `main` only ever holds one pile, and the split that creates the others is
// slice A of #61.
function refillFromDiscard(state: GameState, log: Log): GameState {
  if (state.decks.main.some((pile) => pile.length > 0)) return state
  // Nothing to recycle: every card is in a hand or a release zone. The draw
  // stays rejected, which is honest, rather than being handed an empty pile.
  if (state.decks.discard.length === 0) return state

  const { items, cursor } = shuffle(state.decks.discard, state.seed, state.rngCursor)
  log.add({ type: 'deckReshuffled', cards: items.length })
  return {
    ...state,
    decks: { ...state.decks, main: [items], discard: [] },
    rngCursor: cursor,
  }
}

function onDraw(state: GameState, action: Action & { type: 'DRAW' }): Reduction {
  if (state.over) return reject(state, action, 'game is over')
  if (state.pending) return reject(state, action, 'a decision is pending')
  if (state.window) return reject(state, action, 'a reaction window is open')
  if (state.turn.player !== action.player) return reject(state, action, 'not your turn')
  if (state.turn.hasDrawn) return reject(state, action, 'already drew this turn')

  const log = createLog(state.eventSeq)
  // Before the emptiness check, so an exhausted table refills and the draw
  // proceeds in the same action rather than costing the player a turn.
  const filled = refillFromDiscard(state, log)

  const pileIndex = action.pile ?? 0
  const pile = filled.decks.main[pileIndex]
  // `state`, not `filled`: a rejected draw changes nothing, so a refill that
  // could not satisfy it is discarded along with its event.
  if (!pile || pile.length === 0) return reject(state, action, 'that pile is empty')

  const card = pile[0]
  const main = filled.decks.main.map((p, i) => (i === pileIndex ? p.slice(1) : p))

  // A trigger cannot stay private: it is revealed the moment it is drawn, and it
  // never reaches the drawer's hand.
  if (rulesFor(card.id)?.kind === 'trigger') {
    const base: GameState = {
      ...filled,
      decks: { ...filled.decks, main },
      turn: { ...filled.turn, hasDrawn: true },
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

  const withCard = setHand(filled, action.player, [...filled.players[action.player].hand, card])
  return {
    state: {
      ...withCard,
      decks: { ...withCard.decks, main },
      turn: { ...filled.turn, hasDrawn: true },
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
    case 'pickFromDiscard':
      return onPickFromDiscard(state, action)
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
