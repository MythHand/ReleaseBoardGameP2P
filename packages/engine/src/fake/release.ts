import type { Action } from '../actions'
import { rulesFor } from '../cards'
import type { Reduction } from '../engine'
import type { CardUid, GameState, PlayerId, ReleaseSlot } from '../state'
import { createLog, type Log, reject, setHand } from './core'
import { playableFor } from './project'

const SLOTS: readonly ReleaseSlot[] = ['frontend', 'backend', 'database']

// Three different release types in one zone ends the game immediately.
export function checkWin(state: GameState, log: Log): GameState {
  for (const id of state.seating) {
    if (state.eliminated.includes(id)) continue
    if (SLOTS.every((slot) => state.players[id].release[slot])) {
      log.add({ type: 'gameOver', winner: id, condition: 'release' })
      return { ...state, over: { winner: id, condition: 'release' }, eventSeq: log.seq }
    }
  }
  return { ...state, eventSeq: log.seq }
}

export function placeRelease(
  state: GameState,
  log: Log,
  player: PlayerId,
  release: CardUid,
  codeReview?: CardUid,
): GameState {
  const hand = state.players[player].hand
  const card = hand.find((c) => c.uid === release)
  if (!card) return { ...state, eventSeq: log.seq }
  const slot = rulesFor(card.id)?.slot as ReleaseSlot
  const cr = codeReview ? hand.find((c) => c.uid === codeReview) : undefined

  log.add({ type: 'released', player, slot, card: card.id, ...(cr ? { codeReview: cr.id } : {}) })

  const withHand = setHand(
    state,
    player,
    hand.filter((c) => c.uid !== release && c.uid !== codeReview),
  )
  const placed: GameState = {
    ...withHand,
    players: {
      ...withHand.players,
      [player]: {
        ...withHand.players[player],
        release: {
          ...withHand.players[player].release,
          [slot]: { card, ...(cr ? { codeReview: cr } : {}) },
        },
      },
    },
    turn: { ...state.turn, releasesPlayed: state.turn.releasesPlayed + 1 },
    pending: null,
  }
  // Task 8 opens the reaction window here when there is no Code Review.
  return checkWin(placed, log)
}

export function onPlay(state: GameState, action: Action & { type: 'PLAY' }): Reduction {
  // playableFor already covers game-over, a pending decision, an open window, turn
  // ownership, freezing, the release cap and the occupied-slot rule — one
  // membership check instead of a stack of duplicated guards that could disagree.
  if (!playableFor(state, action.player).includes(action.card)) {
    return reject(state, action, 'that card is not playable right now')
  }

  const hand = state.players[action.player].hand
  const card = hand.find((c) => c.uid === action.card)
  if (!card) return reject(state, action, 'you do not hold that card')
  const rules = rulesFor(card.id)
  if (!rules) return reject(state, action, 'unknown card')

  // Code Review is the only combo a release accepts, and only at play time.
  let codeReview: CardUid | undefined
  if (action.combo !== undefined) {
    const partner = hand.find((c) => c.uid === action.combo)
    if (!partner) return reject(state, action, 'you do not hold the combo card')
    if (partner.id !== 'support-code-review') {
      return reject(state, action, 'that card cannot be comboed here')
    }
    if (rules.kind !== 'release') {
      return reject(state, action, 'Code Review only pairs with a release')
    }
    codeReview = partner.uid
  }

  const log = createLog(state.eventSeq)

  if (rules.kind === 'release') {
    if (state.setup.releaseCond === 'easy') {
      const next = placeRelease(state, log, action.player, action.card, codeReview)
      return { state: next, events: log.events }
    }
    // The cost is a second card, so a lone release is unplayable.
    const spare = hand.filter((c) => c.uid !== action.card && c.uid !== codeReview)
    if (spare.length === 0) return reject(state, action, 'no card left to pay the release cost')
    return {
      state: {
        ...state,
        pending: {
          kind: 'discardForRelease',
          player: action.player,
          release: action.card,
          ...(codeReview ? { codeReview } : {}),
        },
      },
      events: [],
    }
  }

  if (card.id === 'protection-monitoring') {
    log.add({ type: 'placed', player: action.player, card: card.id })
    const withHand = setHand(
      state,
      action.player,
      hand.filter((c) => c.uid !== action.card),
    )
    return {
      state: {
        ...withHand,
        players: {
          ...withHand.players,
          [action.player]: {
            ...withHand.players[action.player],
            release: { ...withHand.players[action.player].release, monitoring: card },
          },
        },
        eventSeq: log.seq,
      },
      events: log.events,
    }
  }

  // Attacks route through Task 9; nothing else is a standalone play.
  return reject(state, action, `cannot play ${card.id} this way`)
}

export function onDiscardForRelease(
  state: GameState,
  action: Action & { type: 'RESOLVE' },
): Reduction {
  const pending = state.pending
  if (pending?.kind !== 'discardForRelease') return reject(state, action, 'no release cost pending')
  if (pending.player !== action.player) return reject(state, action, 'not your decision')
  const choice = action.choice
  if (choice.kind !== 'discardForRelease') {
    return reject(state, action, 'wrong choice for this decision')
  }
  // Neither the release nor a comboed Code Review can pay for the release.
  if (choice.card === pending.release || choice.card === pending.codeReview) {
    return reject(state, action, 'that card is part of the release')
  }
  const hand = state.players[action.player].hand
  const paid = hand.find((c) => c.uid === choice.card)
  if (!paid) return reject(state, action, 'you do not hold that card')

  const log = createLog(state.eventSeq)
  log.add({ type: 'discarded', player: action.player, card: paid.id, reason: 'releaseCost' })

  const withoutPaid = setHand(
    state,
    action.player,
    hand.filter((c) => c.uid !== choice.card),
  )
  const banked: GameState = {
    ...withoutPaid,
    decks: { ...withoutPaid.decks, discard: [...withoutPaid.decks.discard, paid] },
  }
  return {
    state: placeRelease(banked, log, action.player, pending.release, pending.codeReview),
    events: log.events,
  }
}
