import type { Action, Choice, Target } from '@release/engine'
import type { TableChoice, TableTarget } from '@release/ui'

// Mirrors TableActions' callbacks (apps/ui/src/table/Table/intents.ts) one to
// one — everything the kit can ask for, minus `onOverContinue` (no engine
// action exists for "dismiss the game-over screen") and `legalTargets` (a
// query, not an intent).
export type TableIntent =
  | { kind: 'play'; card: string; target?: TableTarget; combo?: string }
  | { kind: 'draw'; pile?: number }
  | { kind: 'push' }
  | { kind: 'attack'; card: string; combo?: string }
  | { kind: 'pass' }
  | { kind: 'unpass' }
  | { kind: 'resolve'; choice: TableChoice }
  | { kind: 'windowExpired' }

// An intent becomes an action: the kit never knows the player's id or the
// clock (Decision 8) — the consumer stamps both here. Pure, exhaustive: a
// new TableActions callback with no case here is a compile error, not a
// silently dropped intent.
export function toAction(intent: TableIntent, player: string, at: number): Action {
  switch (intent.kind) {
    case 'play':
      return {
        type: 'PLAY',
        player,
        card: intent.card,
        // Structural passthrough — licensed by the Exact<> assertions in
        // contract.test-d.ts.
        target: intent.target as Target | undefined,
        combo: intent.combo,
        at,
      }
    case 'draw':
      return { type: 'DRAW', player, pile: intent.pile, at }
    case 'push':
      return { type: 'PUSH', player, at }
    case 'attack':
      return { type: 'ATTACK', player, card: intent.card, combo: intent.combo, at }
    case 'pass':
      return { type: 'PASS', player, at }
    case 'unpass':
      return { type: 'UNPASS', player, at }
    case 'resolve':
      return { type: 'RESOLVE', player, choice: intent.choice as Choice, at }
    // WINDOW_EXPIRED is the one action carrying no player — it belongs to no
    // one; the window itself expired.
    case 'windowExpired':
      return { type: 'WINDOW_EXPIRED', at }
    default: {
      const exhaustive: never = intent
      throw new Error(`unhandled intent: ${JSON.stringify(exhaustive)}`)
    }
  }
}
