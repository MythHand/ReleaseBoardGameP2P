import type { Tallies } from './tally'

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
  // Set when this instance *is* a card from the events deck, standing on the
  // table. `id` is the plain catalogue card it stands in for, so it reads and
  // plays as an ordinary Monitoring or Release; `event` is the id it goes back
  // to the events deck as when it leaves the table (general.md §6.4). While it
  // stands there the events deck genuinely holds one card fewer.
  event?: CardId
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
  // What this player was dealt FACE UP at setup — by the rules, the reserved
  // Debugger. Recorded rather than re-derived, because provenance and identity
  // are not the same question: with a deck holding fewer Debuggers than players
  // a seat gets five random cards, and a surplus Debugger can land first in that
  // hand without ever having been dealt openly. Reading "is hand[0] a Debugger?"
  // would announce that card to the whole table as face up when it is not.
  openedAtDeal: CardUid[]
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

// Cards remain at the centre until the whole hand-attack decision resolves.
export interface HandAttackContext {
  attack: CardInstance
  combo?: CardInstance
  owner: PlayerId
  parent?: number
  /**
   * The defence that turned this attack back on its author (Works on my
   * Machine), with the sudo that backed it. It is LYING ON THE TABLE over the
   * attack it answered — not spent — for the same reason the attack above it
   * is: the exchange it belongs to has not finished. It is banked together
   * with the attack when the exchange does, which is what "a defence goes to
   * the discard with what it defended from" means (owner, 22.09).
   */
  cover?: { player: PlayerId; cards: CardInstance[] }
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
      // The id of the `attacked` event that opened this exchange, so the answer
      // can name it as its `parent`. The answer is a LATER reduction with its
      // own log, which cannot see the attack's event — carrying the id here is
      // what makes the link possible at all (#138).
      attackEventId: number
      sudo: boolean
      // The Sudo that rode the attack. Held HERE while the exchange is open —
      // like the attack card itself, which lives only on this pending — and
      // banked at resolution, so the discard pile never shows a half of a pair
      // the table still sees standing at the centre.
      combo?: CardInstance
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
  // The alarm waits here while its answer is chosen — out of the deck, in no
  // hand and no zone, exactly as a thrown attack waits on a `defend`. By the
  // rules it reaches the discard only once it has been neutralized, «вместе с
  // картой, которой нейтрализовали» (docs/rules/resolution.md), so holding it
  // is what lets both leave in one moment.
  //
  // `card` is null for the `ai-error-503` mimic: that card is an events-deck
  // one-off, already back in the events deck by the time this pending exists
  // (fireTrigger's trigger-ai branch, general.md §6.4) — never in the discard,
  // so there is nothing here for a neutralize answer to bank alongside it.
  | {
      kind: 'neutralize503'
      player: PlayerId
      card: CardInstance | null
      methods: NeutralizeMethod[]
      // The AI event card this prompt belongs to. Absent for a pending raised
      // by anything other than an AI card.
      source?: CardId
    }
  | {
      kind: 'crush'
      player: PlayerId
      slot: ReleaseSlot
      methods: NeutralizeMethod[]
      // The AI event card this prompt belongs to. Absent for a pending raised
      // by anything other than an AI card.
      source?: CardId
    }
  | {
      kind: 'stealCard'
      player: PlayerId
      target: PlayerId
      slots: CardUid[]
      context: HandAttackContext
      openedAt: number
      deadline: number
    }
  | {
      kind: 'requestCard'
      player: PlayerId
      target: PlayerId
      context?: HandAttackContext
      openedAt?: number
      deadline?: number
    }
  | {
      kind: 'giveCard'
      player: PlayerId
      requested: CardId
      attacker: PlayerId
      context?: HandAttackContext
      openedAt?: number
      deadline?: number
    }
  // `endsTurn` false is Bad Vibe-Coding borrowing the prompt without the
  // consequence: the same "discard N" question, but the seat stays put.
  // Absent means the ordinary end-of-turn hand limit, which does end the turn.
  | {
      kind: 'handLimit'
      player: PlayerId
      excess: number
      endsTurn?: boolean
      // The AI event card this prompt belongs to. Absent for a pending raised
      // by anything other than an AI card.
      source?: CardId
    }
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
      /**
       * WHICH OCCASION THIS IS — the event sequence the decision was raised at.
       *
       * A card of the same kind may be played any number of times, so the same
       * player can be offered the same cards twice in one match, and the two
       * offers are then identical in every other field. A reader that has to
       * tell one from the other — the board, which must not mistake a fresh
       * offer for the one it has already answered — has nothing else to go on
       * (#168). The timed pendings carry `openedAt` for their countdown and get
       * this for free; these two are untimed, so they say it outright.
       *
       * The engine's own sequence rather than a clock: monotonic, and identical
       * on every peer, which a timestamp taken per peer would not be.
       */
      raisedAt: number
    }
  // Git Rebase. The offered cards are private to the player using it — "не
  // показывая другим" — so pendingView gates `piles` behind `mine` exactly as
  // it gates `pickFromDiscard.options`. One entry per pile the effect reaches:
  // base = the pile the player named (rules decisions 2026-09-04 answer 1),
  // sudo = every pile. `cards` is top-first, so index 0 is the next card drawn.
  | {
      kind: 'reorderTop'
      player: PlayerId
      piles: { pile: number; cards: CardInstance[] }[]
      source: CardId
      /** which occasion this is — see `pickFromDiscard.raisedAt` */
      raisedAt: number
    }
  // System Upgrade — the first pending owed to SEVERAL seats at once. It
  // carries no `player`, deliberately: every other variant has one, so the
  // union-wide reads compile today, and dropping it here makes the compiler
  // enumerate each place that must now decide whether it means the actor, the
  // seats still owing, or something else. `pendingOwes` below is the answer
  // most of them want.
  //
  // `thrown` holds the cards face up at the centre — out of every hand and in
  // no pile, the same mid-air state a `defend`'s attack card is in, and it must
  // be counted by conformance's census for the same reason.
  | {
      kind: 'systemUpgrade'
      actor: PlayerId
      // Drains as each answers. Never the actor, never an eliminated seat,
      // never an empty-handed one (rules decisions 2026-09-04 answer 3).
      owed: PlayerId[]
      thrown: { player: PlayerId; card: CardInstance }[]
      sudo: boolean
      // 'picking' is reachable only under sudo and only with something thrown.
      phase: 'discarding' | 'picking'
      source: CardId
    }

// The part of a pending that says whose move it is — the only part the two
// predicates below read. Declared structurally rather than as `Pending`, so
// the same two answers serve a projected `PendingView` (fake/bots.ts drives
// off the projection, never off GameState) without `state.ts` having to import
// `view.ts` back and make the pair circular. Both unions are assignable to it
// because the projection mirrors the variant field for field.
export type PendingOwnership =
  | {
      kind: 'systemUpgrade'
      actor: PlayerId
      owed: readonly PlayerId[]
      phase: 'discarding' | 'picking'
    }
  | { kind: Exclude<Pending['kind'], 'systemUpgrade'>; player: PlayerId }

// EVERY CARD THERE IS, by uid, wherever it happens to be.
//
// A card is always somewhere: in a deck, in a hand, standing in a zone — or in
// the air, which is the part that needs saying. Between a card leaving a hand
// and arriving anywhere, it belongs to the pending that is holding the
// exchange open, and a census that looked only at the piles would read that
// moment as a card lost.
//
// One census, every reader. The engine's own conformance check is built on it,
// and so is the debug stand, which holds every scene it builds to the same
// count: a fixture is a game or it is nothing, and a scene that writes a card
// twice is a stand that proves nothing (owner, 23.09).
export function cardsPresent(state: GameState): CardUid[] {
  const uids = [
    ...state.decks.main.flat(),
    ...state.decks.discard,
    ...state.decks.events,
    ...Object.values(state.players).flatMap((p) => [
      ...p.hand,
      // The three release slots hold { card, codeReview? }; `monitoring` holds
      // the instance itself, so it cannot go through the same branch.
      ...(['frontend', 'backend', 'database'] as const).flatMap((slot) => {
        const r = p.release[slot]
        return r ? [r.card, ...(r.codeReview ? [r.codeReview] : [])] : []
      }),
      ...(p.release.monitoring ? [p.release.monitoring] : []),
    ]),
  ].map((c) => c.uid)
  // A thrown attack card is in mid-air while a `defend` is owed: out of the
  // attacker's hand and not yet anywhere else. It is still very much in the
  // game, so a stream that simply ends while one is open must not read as a
  // loss — that is a snapshot artefact, not a leaked card.
  if (state.pending?.kind === 'defend') uids.push(state.pending.attack)
  if (state.pending && 'context' in state.pending && state.pending.context) {
    uids.push(state.pending.context.attack.uid)
    if (state.pending.context.combo) uids.push(state.pending.context.combo.uid)
    // …and the defence lying OVER that attack, held on the same context until
    // the exchange ends — the same mid-air state, counted for the same reason
    // (ditayler, #184).
    for (const card of state.pending.context.cover?.cards ?? []) uids.push(card.uid)
  }
  // The Sudo that rode that attack, held on the same pending for the same
  // reason and in the same mid-air state — out of the attacker's hand and in no
  // pile until the exchange resolves. Counted here, and nowhere else: the test
  // "counts the Sudo riding an attack while its defence is open" below is what
  // establishes that, because the fuzz stream never attaches a combo to an
  // ATTACK and so cannot reach this state on its own.
  if (state.pending?.kind === 'defend' && state.pending.combo) {
    uids.push(state.pending.combo.uid)
  }
  // The alarm while its answer is being chosen — same mid-air state as a thrown
  // attack above, and the same reason a stream ending here must not read as a
  // lost card. Null for the ai-error-503 mimic, which holds no card here.
  if (state.pending?.kind === 'neutralize503' && state.pending.card) {
    uids.push(state.pending.card.uid)
  }
  // System Upgrade's thrown cards, face up at the centre while the pending
  // drains — out of every hand and in no pile yet, the same mid-air state as
  // the two above and counted for the same reason.
  if (state.pending?.kind === 'systemUpgrade') {
    for (const t of state.pending.thrown) uids.push(t.card.uid)
  }
  return uids.sort()
}

// EVERY AI CARD THERE IS, by the id it goes back to the events deck as.
//
// An AI card never leaves the game: it is in the events deck, standing on the
// table, or being played (`general.md` §6.4, and `CardInstance.event` above).
// So the same cards are always all there, and the count is a fact anything can
// check — a fixture that stands one on the table without taking it out of the
// deck has simply written the same card twice, which is how a stand scene grew
// the deck every time it sent a card home (ditayler, #185).
//
// Counted by the EVENT id, never by the plain one it wears on the table: a
// standing AI release reads as an ordinary Release and would otherwise be
// indistinguishable from the real card of that name.
export function aiCardsPresent(state: GameState): CardId[] {
  const seen: CardId[] = state.decks.events.map((c) => c.event ?? c.id)
  for (const player of Object.values(state.players)) {
    for (const card of player.hand) if (card.event) seen.push(card.event)
    for (const slot of ['frontend', 'backend', 'database'] as const) {
      const released = player.release[slot]
      if (released?.card.event) seen.push(released.card.event)
      if (released?.codeReview?.event) seen.push(released.codeReview.event)
    }
    if (player.release.monitoring?.event) seen.push(player.release.monitoring.event)
  }
  return seen
}

// Who a pending is waiting on. Every variant but `systemUpgrade` waits on one
// seat; that one waits on its roster while it is discarding, and on the actor
// once it is picking. One predicate, so the keeper, the bot and the board
// cannot disagree about whose move it is.
export function pendingOwes(
  pending: PendingOwnership | null | undefined,
  player: PlayerId,
): boolean {
  if (!pending) return false
  if (pending.kind !== 'systemUpgrade') return pending.player === player
  return pending.phase === 'picking' ? pending.actor === player : pending.owed.includes(player)
}

// The seat a headless driver should act as next. Undefined when nothing is
// pending, so callers fall back to the player on turn — which is what both of
// them did before a pending could owe more than one seat.
export function seatOwing(pending: PendingOwnership | null | undefined): PlayerId | undefined {
  if (!pending) return undefined
  if (pending.kind !== 'systemUpgrade') return pending.player
  return pending.phase === 'picking' ? pending.actor : pending.owed[0]
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
    // The inactivity clock on the player on turn — app timing, not a rule
    // (docs/rules/README.md, "Что правилом НЕ является"). Restarted by every
    // committed action while the table idles on that player, absent while a
    // window, a pending or a running draw owns the wait — and before the
    // keeper's first CLOCK_STARTED, because createGame has no timestamp.
    // Both ends of the span, like the window's, so a countdown is exact.
    openedAt?: number
    deadline?: number
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
  // Per-seat counters for the results screen, folded from this game's own event
  // log (tally.ts). It lives in GameState rather than beside the keeper for two
  // reasons: every peer then reads one authority's numbers instead of counting a
  // log that visibleTo made different for each of them, and a keeper handover
  // carries it for free because KEEPER_STATE carries GameState.
  tally: Tallies
  over: { winner: PlayerId; condition: 'release' | 'lastStanding' } | null
}
