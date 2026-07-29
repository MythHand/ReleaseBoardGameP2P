# @release/engine

A pure, zero-dependency board-game rules engine. It holds the whole rules
contract for the release board game — seeded RNG, the type contract (state,
actions, events, views), and a fake implementation (`./fake`) that plays every
rule out in code: setup, projection, the turn cycle, release play, the
reaction window, attacks and defences, hand attacks, Security Bug, DDoS and
freezing, Error 503, AI events, elimination, and an opponent policy.

This document is for whoever implements the real engine (or any other engine
against this contract): what the four contract functions guarantee, the three
rules that are absolute rather than best-effort, how to run the shared
conformance suite against a new implementation, and the handful of
conventions that are easy to get subtly wrong.

## The contract

Everything an implementation must provide lives in the `Engine` interface
(`src/engine.ts`):

- **`createGame(config: GameConfig): GameState`** — builds a fresh game from a
  seed, a player list, a `Setup` (the mode axis), and the deck/event
  composition. Two calls with an identical `config` must produce an identical
  `GameState`.
- **`reduce(state: GameState, action: Action): Reduction`** — the only way
  state changes. Total: it never throws, and an action the rules do not allow
  returns the input `state` back unchanged (by reference) alongside a single
  `rejected` event, rather than raising an error or silently doing nothing
  different.
- **`project(state: GameState, viewerId: PlayerId): PlayerView`** — the
  per-player view. What `viewerId` is allowed to know, and nothing else: this
  is the only place privacy is enforced.
- **`legalTargets(state: GameState, actor: PlayerId, card: CardUid): Target[]`**
  — the legal targets for a card `actor` currently holds, empty if the card
  is not playable at all right now. This is also what a driver (bot, UI, or
  the conformance suite itself) should call to discover targets, rather than
  inferring them by reading `GameState` directly — see `fake/bots.ts`'s
  `botAction` for a driver that only ever does this.

## Three hard rules

**Purity.** `reduce` (and everything it calls) must be a pure function of its
inputs: no `Math.random`, `Date.now`, `performance.now`, or `new Date`
anywhere under `src`, and no mutation of the `state` argument. The reason
isn't style — this game is meant to run identically on every peer in a
peer-to-peer session from the same seed and the same action log, with no
server arbitrating the truth. A single non-deterministic read or in-place
mutation breaks that guarantee invisibly: two peers would compute two
different "correct" states from the same inputs, with no way to tell whose is
right. Randomness is threaded explicitly instead, as `(seed, cursor)` pairs
consumed by `randomAt`/`shuffle` (`src/rng.ts`) and advanced through
`state.rngCursor` — so the same state replayed with the same action always
draws the same "random" card.

**Totality.** `reduce` must never throw, for any `Action` — including one
that fails `isWellFormedAction`'s shape check, which is the only guard a
value surviving JSON deserialization from an untrusted peer gets before
`reduce` is called. An action the rules disallow is rejected (state
unchanged, one `rejected` event), never an exception. The reason: this
engine's caller is a P2P sync layer with no server to catch and recover from
a crash — a thrown exception there means the local peer's game state
diverges from everyone else's, for good. A property is worth more here than a
handful of examples: the conformance suite's `totality` and `progress` blocks
drive a long pseudo-random action stream (including actions that are
deliberately illegal) specifically to catch a code path that forgot this.

**Projection privacy.** `project` must never leak what `viewerId` is not
entitled to know: another player's hand contents, the ordered draw pile, or
the ordered event deck. This is why `PlayerView` reports an opponent's hand as
`handCount` (a number) rather than the cards themselves, why a drawn card's
identity is only visible to the drawer (`visibleTo` on the `drawn` event), and
why `GameState`'s own `decks.main`/`decks.events` arrays must never appear,
even indirectly, in a projected view. The engine is the only party that knows
which secrets exist, so it is the only party that can be trusted to hide
them — a UI or network layer filtering after the fact would have already
received the leak.

## Running the conformance suite against a new implementation

`describeEngine` (`src/conformance.ts`) is the executable specification: one
shared suite of Vitest `describe`/`it` blocks — determinism, totality,
progress, projection privacy, `legalTargets`, and rules invariants — run
against whatever `Engine` you hand it. The fake engine's own test file is the
template:

```ts
// src/fake/fake.test.ts
import { describeEngine } from '../conformance'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from './index'

describeEngine('fake', createFakeEngine, { deck: FAKE_DECK, events: FAKE_EVENTS })
```

To conform a real implementation, add a sibling test file that calls:

```ts
describeEngine('real', createRealEngine, { deck, events })
```

`createRealEngine` is a zero-argument factory returning your `Engine`
(`{ createGame, reduce, project, legalTargets }`); `deck`/`events` are the
`DeckEntry[]` arrays your implementation uses (see "quantities" below). The
suite calls `make()` fresh per test rather than sharing one engine instance,
so a stateful implementation gets a clean start every time. Every `it` inside
`describeEngine` then runs unchanged against your engine — a failure means
your implementation disagrees with the rules encoded here, not that the test
needs adjusting.

## The `${id}#${n}` uid convention

Every `CardInstance` has both a catalogue `id` (e.g. `'release-frontend'`,
shared by every copy of that card) and a unique `uid`. The fake's `expand`
(`src/fake/setup.ts`) mints uids deterministically as `` `${id}#${n}` `` — the
`n`-th copy of that id in deck order — specifically so that replaying the same
`config` produces the same uids every time; a counter that persisted across
calls instead would make two runs of an identical config diverge on uid
alone, breaking the determinism property above.

Nothing in this package ever parses a uid back apart to recover its `id`.
Every place that needs both carries them as a pair explicitly — `CardInstance`
itself, `Pending`'s `attackId` alongside `attack`, event fields like
`released`'s `card` alongside the zone's `uid`. This isn't a style
preference: it means the uid format is free to change (a different
implementation could use random ids, a counter, anything unique) without
touching a single call site that only ever received an explicit `CardId`. Do
not add code that does `uid.split('#')` or otherwise infers `id` from `uid`'s
shape — treat the format as opaque outside of `expand` itself.

One case worth knowing: `resolveAiEvent`'s `ai-release-*`/`ai-monitoring`
events mint their own uids (`` `ai-event-release-${slot}-${player}` ``,
`` `ai-event-monitoring-${player}` ``) rather than reusing the event card's —
the event card itself returns to its own deck once resolved, while the placed
release/Monitoring stays on the board, so the two need distinct identities.
Their `id`, though, is the plain catalogue id (`release-${slot}`,
`'protection-monitoring'`), not the AI event's own id — otherwise a card
placed this way could never be played again if DDoS later bounced it back to
a hand.

## `rejected` is a diagnostic event, not a move

A `rejected` event is what `reduce` emits for any action the rules refuse.
It is not part of the game's history in the same sense every other event is:

- **State is referentially unchanged.** `reject` (`src/fake/core.ts`) returns
  the same `state` object it was given, so `state.eventSeq` cannot have
  advanced — there is nothing new to number.
- **Consecutive rejections reuse an id.** Because the state is unchanged, a
  second rejected action computes its event id from the same unchanged
  `eventSeq` as the first — this is not a bug to fix, it falls directly out
  of the no-mutation guarantee above.
- **It is exempt from id-uniqueness.** The conformance suite's "numbers every
  committed event uniquely and monotonically" check filters `rejected` out
  before asserting on ids, for exactly this reason.
- **It never enters move-history.** A frontend building a move-history log
  from committed events should skip `rejected` entirely rather than trying to
  place it in sequence — it did not happen, in the sense that matters to a
  replay.

## What the fake omits, and why

`CARD_RULES` (`src/cards.ts`) only defines the ids the fake actually
implements. Three families are deliberately absent, and `createGame` filters
any unsupported id out of the deck rather than erroring, so an omitted card is
simply inert instead of fatal:

- **Git operations** (`operation-*`) — need a bespoke UI surface the design
  defers.
- **System Upgrade** — same reason.
- **`ai-inside`** — same reason.

## Quantities vs. rules

`GameConfig.deck` and `GameConfig.events` (both `DeckEntry[]`, `{ id, qty }`)
are the *only* place card quantities live — how many of each id go into the
draw pile and the event deck. `CARD_RULES` (`src/cards.ts`) holds rules
metadata only (`kind`, whether a card has a sudo variant, which zone slot a
release occupies) and carries no quantity information at all. The fake's own
`FAKE_DECK`/`FAKE_EVENTS` (`src/fake/index.ts`) are one example caller
supplying quantities that mirror `apps/ui/src/cards/catalogue.ts`; a real
implementation supplies its own `DeckEntry[]` to `describeEngine` (and to its
own `createGame` calls) rather than reading counts out of `CARD_RULES`.

## `runUntilIdle` is a headless driver — do not front a live UI with it

`runUntilIdle` (`src/fake/bots.ts`) drives every non-human seat forward —
including auto-resolving any reactive pending owed by the human (`defend`,
`neutralize503`, `crush`, `handLimit`) — until either the human's own
proactive turn, the game ends, or a runaway policy trips its iteration cap.
That auto-resolution is a deliberate convenience for tests, simulation, and
"what does a finished game look like" — it lets a headless caller reach the
human's real turn without anyone in the room to answer prompts on their
behalf.

It must never front a live UI. The reaction window in particular is the
game's most interactive moment — bluffing on Security Bug, choosing to eat a
hit versus spend a defence — and auto-resolving it removes the decision the
human player is actually meant to make. A UI-facing driver has to stop on any
pending owed by the human and surface it, not call into `runUntilIdle` to
skip past it.
