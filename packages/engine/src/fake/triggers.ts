import type { Action, Choice } from '../actions'
import { rulesFor } from '../cards'
import type { Reduction } from '../engine'
import { randomAt } from '../rng'
import type { CardInstance, GameState, NeutralizeMethod, PlayerId, ReleaseSlot } from '../state'
import { createLog, endTurn, type Log, reject, setHand } from './core'

const SLOTS: readonly ReleaseSlot[] = ['frontend', 'backend', 'database']

const discard = (state: GameState, cards: CardInstance[]): GameState => ({
  ...state,
  decks: { ...state.decks, discard: [...state.decks.discard, ...cards] },
})

// The order the rules give: Debugger first, Monitoring second, sacrificing a
// release last — a player answers with the cheapest option they hold.
export function neutralizeOptions(state: GameState, player: PlayerId): NeutralizeMethod[] {
  const methods: NeutralizeMethod[] = []
  const me = state.players[player]
  if (me.hand.some((c) => c.id === 'protection-debugger')) methods.push('debugger')
  if (me.release.monitoring) methods.push('monitoring')
  if (SLOTS.some((slot) => me.release[slot])) methods.push('sacrifice')
  return methods
}

// Appends to `eliminated`, discards the hand and zone, and ends the game once
// only one living player remains.
export function eliminate(state: GameState, log: Log, player: PlayerId): GameState {
  const me = state.players[player]
  const zoneCards = SLOTS.flatMap((slot) => {
    const r = me.release[slot]
    return r ? [r.card, ...(r.codeReview ? [r.codeReview] : [])] : []
  })
  const monitoringCards = me.release.monitoring ? [me.release.monitoring] : []
  const spoils = [...me.hand, ...zoneCards, ...monitoringCards]

  log.add({ type: 'eliminated', player })

  const cleared: GameState = {
    ...discard(state, spoils),
    players: {
      ...state.players,
      [player]: { ...me, hand: [], release: {} },
    },
    eliminated: [...state.eliminated, player],
    pending: null,
    eventSeq: log.seq,
  }

  const living = cleared.seating.filter((id) => !cleared.eliminated.includes(id))
  if (living.length === 1) {
    log.add({ type: 'gameOver', winner: living[0], condition: 'lastStanding' })
    return { ...cleared, over: { winner: living[0], condition: 'lastStanding' }, eventSeq: log.seq }
  }
  return cleared
}

function destroySlot(state: GameState, log: Log, player: PlayerId, slot: ReleaseSlot): GameState {
  const me = state.players[player]
  const released = me.release[slot]
  if (!released) return { ...state, eventSeq: log.seq }
  const spoils = [released.card, ...(released.codeReview ? [released.codeReview] : [])]
  log.add({ type: 'releaseDestroyed', player, slot, card: released.card.id })
  const zone = { ...me.release }
  delete zone[slot]
  return {
    ...discard(
      { ...state, players: { ...state.players, [player]: { ...me, release: zone } } },
      spoils,
    ),
    eventSeq: log.seq,
  }
}

// Handles the two trigger ids. Neither card ever reaches the drawer's hand —
// it is revealed the instant it is drawn.
export function fireTrigger(
  state: GameState,
  log: Log,
  player: PlayerId,
  card: CardInstance,
  at: number,
): GameState {
  if (card.id === 'trigger-error-503') {
    log.add({ type: 'revealed', player, card: card.id })
    const discarded = discard(state, [card])
    const methods = neutralizeOptions(discarded, player)
    if (methods.length === 0) return eliminate(discarded, log, player)
    return {
      ...discarded,
      pending: { kind: 'neutralize503', player, methods },
      eventSeq: log.seq,
    }
  }

  // trigger-ai
  const events = state.decks.events
  const index = Math.floor(randomAt(state.seed, state.rngCursor) * events.length)
  const event = events[index]
  log.add({ type: 'aiRevealed', player, aiCard: card.id, eventCard: event.id })
  const remainingEvents = events.filter((_, i) => i !== index)
  const discarded = discard(state, [card])
  const drawn: GameState = {
    ...discarded,
    decks: { ...discarded.decks, events: remainingEvents },
    rngCursor: state.rngCursor + 1,
    eventSeq: log.seq,
  }
  const resolved = resolveAiEvent(drawn, log, player, event, at)
  return {
    ...resolved,
    decks: { ...resolved.decks, events: [...resolved.decks.events, event] },
    eventSeq: log.seq,
  }
}

// Routes both trigger decisions: neutralize503 and crush share the same set of
// methods and the same resolution machinery, differing only in what happens
// on the corresponding "no answer" path (elimination vs. destroying a slot).
export function onNeutralize(state: GameState, action: Action & { type: 'RESOLVE' }): Reduction {
  const pending = state.pending
  if (pending?.kind !== 'neutralize503' && pending?.kind !== 'crush') {
    return reject(state, action, 'no neutralize decision pending')
  }
  if (pending.player !== action.player) return reject(state, action, 'not your decision')
  const choice = action.choice as Extract<Choice, { kind: 'neutralize503' | 'crush' }>
  if (choice.kind !== pending.kind) return reject(state, action, 'wrong choice for this decision')
  if (!pending.methods.includes(choice.method)) {
    return reject(state, action, 'that method is not available')
  }

  const log = createLog(state.eventSeq)
  const player = action.player
  const hand = state.players[player].hand

  if (choice.method === 'debugger') {
    const dbg = hand.find((c) => c.id === 'protection-debugger')
    if (!dbg) return reject(state, action, 'you do not hold a Debugger')
    log.add({ type: 'neutralized', player, method: 'debugger' })
    const withoutDbg = setHand(
      state,
      player,
      hand.filter((c) => c.uid !== dbg.uid),
    )
    const banked: GameState = {
      ...withoutDbg,
      decks: { ...withoutDbg.decks, discard: [...withoutDbg.decks.discard, dbg] },
      pending: null,
      eventSeq: log.seq,
    }
    return { state: banked, events: log.events }
  }

  if (choice.method === 'monitoring') {
    const mon = state.players[player].release.monitoring
    if (!mon) return reject(state, action, 'you do not have a Monitoring')
    log.add({ type: 'neutralized', player, method: 'monitoring' })
    return { state: { ...state, pending: null, eventSeq: log.seq }, events: log.events }
  }

  // sacrifice
  if (!choice.card) return reject(state, action, 'sacrifice needs a release card')
  const slot = SLOTS.find((s) => state.players[player].release[s]?.card.uid === choice.card)
  if (!slot) return reject(state, action, 'you do not hold that release')
  log.add({ type: 'neutralized', player, method: 'sacrifice' })
  const destroyed = destroySlot(state, log, player, slot)
  return { state: { ...destroyed, pending: null, eventSeq: log.seq }, events: log.events }
}

// The fake's event set, each reusing existing machinery.
export function resolveAiEvent(
  state: GameState,
  log: Log,
  player: PlayerId,
  event: CardInstance,
  at: number,
): GameState {
  switch (event.id) {
    case 'ai-crush-frontend':
    case 'ai-crush-backend':
    case 'ai-crush-database': {
      const slot = event.id.replace('ai-crush-', '') as ReleaseSlot
      const methods = neutralizeOptions(state, player)
      if (methods.length === 0) return destroySlot(state, log, player, slot)
      return { ...state, pending: { kind: 'crush', player, slot, methods }, eventSeq: log.seq }
    }

    case 'ai-release-frontend':
    case 'ai-release-backend':
    case 'ai-release-database': {
      const slot = event.id.replace('ai-release-', '') as ReleaseSlot
      const me = state.players[player]
      if (me.release[slot]) return { ...state, eventSeq: log.seq }
      log.add({ type: 'released', player, slot, card: event.id })
      // A fresh instance, not `event` itself: the event card returns to its own
      // deck once this resolves, while the placed release stays on the board —
      // sharing one uid between the two would make the same card exist in two
      // places at once. The uid is also deliberately unrelated to the deck's
      // `release-<slot>#n` numbering, so it can never collide with a real
      // draw-pile card's uid in a projected view (see the privacy conformance
      // property in conformance.ts).
      const placed: CardInstance = { uid: `ai-event-release-${slot}-${player}`, id: event.id }
      return {
        ...state,
        players: {
          ...state.players,
          [player]: { ...me, release: { ...me.release, [slot]: { card: placed } } },
        },
        eventSeq: log.seq,
      }
    }

    case 'ai-monitoring': {
      const me = state.players[player]
      if (me.release.monitoring) return { ...state, eventSeq: log.seq }
      log.add({ type: 'placed', player, card: event.id })
      const placed: CardInstance = { uid: `ai-event-monitoring-${player}`, id: event.id }
      return {
        ...state,
        players: {
          ...state.players,
          [player]: { ...me, release: { ...me.release, monitoring: placed } },
        },
        eventSeq: log.seq,
      }
    }

    case 'ai-good-vibe-coding': {
      let next = state
      for (let i = 0; i < 2; i += 1) {
        const pile = next.decks.main[0]
        if (!pile || pile.length === 0) continue
        const top = pile[0]
        const main = next.decks.main.map((p, idx) => (idx === 0 ? p.slice(1) : p))
        if (rulesFor(top.id)?.kind === 'trigger') {
          next = fireTrigger({ ...next, decks: { ...next.decks, main } }, log, player, top, at)
        } else {
          next = setHand({ ...next, decks: { ...next.decks, main } }, player, [
            ...next.players[player].hand,
            top,
          ])
        }
      }
      return { ...next, eventSeq: log.seq }
    }

    case 'ai-bad-vibe-coding':
      return { ...state, pending: { kind: 'handLimit', player, excess: 1 }, eventSeq: log.seq }

    case 'ai-hallucination':
      return endTurn(state, log)

    case 'ai-error-503': {
      log.add({ type: 'revealed', player, card: event.id })
      const methods = neutralizeOptions(state, player)
      if (methods.length === 0) return eliminate(state, log, player)
      return { ...state, pending: { kind: 'neutralize503', player, methods }, eventSeq: log.seq }
    }

    default:
      return { ...state, eventSeq: log.seq }
  }
}
