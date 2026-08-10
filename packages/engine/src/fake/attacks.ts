import type { Action, Choice } from '../actions'
import { RELEASE_ATTACKS, rulesFor } from '../cards'
import type { Reduction } from '../engine'
import type { CardInstance, GameState, Pending, PlayerId, ReleaseSlot } from '../state'
import type { PendingView } from '../view'
import { createLog, DEFEND_MS, defencesFor, type Log, reject, setHand } from './core'
import { stealRandom } from './handAttacks'
import { closeWindow, openWindow, respondersFor } from './window'

const SLOTS: readonly ReleaseSlot[] = ['frontend', 'backend', 'database']

const discard = (state: GameState, cards: CardInstance[]): GameState => ({
  ...state,
  decks: { ...state.decks, discard: [...state.decks.discard, ...cards] },
})

function clearSlot(state: GameState, player: PlayerId, slot: ReleaseSlot): GameState {
  const zone = { ...state.players[player].release }
  delete zone[slot]
  return {
    ...state,
    players: { ...state.players, [player]: { ...state.players[player], release: zone } },
  }
}

// Destroy a release, or hand it to `stealer` when the attack was a Security Bug.
function takeRelease(
  state: GameState,
  log: Log,
  owner: PlayerId,
  slot: ReleaseSlot,
  stealer: PlayerId | null,
  parent?: number,
): GameState {
  const released = state.players[owner].release[slot]
  if (!released) return { ...state, eventSeq: log.seq }
  const spoils = [released.card, ...(released.codeReview ? [released.codeReview] : [])]
  const cleared = clearSlot(state, owner, slot)

  // Security Bug takes the release for itself — unless that slot is occupied, in
  // which case the stolen release is discarded instead.
  if (stealer && !cleared.players[stealer].release[slot]) {
    log.add(
      { type: 'releaseStolen', from: owner, to: stealer, slot, card: released.card.id },
      parent,
    )
    const withCodeReviewGone = released.codeReview
      ? discard(cleared, [released.codeReview])
      : cleared
    return {
      ...withCodeReviewGone,
      players: {
        ...withCodeReviewGone.players,
        [stealer]: {
          ...withCodeReviewGone.players[stealer],
          release: {
            ...withCodeReviewGone.players[stealer].release,
            [slot]: { card: released.card },
          },
        },
      },
      eventSeq: log.seq,
    }
  }

  log.add({ type: 'releaseDestroyed', player: owner, slot, card: released.card.id }, parent)
  return { ...discard(cleared, spoils), eventSeq: log.seq }
}

export function onAttack(state: GameState, action: Action & { type: 'ATTACK' }): Reduction {
  const w = state.window
  if (!w) return reject(state, action, 'no reaction window is open')
  if (state.pending) return reject(state, action, 'a decision is pending')
  if (!respondersFor(state, w.target.player).includes(action.player)) {
    return reject(state, action, 'you cannot respond to this window')
  }
  const hand = state.players[action.player].hand
  const card = hand.find((c) => c.uid === action.card)
  if (!card) return reject(state, action, 'you do not hold that card')
  if (!RELEASE_ATTACKS.has(card.id))
    return reject(state, action, 'that card cannot attack a release')

  // A Sudo rides along as one action and must actually be held.
  let sudo = false
  if (action.combo !== undefined) {
    const partner = hand.find((c) => c.uid === action.combo)
    if (partner?.id !== 'support-sudo') {
      return reject(state, action, 'invalid sudo combo')
    }
    if (!rulesFor(card.id)?.sudo) return reject(state, action, 'that card has no sudo effect')
    sudo = true
  }

  const log = createLog(state.eventSeq)
  log.add({
    type: 'attacked',
    attacker: action.player,
    card: card.id,
    sudo,
    target: w.target.player,
  })

  // The attack leaves the hand now; where it ends up depends on the defence.
  const spent = setHand(
    state,
    action.player,
    hand.filter((c) => c.uid !== action.card && c.uid !== action.combo),
  )
  const sudoCard = action.combo ? hand.find((c) => c.uid === action.combo) : undefined

  return {
    state: {
      ...(sudoCard ? discard(spent, [sudoCard]) : spent),
      pending: {
        kind: 'defend',
        player: w.target.player,
        attacker: action.player,
        attack: card.uid,
        attackId: card.id,
        sudo,
        canDefendWith: defencesFor(state, w.target.player, sudo),
        openedAt: action.at,
        deadline: action.at + DEFEND_MS,
        scope: 'release',
      },
      eventSeq: log.seq,
    },
    events: log.events,
  }
}

// A hand attack's defence: the attacker's own turn, no reaction window. A miss
// steals (or, for Security Bug, opens the request pending); a hit resolves
// per the defence's own effect — cancel, return, or reflect (see below) — and
// clears the pending either way, since there is no release to spare and thus
// no window to reopen.
function onHandDefend(
  state: GameState,
  pending: Extract<Pending, { kind: 'defend' }>,
  action: Action & { type: 'RESOLVE' },
): Reduction {
  const choice = action.choice as Extract<Choice, { kind: 'defend' }>
  const log = createLog(state.eventSeq)
  const attacker = pending.attacker
  const attackCard: CardInstance = { uid: pending.attack, id: pending.attackId }

  if (choice.card === null) {
    log.add({ type: 'tookHit', player: action.player })
    const spent = discard({ ...state, pending: null }, [attackCard])
    if (attackCard.id === 'attack-security-bug') {
      return {
        state: {
          ...spent,
          pending: { kind: 'requestCard', player: attacker, target: action.player },
          eventSeq: log.seq,
        },
        events: log.events,
      }
    }
    return { state: stealRandom(spent, log, action.player, attacker), events: log.events }
  }

  if (!pending.canDefendWith.includes(choice.card)) {
    return reject(state, action, 'that card cannot defend this attack')
  }
  const hand = state.players[action.player].hand
  const defence = hand.find((c) => c.uid === choice.card)
  if (!defence) return reject(state, action, 'you do not hold that card')

  // sudo Rollback: the defender keeps the attacking card instead of returning it.
  let sudoDefence = false
  if (choice.combo !== undefined) {
    const partner = hand.find((c) => c.uid === choice.combo)
    if (partner?.id !== 'support-sudo') return reject(state, action, 'invalid sudo combo')
    if (!rulesFor(defence.id)?.sudo) return reject(state, action, 'that defence has no sudo effect')
    sudoDefence = true
  }

  const effect =
    defence.id === 'defense-rollback'
      ? 'return'
      : defence.id === 'defense-works-on-my-machine'
        ? 'reflect'
        : 'cancel'
  log.add({ type: 'defended', player: action.player, card: defence.id, effect })

  const spentHand = setHand(
    state,
    action.player,
    hand.filter((c) => c.uid !== choice.card && c.uid !== choice.combo),
  )
  const sudoCard = choice.combo ? hand.find((c) => c.uid === choice.combo) : undefined
  const spentDefence = [defence, ...(sudoCard ? [sudoCard] : [])]
  const next: GameState = { ...spentHand, pending: null, eventSeq: log.seq }

  if (effect === 'return') {
    // Rollback hands the attack back; sudo Rollback keeps it for the defender.
    const recipient = sudoDefence ? action.player : attacker
    const returned = setHand(next, recipient, [...next.players[recipient].hand, attackCard])
    return { state: discard(returned, spentDefence), events: log.events }
  }

  if (effect === 'reflect') {
    // Works on my Machine turns the attack back on its author: the roles swap,
    // so the original target becomes the taker and the attacker the victim.
    const swapped = discard(next, [attackCard, ...spentDefence])
    if (attackCard.id === 'attack-security-bug') {
      return {
        state: {
          ...swapped,
          pending: { kind: 'requestCard', player: action.player, target: attacker },
        },
        events: log.events,
      }
    }
    return { state: stealRandom(swapped, log, attacker, action.player), events: log.events }
  }

  return { state: discard(next, [attackCard, ...spentDefence]), events: log.events }
}

export function onDefend(state: GameState, action: Action & { type: 'RESOLVE' }): Reduction {
  const pending = state.pending
  if (pending?.kind !== 'defend') return reject(state, action, 'no defence pending')
  if (pending.player !== action.player) return reject(state, action, 'not your decision')
  const choice = action.choice
  if (choice.kind !== 'defend') return reject(state, action, 'wrong choice for this decision')

  if (pending.scope === 'hand') return onHandDefend(state, pending, action)

  const w = state.window
  if (!w) return reject(state, action, 'no defence pending')

  const log = createLog(state.eventSeq)
  const attacker = pending.attacker
  const { slot } = w.target
  // The attack card was removed from the attacker's hand when it was thrown.
  const attackCard: CardInstance = { uid: pending.attack, id: pending.attackId }
  const stealer = attackCard.id === 'attack-security-bug' ? attacker : null

  // Take the hit.
  if (choice.card === null) {
    log.add({ type: 'tookHit', player: action.player })
    const spent = discard({ ...state, pending: null }, [attackCard])
    const hit = takeRelease(spent, log, action.player, slot, stealer)
    return { state: closeWindow(hit, log), events: log.events }
  }

  if (!pending.canDefendWith.includes(choice.card)) {
    return reject(state, action, 'that card cannot defend this attack')
  }
  const hand = state.players[action.player].hand
  const defence = hand.find((c) => c.uid === choice.card)
  if (!defence) return reject(state, action, 'you do not hold that card')

  // sudo Rollback: the defender keeps the attacking card instead of returning it.
  let sudoDefence = false
  if (choice.combo !== undefined) {
    const partner = hand.find((c) => c.uid === choice.combo)
    if (partner?.id !== 'support-sudo') return reject(state, action, 'invalid sudo combo')
    if (!rulesFor(defence.id)?.sudo) return reject(state, action, 'that defence has no sudo effect')
    sudoDefence = true
  }

  const effect =
    defence.id === 'defense-rollback'
      ? 'return'
      : defence.id === 'defense-works-on-my-machine'
        ? 'reflect'
        : 'cancel'
  log.add({ type: 'defended', player: action.player, card: defence.id, effect })

  const spentHand = setHand(
    state,
    action.player,
    hand.filter((c) => c.uid !== choice.card && c.uid !== choice.combo),
  )
  const sudoCard = choice.combo ? hand.find((c) => c.uid === choice.combo) : undefined
  const spentDefence = [defence, ...(sudoCard ? [sudoCard] : [])]
  let next: GameState = { ...spentHand, pending: null }

  if (effect === 'return') {
    // Rollback hands the attack back; sudo Rollback keeps it for the defender.
    const recipient = sudoDefence ? action.player : attacker
    next = setHand(next, recipient, [...next.players[recipient].hand, attackCard])
    next = discard(next, spentDefence)
  } else if (effect === 'reflect') {
    // Works on my Machine turns the attack on its author: their own release falls.
    next = discard(next, [attackCard, ...spentDefence])
    const victimSlot = SLOTS.find((s) => next.players[attacker].release[s])
    if (victimSlot) next = takeRelease(next, log, attacker, victimSlot, null)
  } else {
    next = discard(next, [attackCard, ...spentDefence])
  }

  // The release survived, so the exchange continues in a fresh, shorter window.
  const reopened = openWindow({ ...next, window: null }, log, w.target, w.round + 1, action.at)
  return { state: { ...reopened, eventSeq: log.seq }, events: log.events }
}

// A pending decision is projected to its owner in full; everyone else learns only
// that the table is waiting on someone.
export function pendingView(state: GameState, viewerId: PlayerId): PendingView | null {
  const p = state.pending
  if (!p) return null
  const mine = p.player === viewerId
  switch (p.kind) {
    case 'defend':
      return {
        kind: 'defend',
        player: p.player,
        attacker: p.attacker,
        attackCard: p.attackId,
        sudo: p.sudo,
        options: mine ? [...p.canDefendWith] : [],
        openedAt: p.openedAt,
        deadline: p.deadline,
        scope: p.scope,
      }
    case 'discardForRelease':
      return {
        kind: 'discardForRelease',
        player: p.player,
        options: mine
          ? state.players[p.player].hand
              .filter((c) => c.uid !== p.release && c.uid !== p.codeReview)
              .map((c) => c.uid)
          : [],
      }
    case 'handLimit':
      return {
        kind: 'handLimit',
        player: p.player,
        excess: p.excess,
        options: mine ? state.players[p.player].hand.map((c) => c.uid) : [],
      }
    case 'requestCard':
      return { kind: 'requestCard', player: p.player, target: p.target }
    case 'giveCard':
      return { kind: 'giveCard', player: p.player, requested: p.requested }
    case 'neutralize503':
      return { kind: 'neutralize503', player: p.player, methods: [...p.methods] }
    case 'crush':
      return { kind: 'crush', player: p.player, slot: p.slot, methods: [...p.methods] }
    case 'pickFromDiscard':
      // Only discardTop/discardCount are ever projected of the discard pile
      // (project.ts) — its full contents are not public. Gated behind `mine`
      // like every other variant here: an effect brings its own viewing
      // surface for the player using it, not a reveal to the table.
      return {
        kind: 'pickFromDiscard',
        player: p.player,
        options: mine ? [...p.options] : [],
        picks: p.picks,
        source: p.source,
      }
    default:
      return null
  }
}
