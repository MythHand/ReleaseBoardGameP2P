import type { Action, Target } from '../actions'
import { CARD_RULES } from '../cards'
import type { Reduction } from '../engine'
import { shuffle } from '../rng'
import type { CardInstance, GameState, HandAttackContext, PlayerId } from '../state'
import {
  bankToDiscard,
  createLog,
  DEFEND_MS,
  defencesFor,
  HAND_CHOICE_MS,
  type Log,
  reject,
  setHand,
} from './core'

const discard = (state: GameState, cards: CardInstance[]): GameState => bankToDiscard(state, cards)

// Opens a hand-scoped defence. The attack card has already left the attacker's
// hand; a successful defence simply means the theft never happens.
export function openHandAttack(
  state: GameState,
  log: Log,
  attacker: PlayerId,
  attack: CardInstance,
  target: PlayerId,
  sudo: boolean,
  combo: CardInstance | undefined,
  at: number,
): GameState {
  const attackedId = log.add({ type: 'attacked', attacker, card: attack.id, sudo, target })
  return {
    ...state,
    pending: {
      kind: 'defend',
      player: target,
      attacker,
      attack: attack.uid,
      attackId: attack.id,
      attackEventId: attackedId,
      sudo,
      ...(combo ? { combo } : {}),
      canDefendWith: defencesFor(state, target, sudo),
      openedAt: at,
      deadline: at + DEFEND_MS,
      scope: 'hand',
    },
    eventSeq: log.seq,
  }
}

// The host shuffles positions once, before offering the closed fan. A position
// is therefore a blind random selection; neither hand order nor private UIDs
// are exposed. Persisting slots makes reconnect/replay preserve the same fan.
export function openHandChoice(
  state: GameState,
  log: Log,
  from: PlayerId,
  to: PlayerId,
  context: HandAttackContext,
  at: number,
): GameState {
  const timing = { openedAt: at, deadline: at + HAND_CHOICE_MS }
  if (context.attack.id === 'attack-security-bug') {
    return {
      ...state,
      pending: { kind: 'requestCard', player: to, target: from, context, ...timing },
      eventSeq: log.seq,
    }
  }
  const hand = state.players[from].hand
  if (hand.length === 0) return finishHandAttack(state, log, context)
  const shuffled = shuffle(
    hand.map((c) => c.uid),
    state.seed,
    state.rngCursor,
  )
  return {
    ...state,
    rngCursor: shuffled.cursor,
    pending: {
      kind: 'stealCard',
      player: to,
      target: from,
      slots: shuffled.items,
      context,
      ...timing,
    },
    eventSeq: log.seq,
  }
}

function finishHandAttack(state: GameState, log: Log, context?: HandAttackContext): GameState {
  if (!context) return { ...state, pending: null, eventSeq: log.seq }
  const cards = [context.attack, ...(context.combo ? [context.combo] : [])]
  for (const card of cards)
    log.add(
      { type: 'discarded', player: context.owner, card: card.id, reason: 'attackSpent' },
      context.parent,
    )
  // …and the defence that reflected this attack leaves with it, after it and
  // under its own reason. The order is the one every other resolution already
  // banks in — the attacker's cards, then the defender's — so nothing that
  // reads these discards has to learn a second shape.
  const cover = context.cover
  if (cover)
    for (const card of cover.cards)
      log.add(
        { type: 'discarded', player: cover.player, card: card.id, reason: 'defenceSpent' },
        context.parent,
      )
  const leaving = [...cards, ...(cover?.cards ?? [])]
  return { ...discard(state, leaving), pending: null, eventSeq: log.seq }
}

export function onStealCard(state: GameState, action: Action & { type: 'RESOLVE' }): Reduction {
  const pending = state.pending
  if (pending?.kind !== 'stealCard') return reject(state, action, 'no blind selection pending')
  if (pending.player !== action.player) return reject(state, action, 'not your decision')
  const choice = action.choice
  if (
    choice.kind !== 'stealCard' ||
    !Number.isInteger(choice.index) ||
    choice.index < 0 ||
    choice.index >= pending.slots.length
  ) {
    return reject(state, action, 'invalid blind position')
  }
  const hand = state.players[pending.target].hand
  const card = hand.find((c) => c.uid === pending.slots[choice.index])
  if (!card) return reject(state, action, 'that position is no longer available')
  const log = createLog(state.eventSeq)
  log.add(
    {
      type: 'handTransfer',
      from: pending.target,
      to: pending.player,
      card: card.id,
      index: choice.index,
    },
    pending.context.parent,
  )
  const stripped = setHand(
    state,
    pending.target,
    hand.filter((c) => c.uid !== card.uid),
  )
  const moved = setHand(stripped, pending.player, [...stripped.players[pending.player].hand, card])
  return { state: finishHandAttack(moved, log, pending.context), events: log.events }
}

// DDoS: destroy a Monitoring, or bounce a release back to its owner's hand and
// freeze that instance for a round. It is the only card that reaches a release
// protected by Code Review — which is discarded rather than returned.
export function resolveDdos(
  state: GameState,
  log: Log,
  // Unused here — neither `monitoringDestroyed` nor `releaseReturned` records
  // who threw the DDoS. The thrower is reachable through `parent`, which names
  // the `attacked` event that carries `attacker`.
  _actor: PlayerId,
  target: Target,
  // The `attacked` this DDoS was logged as. The effect is where the thrower's
  // choice of target shows, and nothing ever answers a DDoS, so the effect is
  // what names the throw.
  parent?: number,
): GameState {
  if (target.kind === 'monitoring') {
    const mon = state.players[target.player].release.monitoring
    if (!mon) return { ...state, eventSeq: log.seq }
    const destroyedId = log.add(
      { type: 'monitoringDestroyed', player: target.player, card: mon.id },
      parent,
    )
    // The Monitoring goes to the discard, and the feed has to say so. It used
    // to be banked by a direct write, which left everything derived from the
    // feed a card behind the projection's discardCount — the board's heap had
    // a stand-in for exactly this. Parented to the destruction, the way
    // triggers.ts parents a destroyed release's spoils.
    log.add(
      { type: 'discarded', player: target.player, card: mon.id, reason: 'destroyed' },
      destroyedId,
    )
    const zone = { ...state.players[target.player].release }
    delete zone.monitoring
    return {
      ...discard(
        {
          ...state,
          players: {
            ...state.players,
            [target.player]: { ...state.players[target.player], release: zone },
          },
        },
        [mon],
      ),
      eventSeq: log.seq,
    }
  }

  if (target.kind !== 'release') return { ...state, eventSeq: log.seq }
  const released = state.players[target.player].release[target.slot]
  if (!released) return { ...state, eventSeq: log.seq }

  const returnedId = log.add(
    { type: 'releaseReturned', player: target.player, slot: target.slot, card: released.card.id },
    parent,
  )
  const zone = { ...state.players[target.player].release }
  delete zone[target.slot]
  const owner = state.players[target.player]
  const bounced: GameState = {
    ...state,
    players: {
      ...state.players,
      [target.player]: {
        ...owner,
        release: zone,
        hand: [...owner.hand, released.card],
        frozen: [...owner.frozen, released.card.uid],
      },
    },
  }
  // The release itself bounces to hand, but a Code Review under it does not
  // follow it there — it goes to the discard, and that was the second card
  // this function banked in silence.
  if (released.codeReview) {
    log.add(
      {
        type: 'discarded',
        player: target.player,
        card: released.codeReview.id,
        reason: 'destroyed',
      },
      returnedId,
    )
  }
  const cleaned = released.codeReview ? discard(bounced, [released.codeReview]) : bounced
  return { ...cleaned, eventSeq: log.seq }
}

export function onRequestCard(state: GameState, action: Action & { type: 'RESOLVE' }): Reduction {
  const pending = state.pending
  if (pending?.kind !== 'requestCard') return reject(state, action, 'no request pending')
  if (pending.player !== action.player) return reject(state, action, 'not your decision')
  const choice = action.choice
  if (choice.kind !== 'requestCard') return reject(state, action, 'wrong choice for this decision')
  if (typeof choice.card !== 'string' || !Object.hasOwn(CARD_RULES, choice.card)) {
    return reject(state, action, 'unknown requested card type')
  }

  const log = createLog(state.eventSeq)
  const held = state.players[pending.target].hand.filter((c) => c.id === choice.card)

  if (held.length === 0) {
    // A miss is public: everyone learns the guess was wrong.
    log.add({
      type: 'requested',
      attacker: pending.player,
      target: pending.target,
      card: choice.card,
      hit: false,
    })
    return { state: finishHandAttack(state, log, pending.context), events: log.events }
  }

  log.add({
    type: 'requested',
    attacker: pending.player,
    target: pending.target,
    card: choice.card,
    hit: true,
  })
  const card = held[0]
  log.add({
    type: 'handTransfer',
    from: pending.target,
    to: pending.player,
    card: card.id,
    publicCard: true,
  })
  const stripped = setHand(
    state,
    pending.target,
    state.players[pending.target].hand.filter((c) => c.uid !== card.uid),
  )
  const moved = setHand(stripped, pending.player, [...stripped.players[pending.player].hand, card])
  return { state: finishHandAttack(moved, log, pending.context), events: log.events }
}

export function onGiveCard(state: GameState, action: Action & { type: 'RESOLVE' }): Reduction {
  const pending = state.pending
  if (pending?.kind !== 'giveCard') return reject(state, action, 'no handover pending')
  if (pending.player !== action.player) return reject(state, action, 'not your decision')
  const choice = action.choice
  if (choice.kind !== 'giveCard') return reject(state, action, 'wrong choice for this decision')

  const hand = state.players[action.player].hand
  const card = hand.find((c) => c.uid === choice.card)
  if (!card || card.id !== pending.requested) {
    return reject(state, action, 'that is not the requested card')
  }

  const log = createLog(state.eventSeq)
  log.add({
    type: 'handTransfer',
    from: action.player,
    to: pending.attacker,
    card: card.id,
    publicCard: true,
  })
  const stripped = setHand(
    state,
    action.player,
    hand.filter((c) => c.uid !== choice.card),
  )
  const moved = setHand(stripped, pending.attacker, [
    ...stripped.players[pending.attacker].hand,
    card,
  ])
  return { state: finishHandAttack(moved, log, pending.context), events: log.events }
}
