import type {
  CardId,
  CardInstance,
  CardUid,
  NeutralizeMethod,
  PlayerId,
  ReleaseSlot,
  Setup,
} from './state'

// A released card is public, so the view carries ids rather than instances —
// except `uid`, which the UI needs as a stable animation key.
export interface ReleasedView {
  uid: CardUid
  card: CardId
  codeReview?: CardId
}

export interface ReleaseView {
  frontend?: ReleasedView
  backend?: ReleasedView
  database?: ReleasedView
  monitoring?: ReleasedView
}

export interface WindowView {
  player: PlayerId
  slot: ReleaseSlot
  round: number
  // Both ends of the span, so the ring's sweep is exact rather than assumed.
  openedAt: number
  deadline: number
  passed: PlayerId[]
  // Which of the viewer's cards may be thrown into this window. Empty for the
  // release's owner and for anyone holding nothing legal.
  canAttackWith: CardUid[]
}

export type PendingView =
  | { kind: 'discardForRelease'; player: PlayerId; options: CardUid[] }
  | {
      kind: 'defend'
      player: PlayerId
      attacker: PlayerId
      attackCard: CardId
      sudo: boolean
      options: CardUid[]
      openedAt: number
      deadline: number
      scope: 'release' | 'hand'
    }
  | { kind: 'neutralize503'; player: PlayerId; methods: NeutralizeMethod[] }
  | { kind: 'crush'; player: PlayerId; slot: ReleaseSlot; methods: NeutralizeMethod[] }
  | { kind: 'requestCard'; player: PlayerId; target: PlayerId }
  | { kind: 'giveCard'; player: PlayerId; requested: CardId }
  | { kind: 'handLimit'; player: PlayerId; excess: number; options: CardUid[] }
  // Full card identity, but gated behind `mine` in pendingView (attacks.ts)
  // like the other owner-only variants: only discardTop/discardCount are
  // ever public (project.ts), so the discard's full contents are not.
  | {
      kind: 'pickFromDiscard'
      player: PlayerId
      options: CardInstance[]
      picks: 1 | 2
      source: CardId
    }

export interface OpponentView {
  id: PlayerId
  name: string
  // Count only — never identity.
  handCount: number
  release: ReleaseView
  eliminated: boolean
}

export interface PlayerView {
  self: {
    id: PlayerId
    name: string
    hand: CardInstance[]
    release: ReleaseView
    // Legality is the engine's answer, never the UI's.
    playable: CardUid[]
    frozen: CardUid[]
  }
  opponents: OpponentView[]
  decks: {
    piles: number[]
    events: number
    discardTop?: CardId
    discardCount: number
  }
  turn: { player: PlayerId; index: number; hasDrawn: boolean }
  window: WindowView | null
  pending: PendingView | null
  setup: Setup
  over: { winner: PlayerId; condition: 'release' | 'lastStanding' } | null
}
