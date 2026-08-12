// Structural mirror of @release/engine's action surface. The kit carries no
// domain dependency (Decision 7), so these are declared rather than imported.
// apps/frontend/src/entities/game/contract.test-d.ts asserts both directions of
// assignability — if the engine adds a member and this file does not, the
// frontend stops compiling.

export type ReleaseSlotId = 'frontend' | 'backend' | 'database'
export type NeutralizeMethodId = 'debugger' | 'monitoring' | 'sacrifice'

export type TableTarget =
  | { kind: 'player'; player: string }
  | { kind: 'release'; player: string; slot: ReleaseSlotId }
  | { kind: 'monitoring'; player: string }
  | { kind: 'card'; card: string }
  // Mirrors the engine's pile target: Git Branch splits one of the draw piles,
  // and with several on the table the player picks which.
  | { kind: 'pile'; pile: number }

export type TableChoice =
  | { kind: 'discardForRelease'; card: string }
  | { kind: 'defend'; card: string | null; combo?: string; reflectSlot?: ReleaseSlotId }
  | { kind: 'neutralize503'; method: NeutralizeMethodId; card?: string }
  | { kind: 'crush'; method: NeutralizeMethodId; card?: string }
  | { kind: 'requestCard'; card: string }
  | { kind: 'giveCard'; card: string }
  | { kind: 'handLimit'; cards: string[] }
  | { kind: 'pickFromDiscard'; card: string; toDeck?: string }

export type TablePending =
  | { kind: 'discardForRelease'; player: string; options: string[] }
  | {
      kind: 'defend'
      player: string
      attacker: string
      attackCard: string
      sudo: boolean
      options: string[]
      openedAt: number
      deadline: number
      scope: 'release' | 'hand'
    }
  | { kind: 'neutralize503'; player: string; methods: NeutralizeMethodId[] }
  | { kind: 'crush'; player: string; slot: ReleaseSlotId; methods: NeutralizeMethodId[] }
  | { kind: 'requestCard'; player: string; target: string }
  | { kind: 'giveCard'; player: string; requested: string }
  | { kind: 'handLimit'; player: string; excess: number; options: string[] }
  | {
      kind: 'pickFromDiscard'
      player: string
      options: { uid: string; id: string }[]
      picks: 1 | 2
      source: string
    }

export interface TableWindow {
  player: string
  slot: ReleaseSlotId
  round: number
  // Both ends of the span, so the ring's sweep is exact rather than assumed.
  openedAt: number
  deadline: number
  passed: string[]
  canAttackWith: string[]
}

// Intents out. Never an Action — the kit does not know the player's id or the
// clock; the consumer stamps both (Decision 8).
export interface TableActions {
  onPlay?: (card: string, target?: TableTarget, combo?: string) => void
  onDraw?: (pile?: number) => void
  onPush?: () => void
  onAttack?: (card: string, combo?: string) => void
  onPass?: () => void
  onUnpass?: () => void
  onResolve?: (choice: TableChoice) => void
  onWindowExpired?: () => void
  onOverContinue?: () => void
  // Legality is the engine's answer, never the UI's. Returns [] when the card
  // needs no target.
  legalTargets?: (card: string) => TableTarget[]
}
