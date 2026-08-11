# Game page — Design

## Goal

Turn `/board/:gameId` from a placeholder into a playable game page, and in doing so
define the boundary the rules engine will be implemented against.

Rules evaluation is not ours. This spec designs the **contract** the engine must
satisfy, ships a **fake implementation** of it good enough to play solo in the
browser, and wires the page to consume it. When the real reducer lands behind the
same contract, the page does not change.

## Context

Almost everything the page needs already exists.

`@release/ui` ships the finished table: `apps/ui/src/table/Table/Table.tsx` composes
`Seat`, `ReleaseZone`, `Hand` (fan layout with hover-to-read), `Pile`, `TurnDock`
(draw / push / waiting / reaction states with a ring timer), `MoveHistory`,
`Participants`, `GameModes`, `GameOver` and `Reconnect`. `apps/playground/stories/TableStory/`
drives it from the mock snapshot in `apps/ui/src/mocks/table.ts`.

The card catalogue is complete — `apps/ui/src/cards/catalogue.ts` carries all 104 base
and 21 AI cards with art, category, tags (`lightning`, `sudo`, `cancel`, `unicorn`,
`combo-source`) and quantities. The animation vocabulary in `apps/ui/src/animations/`
covers card flights, and the playground has interactive stories for drawing, playing,
combos and the targeting arrow.

The P2P layer is built: transport, lobby state, host handlers, relay, `nextTurn`,
`attackWindow` helpers — and `apps/frontend/src/network/types.ts` already types the
*entire* rules protocol as a discriminated `Message` union, with the rules-driven half
marked types-only.

What is missing is the engine. `apps/frontend/src/entities/game/types.ts` is a
three-field placeholder whose comment says so, and
`apps/frontend/src/pages/board/[gameId]/_layout.tsx` renders `Table` with
`PLACEHOLDER_STATE` — empty hand, empty zones, zero decks.

`docs/understanding.md` states that rules and P2P belong to a collaborating developer.
That is half stale: the P2P layer was built here. Rules remain theirs.

## Scope

Issue [#18](https://github.com/MythHand/ReleaseBoardGameP2P/issues/18) as written spans
roughly thirty card effects, five mode axes, a multi-round reaction window,
hidden-information sync over WebRTC, and every screen interaction. That is several
specs. It decomposes into four pieces:

| # | Piece | This spec |
|---|-------|-----------|
| 1 | Contract types — state, actions, events, projection | **yes** |
| 2 | Fake reducer — playable solo sandbox | **yes** |
| 3 | Page wired to the contract, with interactions | **yes** |
| 4 | P2P sync layer — protocol, hidden state, checkpoints | no — its own spec |

Piece 4 is deferred on purpose. The unresolved open question from
[`2026-06-22-p2p-networking-design.md`](./2026-06-22-p2p-networking-design.md) — who
keeps the hidden, ordered deck — is far easier to settle against a concrete engine state
shape than against a hypothetical one. Deferring it also means the sync layer is written
once, against real rules, rather than twice.

## Decisions

1. **The engine is a workspace package, `@release/engine`.** Consumed from source via a
   Vite alias exactly like `@release/ui`. The alternative — living in
   `apps/frontend/src/entities/game/`, where the placeholder sits today — is cheaper but
   makes the handoff a folder convention instead of an artifact. A package enforces the
   boundary mechanically: the engine has no dependency on `@release/ui` or on `network/`,
   so it cannot couple rules to presentation even by accident. It also builds and tests
   without Vite or React, which is the whole point of a pure reducer.

2. **The contract is three pure functions, plus one query.** `createGame`, `reduce`,
   `project`, `legalTargets`. Synchronous, no I/O, no timers, no promises.

3. **The page never touches `GameState`.** It consumes `PlayerView` only. `GameState`
   holds every hand and the ordered deck; `PlayerView` holds what one seat may know. In
   solo play the sandbox keeps `GameState` in memory and hands the page a projection —
   the same projection a remote peer will later receive over the DataChannel. This is
   what lets the sync layer slide underneath an unchanged page instead of discovering the
   UI grew a dependency on seeing everyone's cards.

4. **Determinism is a hard requirement.** No `Math.random()` — the seed lives in
   `GameState` and a cursor advances through it. No `Date.now()` — time enters as an `at`
   field on an action. Same state plus same action sequence yields identical state *and*
   identical events on every peer. This is the property the future turn-authority
   checkpoints rest on, so it is asserted from the first commit.

5. **Interactive pauses are explicit state, not callbacks.** A pure reducer cannot await
   input, so "discard one card to pay for this release" becomes `state.pending`, and only
   the actions that resolve it are legal. This is the main consequence of Decision 4, and
   it buys replay from `seed + action log`, tests with no mocks, and time-travel in the
   playground.

6. **`reduce` is total — it never throws.** An illegal action returns the state unchanged
   plus a `rejected` event. Under P2P a thrown exception on a malformed remote message
   would kill the tab mid-match; a rejection event is observable, loggable, assertable,
   and identical on every peer.

7. **Legality is the engine's answer, never the UI's.** `PlayerView` carries
   `playable: CardUid[]`; targets come from `legalTargets`. This retires three functions
   in `apps/ui/src/cards/catalogue.ts` — `cardCanTarget`, `isComboSource`,
   `validComboTarget` — which are already labelled *"МОК ЛОГИКИ … Реально решает логика
   друга."*

8. **Gesture state stays inside `@release/ui`.** A half-drawn targeting arrow, or a card
   selected while awaiting its Sudo partner, is presentation rather than domain. It lives
   in a `useTableInteractions` hook in the kit, testable in the playground, and the
   frontend receives only completed intents. This satisfies both house rules at once — no
   domain `useState` in the kit (the pattern from issue
   [#51](https://github.com/MythHand/ReleaseBoardGameP2P/issues/51)) and no visual
   components in `pages/`.

9. **The move history accumulates in the frontend, not in `GameState`.** Keeps future
   `TURN_RESOLVED` checkpoints small, and each peer will build its own feed from the
   events it receives anyway. Cost: a peer joining mid-game starts with an empty history.

## `@release/engine`

```
packages/engine/
  package.json          # @release/engine, private, type: module
  tsconfig.json
  vitest.config.ts
  src/
    index.ts            # public surface
    state.ts            # GameState, PlayerState, ReactionWindow, Pending
    view.ts             # PlayerView and its sub-shapes
    actions.ts          # Action, Choice, Target
    events.ts           # Event union
    engine.ts           # the Engine interface — implemented by the rules author
    rng.ts              # mulberry32, seeded and cursor-advanced
    conformance.ts      # the executable specification (see Testing)
    fake/
      index.ts          # createFakeEngine
      bots.ts           # opponent policy — an action source, not a rule
```

Mirrors `packages/translation`: private, `type: module`, `exports` pointing at source,
`@release/lint` as a dev dependency, `typecheck` and `test` scripts so `pnpm -r` picks
it up.

```ts
export interface Engine {
  createGame(config: GameConfig): GameState
  reduce(state: GameState, action: Action): { state: GameState; events: Event[] }
  project(state: GameState, viewerId: PlayerId): PlayerView
  legalTargets(state: GameState, actor: PlayerId, card: CardUid): Target[]
}
```

`GameConfig` carries the seed (the host generates it with `crypto.getRandomValues` and
passes it in), the seating order, player names, and the `Setup` mode selection.

## State model

**Card instances, not ids.** The catalogue has `qty: 7` for Bug, so two Bugs in one hand
must be distinguishable — for `Hand`'s `uid` key, for FLIP animations that need stable
identity, and for "return *this* card to the attacker" (Rollback).

```ts
type PlayerId = string
type CardId = string    // catalogue id, e.g. 'release-frontend' — resolves art and tags
type CardUid = string   // unique instance

interface CardInstance { uid: CardUid; id: CardId }
```

```ts
interface GameState {
  gameId: string
  seed: number
  rngCursor: number

  seating: PlayerId[]                      // fixed clockwise order
  players: Record<PlayerId, PlayerState>
  eliminated: PlayerId[]

  turn: {
    player: PlayerId
    index: number
    hasDrawn: boolean                      // the mandatory draw
    releasesPlayed: number                 // against the `releases` mode axis
  }

  decks: {
    main: CardInstance[][]                 // array of piles — Git Branch splits 1 → 2
    events: CardInstance[]                 // AI deck; drawn from a random position
    discard: CardInstance[]
  }

  pending: Pending | null
  window: ReactionWindow | null

  setup: Setup
  over: { winner: PlayerId; condition: 'release' | 'lastStanding' } | null
}

interface PlayerState {
  id: PlayerId
  name: string
  hand: CardInstance[]
  release: {
    frontend?: Released
    backend?: Released
    database?: Released
    monitoring?: CardInstance              // Monitoring / AI Monitoring
  }
  frozen: CardUid[]                        // DDoS freeze, one round — the returned instance
}

interface Released {
  card: CardInstance
  codeReview?: CardInstance                // lies "under" the release
}
```

Two shapes there are deliberate. `decks.main` is an **array of piles** because Git Branch
splits the draw deck and the `gitBranch` mode axis changes how you draw from a split one —
cheaper to model now than to retrofit. And `codeReview` nests *inside* `Released` rather
than occupying its own slot, because the rules bind the two at play time and they are
destroyed together.

### Reaction window

Follows [`docs/understanding.md`](../understanding.md) §7 literally.

```ts
interface ReactionWindow {
  target: { player: PlayerId; slot: ReleaseSlot; card: CardUid }
  round: number            // 1 → 15s, 2+ → 10s
  deadline: number         // absolute ms
  passed: PlayerId[]       // revocable
}
```

Opens when a Release is played **without** Code Review. Round 1 runs 15s, later rounds
10s. Passing means only "I am fine with this closing early" — a passer may still attack
while the window lives, hence `UNPASS`. The window closes on expiry or when all have
passed.

When an attack is thrown the window pauses and `pending` becomes the defender's choice.
If the release survives, the window reopens at `round + 1`. Strictly sequential, no stack
and no priority — as specified.

### Pending

Each variant carries **the legal option set**, not just the question, so the UI can render
a prompt without knowing a rule:

```ts
type Pending =
  | { kind: 'discardForRelease'; player: PlayerId; release: CardUid }
  | { kind: 'defend'; player: PlayerId; attacker: PlayerId; attack: CardUid;
      canDefendWith: CardUid[]; deadline: number }
  | { kind: 'neutralize503'; player: PlayerId;
      methods: ('debugger' | 'monitoring' | 'sacrifice')[] }
  | { kind: 'discardOne'; players: PlayerId[]; deadline: number }   // System Upgrade
  | { kind: 'pickFromDiscard'; player: PlayerId; count: 1 | 2 }     // Cherry-pick
  | { kind: 'reorderTop'; player: PlayerId; cards: CardInstance[] } // Git Rebase
  | { kind: 'requestCard'; player: PlayerId; target: PlayerId }     // Security Bug
  | { kind: 'giveCard'; player: PlayerId; requested: CardId }
  | { kind: 'handLimit'; player: PlayerId; excess: number }
```

`discardOne` is **parallel** — System Upgrade has every other player discard at once — so
`pending` can owe a decision to several players and drain as they answer, rather than
always being a single question.

## Projection

```ts
interface PlayerView {
  self: {
    id: PlayerId
    name: string
    hand: CardInstance[]        // full identity
    release: ReleaseView
    playable: CardUid[]         // legal right now — the engine's answer
  }
  opponents: {
    id: PlayerId
    name: string
    handCount: number           // count only, never identity
    release: ReleaseView
    eliminated: boolean
  }[]
  decks: { piles: number[]; events: number; discardTop?: CardId; discardCount: number }
  turn: { player: PlayerId; index: number; hasDrawn: boolean }
  window: WindowView | null
  pending: PendingView | null
  setup: Setup
  over: { winner: PlayerId; condition: 'release' | 'lastStanding' } | null
}
```

`ReleaseView`, `WindowView` and `PendingView` mirror their state counterparts with the
hidden fields dropped — `ReleaseView` carries `CardId`s rather than instances since a
released card is public, and `PendingView` omits any option set that does not belong to the
viewer.

Connection state is not here — it belongs to the session layer, and `Table`'s existing
`view` prop already covers the disconnect cases.

## Actions

```ts
type Action =
  | { type: 'DRAW';    player: PlayerId; pile?: number; at: number }
  | { type: 'PLAY';    player: PlayerId; card: CardUid; target?: Target;
      combo?: CardUid; at: number }
  | { type: 'PUSH';    player: PlayerId; at: number }
  | { type: 'ATTACK';  player: PlayerId; card: CardUid; combo?: CardUid; at: number }
  | { type: 'PASS';    player: PlayerId; at: number }
  | { type: 'UNPASS';  player: PlayerId; at: number }
  | { type: 'WINDOW_EXPIRED'; at: number }
  | { type: 'RESOLVE'; player: PlayerId; choice: Choice; at: number }
```

`pile` on `DRAW` exists for a split deck: the `gitBranch: strategic` mode has the drawer
choose a pile, while `base` draws from all of them.

`Target` is what the arrow can land on, and is also `legalTargets`' return type:

```ts
type Target =
  | { kind: 'player'; player: PlayerId }                       // hand attacks
  | { kind: 'release'; player: PlayerId; slot: ReleaseSlot }   // DDoS, Crush
  | { kind: 'monitoring'; player: PlayerId }                   // DDoS
  | { kind: 'card'; card: CardUid }                            // combo partner in hand
```

One `RESOLVE` carrying a discriminated `Choice` rather than ten bespoke action types — the
pauses differ in payload, not in kind:

```ts
type Choice =
  | { kind: 'discardForRelease'; card: CardUid }
  | { kind: 'defend'; card: CardUid | null }        // null = take the hit
  | { kind: 'neutralize503'; method: 'debugger' | 'monitoring' | 'sacrifice';
      card?: CardUid }                              // card = the sacrificed release
  | { kind: 'discardOne'; card: CardUid }
  | { kind: 'pickFromDiscard'; cards: CardUid[] }
  | { kind: 'reorderTop'; order: CardUid[] }
  | { kind: 'requestCard'; card: CardId }
  | { kind: 'giveCard'; card: CardUid }
  | { kind: 'handLimit'; cards: CardUid[] }
```

Three details earn their place. `requestCard` takes a `CardId`, not a `CardUid` — Security
Bug names a card *type* the opponent might hold, which is the entire bluff. `defend: null`
is an explicit "I could block this and I choose not to", which understanding.md §7 calls
out as a real move. And `handLimit` takes an array, because Memory Problem can leave you
several cards over.

## Events

Events feed two consumers, both in the frontend: the animation driver and `MoveHistory`.
The engine emits semantic facts and never an animation name.

```ts
interface EventBase {
  id: number
  parent?: number             // this event's cause
  visibleTo?: PlayerId[]      // absent = public
}
```

Two fields make the translation mechanical rather than inferential:

- **`visibleTo`** — the audience, declared by the engine because only the rules know what
  is secret. A `drawn` event carries the card identity to the drawer alone; the same
  moment reaches the table as a count. The sync layer will filter on exactly this field,
  so nothing changes when the network arrives.
- **`id` / `parent`** — `apps/ui/src/mocks/table.ts` shows `MoveHistory` wants a *tree*: a
  release with the attack and the defence nested beneath it. A consequence naming its
  cause lets the adapter build that tree directly instead of guessing which events belong
  together.

The union covers: `dealt`, `drawn`, `released`, `discarded`, `windowOpened`,
`windowClosed`, `attacked`, `defended`, `releaseDestroyed`, `releaseStolen`,
`releaseReturned`, `handTransfer`, `aiRevealed`, `neutralized`, `eliminated`, `gitOp`,
`turnStarted`, `turnEnded`, `gameOver`, `rejected`.

## The fake engine

The fake proves the contract and the page; it is not correct rules. So the selection
principle is **cover every distinct UI affordance, not every card** — one card per
interaction shape, with the fake's deck excluding the rest so nothing unplayable is ever
drawn.

| Affordance | Cards that exercise it |
|---|---|
| Click / drag a card into a zone | Release ×3, Monitoring |
| Arrow-select a combo partner, with snap | Sudo, Code Review |
| Arrow-target an opponent's seat | Bug (random card), Security Bug (asks by type) |
| Arrow-target a card on the table | DDoS on Monitoring, and on a protected release |
| Reaction window — attack, pass, un-pass, multi-round | Bug, Security Bug, DDoS |
| Pending prompt over your own hand | discard-for-release, defend-or-take, neutralize, hand limit |
| Defence variants | Hotfix (cancel), Not a Bug (unicorn), Rollback (returns the attack) |
| Reveal-to-all | Error 503 (and elimination), AI's two-stage reveal |
| Terminal states | three releases → `GameOver` |

The fake's **event deck** holds the AI effects that reuse a pattern already above: Crush
×3 (destroys a release, neutralized like Error 503), Release ×3 and AI Monitoring (both
auto-place into the zone), Bad Vibe-Coding (discard one), Good Vibe-Coding (draw two),
Hallucination (end turn), and the event-deck Error 503. It omits `Inside`, which takes a
Release from the discard and therefore needs the discard picker deferred below.

**Deferred deliberately:** Git Cherry-pick, Git Rebase, Git Branch, Git Merge and System
Upgrade. Each needs a bespoke UI surface — a discard picker, a private top-of-deck reorder
panel, split-pile rendering. Their `Pending` and `Choice` variants stay in the contract for
the rules author to implement, but the fake's deck omits them and the page grows those
surfaces in a later spec.

**Opponents.** The reaction window cannot be exercised solo unless someone attacks you, so
the fake ships a small opponent policy in `fake/bots.ts` — release when possible, attack a
fresh release when holding an attack, defend when able. It sits **outside** the reducer, as
a source of actions rather than a rule.

That separation is load-bearing: a bot and the future sync layer are the same kind of thing
— an action source feeding an unchanged pure reducer. Getting the second one working now is
what makes the third cheap.

## Frontend wiring

```
bots.ts ──┐
          ├─► dispatch(Action) ─► reduce() ─► { GameState, Event[] }
 you ─────┘                                        │
                                    project(state, you) ─► PlayerView
                                    visible events ────► eventLog
                                                            │
              toTableState(view, eventLog) ◄────────────────┘
                            │
                     <Table state=… actions=… />
                            │   completed intents only
                            └─► dispatch(Action)
```

Three modules, placed per the layer rules in
[`apps/frontend/CLAUDE.md`](../../apps/frontend/CLAUDE.md):

1. **`features/play-game/useGame.ts`** — owns `GameState`, calls `reduce`, keeps the
   projected view and the visible-event log. The single place a session-backed source will
   later replace.
2. **`entities/game/toTableState.ts`** — pure adapter. Resolves `CardId` → catalogue `Card`
   for art, assigns `HandItem` uids, folds the event log into `MoveHistory`'s tree via each
   event's `parent`.
3. **`pages/board/[gameId]/_layout.tsx`** — stays thin as the rules require: hook, adapter,
   `t()`, render. `PLACEHOLDER_STATE` is deleted.

`entities/game/types.ts` becomes a re-export of the engine's types, keeping the frontend's
one-way import rule intact.

### `Table` gains an interaction surface

Today `Table` is display-only. It renders `<TurnDock>` without `onDraw` / `onPush` /
`onPass` and `<Hand>` without `onCardClick` / `accentAt`, even though both components
already accept them.

It gains an action group — `onPlay`, `onDraw`, `onPush`, `onAttack`, `onPass`, `onUnpass`,
`onResolve` — plus `playable`, `pending`, `window` and a `legalTargets` callback. Gesture
state stays internal per Decision 8, and `onPlay(card, target?, combo?)` fires only on a
completed intent.

### Timers

`deadline` is absolute, so one interval derives `seconds` and `progress` for `TurnDock`'s
existing ring and dispatches `WINDOW_EXPIRED` on crossing. Locally the sandbox owns that
dispatch; under P2P it becomes the turn authority's.

### Animations

The presets in `apps/ui/src/animations/` all work rect-to-rect, so this needs a shared
anchor registry — hand slots, release slots, deck piles, discard, opponent seats — which
today exists only ad hoc inside individual playground stories. An event → preset driver
covers the flights the affordances above need: draw, play-to-zone, play-to-center,
to-discard, flip-on-reveal.

Per the animations rule in the root [`CLAUDE.md`](../../CLAUDE.md), the `Interaction audit`
story is updated with the resulting statuses.

## Failure modes

- **Illegal action.** `reduce` returns the state unchanged plus
  `{ type: 'rejected', action, reason }` (Decision 6).
- **The engine throws anyway.** Since the reducer is someone else's code, `useGame` wraps
  the call, retains the last good state, and surfaces a non-fatal banner. `_app.tsx`
  already routes render errors to `ErrorScreen`, but losing a live match to a rules bug is
  a worse outcome than a degraded one.
- **Abandoned decisions.** Only some pauses block other people. Your own choices
  (`discardForRelease`, `handLimit`) block only you and need no timer. `defend` and
  `discardOne` stall everyone, so both carry a `deadline` with a defined default on expiry
  — `defend → null` (take the hit), `discardOne → first card`. That default is the
  engine's, not the UI's, or peers diverge on a timeout.
- **Unknown card id.** `assetUrl` throws today on an unrecognised asset. A `CardId` the
  catalogue does not know is a contract violation, so `toTableState` renders a placeholder
  slot rather than taking the page down.

## Copy

New strings go in `@release/translation` as top-level blocks in `common.json` (`en` and
`ru`), which `no-untranslated.grit` enforces anyway:

- `pending` — one prompt per `Pending` kind, with its action labels
- `window` — the reaction-window banner and the attack / pass affordances
- one key for the engine-error banner

`moveHistory` needs to grow. It currently holds two keys, `draw` and `eliminated`, because
the mock supplies `HistoryEntry.kind` as a free-form Russian literal ("релиз", "атака",
"защита", …) that `MoveHistory` renders directly. The adapter maps event types to
translated labels instead, so every `kind` the event union can produce needs a key.

The other table blocks (`table`, `turnDock`, `seat`, `gameOver`, `participants`, …) are
unchanged.

## Milestones

1. **`@release/engine`** — package scaffold, contract types, `rng`, the conformance suite,
   and the fake behind it. Headless; green under `pnpm -r test`.
2. **`Table` becomes interactive** — the action surface and `useTableInteractions` in
   `apps/ui`, plus a `TableStory` mode driven by the real fake engine, so the game is
   playable at `playground/table` without the frontend.
3. **The page** — `useGame`, `toTableState`, `/board/:gameId` rendering real state,
   `PLACEHOLDER_STATE` deleted, page tests.
4. **Animations** — the anchor registry and the event → preset driver, with the
   `Interaction audit` story updated.

Milestone 2 is where the design gets validated by use, which is why the playground comes
before the route.

## Testing

The centrepiece is a conformance suite parameterised over the **contract**, not over the
fake:

```ts
// packages/engine/src/conformance.ts
export function describeEngine(name: string, make: () => Engine, skip?: Feature[]): void
```

`fake/fake.test.ts` calls `describeEngine('fake', createFakeEngine, { skip: ['gitOps',
'systemUpgrade'] })`. The real reducer calls the same function with nothing skipped. The
handoff stops being a prose document and becomes an executable specification.

The core suite asserts:

1. **Determinism** — same seed and action log yields deep-equal state *and* an identical
   event stream. This is what the future sync layer rests on, so it is checked from the
   start.
2. **Totality** — a fuzz pass of random and illegal actions never throws and always yields
   valid state.
3. **Projection privacy** — a property test over generated states: `project(state, A)`
   never contains another player's card identity.
4. **Rules invariants** transcribed from [`docs/rules/rules-board-game.md`](../rules/rules-board-game.md)
   and understanding.md §7 — no duplicate release types in a zone, releases-per-turn
   honoured per mode, hand limit enforced per mode, 15s then 10s window rounds, `UNPASS`
   works, Code Review suppresses the window entirely, DDoS is the only card that reaches a
   protected release.

Above that:

- **`apps/ui`** — gesture tests (illegal target ⇒ no dispatch; legal target ⇒ one `onPlay`
  with the right arguments) and an animation-driver test that mocks `play` and asserts
  preset plus anchors, not pixels.
- **`apps/frontend`** — page tests under `pages/board/[gameId]/__tests__/`; co-locating
  them would crash the dev server, per the generouted rule.

## Known limitations

- A peer joining mid-game starts with an empty move history (Decision 9).
- `lastStanding` is rare in free play. Elimination comes only from an unneutralized Error
  503 or Crush, so with two players the condition is reachable but seldom hit in a short
  session. The contract models it and the conformance suite drives it directly, rather than
  relying on the sandbox to produce it.
- The fake's opponent policy is deliberately shallow. It exists to make the reaction
  window reachable, not to play well.

## Out of scope

- The P2P sync layer — protocol mapping, hidden-state keeper, `TURN_RESOLVED` checkpoints,
  reconnection. Its own spec, once the real state shape exists.
- Real rules evaluation. The fake's coverage above is the boundary; everything outside it
  is the rules author's, behind the same contract.
- UI surfaces for Git Cherry-pick, Git Rebase, Git Branch / Merge and System Upgrade.
- The `Release Profit` extension, which `docs/rules/rules-board-game.md` marks as not being
  implemented.
- The open architectural question in understanding.md §4 — PNG card faces versus
  code-composed ones. Unaffected either way, since the engine deals in `CardId`.
