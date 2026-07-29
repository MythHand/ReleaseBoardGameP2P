import type { Action, Target } from '../actions'
import { rulesFor } from '../cards'
import type { Reduction } from '../engine'
import type { CardUid, GameState, PlayerId, Setup } from '../state'
import { onAttack, onDefend } from './attacks'
import { createLog, isWellFormedAction, reject, setHand } from './core'
import { playableFor } from './project'
import { onDiscardForRelease, onPlay } from './release'
import { onPass, onUnpass, onWindowExpired } from './window'

const HAND_LIMITS: Record<string, number> = { '8bit': 8, memory: 5 }

export function handLimitFor(setup: Setup): number {
  return HAND_LIMITS[setup.handLimit] ?? Number.POSITIVE_INFINITY
}

export function nextSeat(state: GameState, from: PlayerId): PlayerId {
  const n = state.seating.length
  const start = state.seating.indexOf(from)
  for (let step = 1; step <= n; step += 1) {
    const candidate = state.seating[(start + step) % n]
    if (!state.eliminated.includes(candidate)) return candidate
  }
  // The caller checks the last-standing condition before rotating, so this is
  // unreachable in practice; returning `from` keeps reduce total.
  return from
}

export function legalTargets(state: GameState, actor: PlayerId, card: CardUid): Target[] {
  if (!playableFor(state, actor).includes(card)) return []
  const held = state.players[actor].hand.find((c) => c.uid === card)
  if (!held) return []
  const rules = rulesFor(held.id)
  if (rules?.kind !== 'attack') return []

  const others = state.seating.filter((id) => id !== actor && !state.eliminated.includes(id))

  // DDoS does not touch a bare release or a hand: it destroys a Monitoring or
  // returns a release (protected or not) to its owner's hand.
  if (held.id === 'attack-ddos') {
    const targets: Target[] = []
    for (const id of others) {
      if (state.players[id].release.monitoring) targets.push({ kind: 'monitoring', player: id })
      for (const slot of ['frontend', 'backend', 'database'] as const) {
        if (state.players[id].release[slot]) targets.push({ kind: 'release', player: id, slot })
      }
    }
    return targets
  }

  // The other attacks, played on your own turn, take from a hand.
  return others.map((id) => ({ kind: 'player', player: id }) as Target)
}

// Ends the turn, or holds it open when the hand is over the mode's limit.
function endTurn(state: GameState, log: ReturnType<typeof createLog>): GameState {
  const me = state.turn.player
  const limit = handLimitFor(state.setup)
  const excess = state.players[me].hand.length - limit
  if (excess > 0) {
    return { ...state, pending: { kind: 'handLimit', player: me, excess }, eventSeq: log.seq }
  }
  log.add({ type: 'turnEnded', player: me })
  const next = nextSeat(state, me)
  log.add({ type: 'turnStarted', player: next, index: state.turn.index + 1 })
  return {
    ...state,
    turn: { player: next, index: state.turn.index + 1, hasDrawn: false, releasesPlayed: 0 },
    pending: null,
    eventSeq: log.seq,
  }
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
  // Identity is private to the drawer. Task 10 replaces this for trigger cards,
  // which must be revealed to everyone the moment they are drawn.
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
    // Later tasks add the remaining decisions. Until then an unimplemented choice
    // is rejected rather than silently ignored.
    default:
      return reject(state, action, `unsupported choice: ${action.choice.kind}`)
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
