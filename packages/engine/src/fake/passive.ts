import type { Action } from '../actions'
import { rulesFor } from '../cards'
import type { Engine } from '../engine'
import { randomAt, shuffle } from '../rng'
import { type GameState, type PlayerId, pendingOwes } from '../state'

// Answers for a seat whose human is away. Unlike `botAction` this never plays
// from hand, never defends and never attacks: it declines or abandons what it
// can, answers forced choices at random (seeded from public state, so every
// peer computes the same answer), and otherwise only keeps the turn moving
// (draw, push). Pure: the rng cursor is read, never written back.
export function passiveAction(
  engine: Engine,
  state: GameState,
  me: PlayerId,
  at: number,
): Action | null {
  const view = engine.project(state, me)
  if (view.over || view.self.eliminated) return null
  const random = randomAt(state.seed, state.eventSeq)
  const pick = <T>(items: readonly T[]): T | undefined =>
    items[Math.min(items.length - 1, Math.floor(random * items.length))]

  const pending = view.pending
  if (pending && pendingOwes(pending, me)) {
    switch (pending.kind) {
      case 'defend':
        return { type: 'RESOLVE', player: me, choice: { kind: 'defend', card: null }, at }
      case 'neutralize503':
      case 'crush':
        // Monitoring answers without spending anything; every other method
        // costs a card or a release, so the seat declines instead.
        return pending.methods.includes('monitoring')
          ? {
              type: 'RESOLVE',
              player: me,
              choice: { kind: pending.kind, method: 'monitoring' },
              at,
            }
          : { type: 'PASS', player: me, at }
      case 'handLimit': {
        const cards = shuffle(pending.options, state.seed, state.rngCursor).items.slice(
          0,
          pending.excess,
        )
        return { type: 'RESOLVE', player: me, choice: { kind: 'handLimit', cards }, at }
      }
      case 'giveCard': {
        const match = view.self.hand.find((c) => c.id === pending.requested)
        return {
          type: 'RESOLVE',
          player: me,
          choice: { kind: 'giveCard', card: match?.uid ?? '' },
          at,
        }
      }
      case 'systemUpgrade': {
        if (pending.phase === 'picking') {
          const taken = pick(pending.thrown)
          if (!taken) return null
          return {
            type: 'RESOLVE',
            player: me,
            choice: { kind: 'upgradeTake', card: taken.card.uid },
            at,
          }
        }
        const card = pick(view.self.hand)
        if (!card) return null
        return {
          type: 'RESOLVE',
          player: me,
          choice: { kind: 'upgradeDiscard', card: card.uid },
          at,
        }
      }
      case 'pickFromDiscard': {
        if (!pending.source.startsWith('ai-')) return { type: 'ABANDON', player: me, at }
        const card = pick(pending.options.filter((c) => rulesFor(c.id)?.kind !== 'trigger'))
        if (!card) return null
        return {
          type: 'RESOLVE',
          player: me,
          choice: { kind: 'pickFromDiscard', card: card.uid },
          at,
        }
      }
      case 'discardForRelease':
      case 'stealCard':
      case 'requestCard':
      case 'reorderTop':
        return { type: 'ABANDON', player: me, at }
      default:
        return null
    }
  }

  if (view.window) {
    // The owner's window is closed by the keeper's tick; a responder only
    // passes, and only while the engine would still accept it.
    if (view.window.player === me || view.window.passed.includes(me)) return null
    return { type: 'PASS', player: me, at }
  }

  if (!pending && view.turn.player === me) {
    // No `pile`: under Strategic Git Branch the engine takes pile 0. Which pile
    // a passive seat should pick is an open rules question (docs/rules/backlog.md).
    return view.turn.hasDrawn ? { type: 'PUSH', player: me, at } : { type: 'DRAW', player: me, at }
  }

  return null
}
