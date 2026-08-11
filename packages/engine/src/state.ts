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
  // DDoS returns a Release to hand and freezes that instance for one round:
  // "не может быть разыграна в следующем ходу" — it costs the holder their
  // whole next turn, so this thaws when that turn ends.
  frozen: CardUid[]
  // An attack card Rollback handed back to whoever threw it. "он не может
  // сыграть её повторно до своего следующего хода" — barred for the rest of the
  // exchange, playable again on their next turn, so this thaws when that turn
  // begins. A separate list precisely because the two thaw at different moments;
  // one list could only ever be right for one of them.
  replayLocked: CardUid[]
}

export interface ReactionWindow {
  target: { player: PlayerId; slot: ReleaseSlot; card: CardUid }
  // 1 -> 15s, 2+ -> 10s. A repelled attack reopens the window at round + 1.
  round: number
  // The `at` of the action that opened this window — the other end of the
  // deadline span, so a countdown can be exact rather than assumed.
  openedAt: number
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
      // The `at` of the action that opened this pending — the other end of the
      // deadline span, so a countdown can be exact rather than assumed.
      openedAt: number
      deadline: number
      // 'release' answers a reaction window; 'hand' answers an attack on the
      // player's hand, where surviving means the theft simply does not happen.
      scope: 'release' | 'hand'
      // Security Bug only: the card type the attacker named.
      requested?: CardId
    }
  | { kind: 'neutralize503'; player: PlayerId; methods: NeutralizeMethod[] }
  | { kind: 'crush'; player: PlayerId; slot: ReleaseSlot; methods: NeutralizeMethod[] }
  | { kind: 'requestCard'; player: PlayerId; target: PlayerId }
  | { kind: 'giveCard'; player: PlayerId; requested: CardId; attacker: PlayerId }
  // `endsTurn` false is Bad Vibe-Coding borrowing the prompt without the
  // consequence: the same "discard N" question, but the seat stays put.
  // Absent means the ordinary end-of-turn hand limit, which does end the turn.
  | { kind: 'handLimit'; player: PlayerId; excess: number; endsTurn?: boolean }
  // The options travel on the pending rather than opening the discard globally:
  // only discardTop/discardCount are ever public (project.ts) — the pile's
  // full contents are not — so an effect that reaches into it brings its own
  // private viewing surface for the player using it, gated behind `mine` in
  // pendingView (attacks.ts) like every other owner-only pending. `picks` is
  // min(sudo ? 2 : 1, options.length), which folds "the discard is empty or
  // short" into one expression instead of a guard at every step.
  | {
      kind: 'pickFromDiscard'
      player: PlayerId
      options: CardInstance[]
      picks: 1 | 2
      source: CardId
    }

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
    // Which piles this turn has drawn from. A boolean cannot say "two of three
    // piles are done", and under Base the obligation runs over every pile
    // (rules decisions answer 1). Whether it is satisfied is a question about
    // the mode, answered by `drawObligationMet`, not a flag stored here.
    drawnFrom: number[]
    releasesPlayed: number
  }

  decks: {
    // An array of piles: Git Branch splits the draw deck 1 -> 2, and the
    // gitBranch mode axis changes how a split one is drawn from.
    main: CardInstance[][]
    events: CardInstance[]
    discard: CardInstance[]
  }

  // A draw in progress, as the remaining pile indices to draw from — one entry
  // per card still owed. A draw is one action carrying an interruptible
  // sequence (rules decisions answer 2): a trigger drawn partway through pauses
  // it, and resolving that trigger resumes it where it stopped.
  //
  // Indices rather than a count because the same sequence serves both shapes:
  // Good Vibe-Coding is two cards off pile 0 (`[0, 0]`), and the multi-pile
  // draw #61 slice A introduces is one card off each existing pile (`[0, 1, …]`).
  drawing: { player: PlayerId; piles: number[] } | null

  pending: Pending | null
  window: ReactionWindow | null

  setup: Setup
  // What the engine could not honour from the config it was handed. Both halves
  // used to vanish: an unrecognised mode value fell through to Base, and a deck
  // entry with no rules was filtered out — a caller handing over the full
  // catalogue got a smaller deck with nothing said about it.
  ignored: { cards: CardId[]; setup: string[] }
  over: { winner: PlayerId; condition: 'release' | 'lastStanding' } | null
}
