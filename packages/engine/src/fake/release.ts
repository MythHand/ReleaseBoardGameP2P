import type { Action, Target } from '../actions'
import { rulesFor } from '../cards'
import type { Reduction } from '../engine'
import type { CardInstance, CardUid, GameState, PlayerId, ReleaseSlot } from '../state'
import { attackTargets, createLog, type Log, reject, setHand } from './core'
import { openPickFromDiscard } from './discard'
import { openHandAttack, resolveDdos } from './handAttacks'
import { playableFor } from './project'
import { openWindow } from './window'

const SLOTS: readonly ReleaseSlot[] = ['frontend', 'backend', 'database']

// Structural target equality — targets are small value objects, so a field-wise
// comparison is cheaper and clearer than serializing.
const sameTarget = (a: Target, b: Target): boolean =>
  a.kind === b.kind &&
  ('player' in a ? a.player === (b as { player: string }).player : true) &&
  ('slot' in a ? a.slot === (b as { slot: string }).slot : true) &&
  ('card' in a ? a.card === (b as { card: string }).card : true)

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
  at: number,
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
  const decided = checkWin(placed, log)
  // A Code Review-protected release cannot be attacked at all, so no window opens
  // (understanding.md §8). Neither does one on a game that just ended.
  if (cr || decided.over) return decided
  return openWindow(decided, log, { player, slot, card: card.uid }, 1, at)
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

  // Code Review is a release-only combo; Sudo rides along with any card whose
  // rules mark it sudo-capable (currently the attacks and Git Cherry-pick).
  let codeReview: CardUid | undefined
  let sudoCombo: CardInstance | undefined
  if (action.combo !== undefined) {
    const partner = hand.find((c) => c.uid === action.combo)
    if (!partner) return reject(state, action, 'you do not hold the combo card')
    if (partner.id === 'support-sudo') {
      if (rules.sudo !== true) return reject(state, action, 'that card has no sudo variant')
      sudoCombo = partner
    } else if (partner.id !== 'support-code-review') {
      return reject(state, action, 'that card cannot be comboed here')
    } else if (rules.kind === 'release') {
      codeReview = partner.uid
    } else {
      return reject(state, action, 'Code Review only pairs with a release')
    }
  }

  const log = createLog(state.eventSeq)

  if (rules.kind === 'operation') {
    const withoutCards = setHand(
      state,
      action.player,
      hand.filter((c) => c.uid !== action.card && c.uid !== sudoCombo?.uid),
    )
    return {
      state: openPickFromDiscard(withoutCards, log, action.player, card, sudoCombo, false),
      events: log.events,
    }
  }

  if (rules.kind === 'release') {
    if (state.setup.releaseCond === 'easy') {
      const next = placeRelease(state, log, action.at, action.player, action.card, codeReview)
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

  if (rules.kind === 'attack') {
    if (!action.target) return reject(state, action, 'that card needs a target')
    if (
      !attackTargets(state, action.player, card.id).some((t) =>
        sameTarget(t, action.target as Target),
      )
    ) {
      return reject(state, action, 'illegal target')
    }
    let sudo = false
    if (action.combo !== undefined) {
      const partner = hand.find((c) => c.uid === action.combo)
      if (partner?.id !== 'support-sudo') return reject(state, action, 'invalid sudo combo')
      if (!rules.sudo) return reject(state, action, 'that card has no sudo effect')
      sudo = true
    }
    const spentCards = hand.filter((c) => c.uid === action.card || c.uid === action.combo)
    const spent = setHand(
      state,
      action.player,
      hand.filter((c) => !spentCards.includes(c)),
    )

    // DDoS resolves immediately: it is not answerable by a defence card.
    if (card.id === 'attack-ddos') {
      const banked = {
        ...spent,
        decks: { ...spent.decks, discard: [...spent.decks.discard, ...spentCards] },
      }
      return { state: resolveDdos(banked, log, action.player, action.target), events: log.events }
    }

    if (action.target.kind !== 'player') return reject(state, action, 'illegal target')

    const sudoOnly = spentCards.filter((c) => c.uid === action.combo)
    const withSudoSpent = {
      ...spent,
      decks: { ...spent.decks, discard: [...spent.decks.discard, ...sudoOnly] },
    }
    return {
      state: openHandAttack(
        withSudoSpent,
        log,
        action.player,
        card,
        action.target.player,
        sudo,
        action.at,
      ),
      events: log.events,
    }
  }

  // Nothing else is a standalone play.
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
    state: placeRelease(banked, log, action.at, action.player, pending.release, pending.codeReview),
    events: log.events,
  }
}
