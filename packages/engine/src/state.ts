export type PlayerId = string
// A catalogue id, e.g. 'release-frontend'. Resolves to art in apps/ui.
export type CardId = string
// A unique instance. The catalogue has qty 7 for Bug, so two Bugs in one hand
// must be distinguishable — for the Hand fan's key, for FLIP animations that
// need stable identity, and for "return THIS card" (Rollback).
export type CardUid = string

export type ReleaseSlot = 'frontend' | 'backend' | 'database'
export type NeutralizeMethod = 'debugger' | 'monitoring' | 'sacrifice'
// Mode selection, key -> chosen option value. Structurally identical to the UI's
// Setup, declared here so the engine imports nothing.
export type Setup = Record<string, string>

export interface CardInstance {
  uid: CardUid
  id: CardId
}

export interface Released {
  card: CardInstance
  // Code Review lies "under" the release; they are played together and die together.
  codeReview?: CardInstance
}

export interface PlayerState {
  id: PlayerId
  name: string
  hand: CardInstance[]
  release: {
    frontend?: Released
    backend?: Released
    database?: Released
    // Monitoring / AI Monitoring — in the zone but not a Release.
    monitoring?: CardInstance
  }
  // DDoS returns a Release to hand and freezes that instance for one round.
  frozen: CardUid[]
}

export interface ReactionWindow {
  target: { player: PlayerId; slot: ReleaseSlot; card: CardUid }
  // 1 -> 15s, 2+ -> 10s. A repelled attack reopens the window at round + 1.
  round: number
  deadline: number
  // Revocable: passing only means "fine, close early". A passer may still attack.
  passed: PlayerId[]
}

export type Pending =
  // `codeReview` survives the pause: the combo is declared when the release is
  // played, but the card only lands after the cost is paid.
  | { kind: 'discardForRelease'; player: PlayerId; release: CardUid; codeReview?: CardUid }
  | {
      kind: 'defend'
      player: PlayerId
      attacker: PlayerId
      attack: CardUid
      // The attacking card's catalogue id, carried rather than parsed back out of
      // the uid — nothing should depend on the uid's internal format.
      attackId: CardId
      sudo: boolean
      canDefendWith: CardUid[]
      deadline: number
    }
  | { kind: 'neutralize503'; player: PlayerId; methods: NeutralizeMethod[] }
  | { kind: 'crush'; player: PlayerId; slot: ReleaseSlot; methods: NeutralizeMethod[] }
  | { kind: 'requestCard'; player: PlayerId; target: PlayerId }
  | { kind: 'giveCard'; player: PlayerId; requested: CardId; attacker: PlayerId }
  | { kind: 'handLimit'; player: PlayerId; excess: number }

export interface GameState {
  gameId: string
  seed: number
  rngCursor: number
  // Monotonic event id source. Events carry `id` and an optional `parent` so the
  // frontend can build MoveHistory's tree without inferring which events group.
  eventSeq: number

  seating: PlayerId[]
  players: Record<PlayerId, PlayerState>
  eliminated: PlayerId[]

  turn: {
    player: PlayerId
    index: number
    hasDrawn: boolean
    releasesPlayed: number
  }

  decks: {
    // An array of piles: Git Branch splits the draw deck 1 -> 2, and the
    // gitBranch mode axis changes how a split one is drawn from.
    main: CardInstance[][]
    events: CardInstance[]
    discard: CardInstance[]
  }

  pending: Pending | null
  window: ReactionWindow | null

  setup: Setup
  over: { winner: PlayerId; condition: 'release' | 'lastStanding' } | null
}
