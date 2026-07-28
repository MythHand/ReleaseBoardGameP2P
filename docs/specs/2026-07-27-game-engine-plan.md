# Game Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@release/engine` — the contract the rules author implements against, plus a fake implementation complete enough to play a solo game headlessly, and a conformance suite both must pass.

**Architecture:** A zero-dependency workspace package holding four pure functions (`createGame`, `reduce`, `project`, `legalTargets`). No I/O, no timers, no React, no `@release/ui`. Randomness is a counter-based PRNG addressed by `(seed, cursor)` held in state; time enters as an `at` field on every action. Interactive pauses are explicit `state.pending`, never callbacks.

**Tech Stack:** TypeScript (strict, `@release/lint/tsconfig`), Vitest, pnpm workspace, Biome.

Design: [`docs/specs/2026-07-27-game-page-design.md`](./2026-07-27-game-page-design.md).

**This plan covers Milestone 1 only.** Milestones 2–4 (Table's interaction surface, the frontend wiring, animations) become `2026-07-27-game-screen-plan.md`, written after this lands — the UI tasks reference exact types from Tasks 2–4, and writing them against types that do not exist yet produces guesses instead of a plan.

**Plan-level decision closing a gap in the design.** The design forbids the engine depending on `@release/ui`, but the fake needs to know which cards exist. Resolution: card *quantities* are passed in via `GameConfig.deck` (the caller derives them from the catalogue, so the fact lives in one place), and the engine owns `CARD_RULES` — rules metadata only (kind, sudo-capability, release slot), keyed by `CardId`. Art and display tags stay in `apps/ui`. The two tables describe different facts about the same id, so this is not duplication; unifying them is a candidate follow-up, not a prerequisite.

## Global Constraints

- **`packages/engine` has no runtime dependencies.** Its `package.json` carries no `dependencies` field at all — not `@release/ui`, not `@release/translation`, not React, not `apps/frontend/src/network`. A single runtime import of anything outside the package is a review rejection. Dev dependencies are limited to the test and lint toolchain (`vitest`, `@release/lint`).
- **Purity is absolute.** No `Math.random()` — use `randomAt(seed, cursor)` from `src/rng.ts` and advance the cursor through state. No `Date.now()`, no `performance.now()`, no `new Date()` — time arrives as `action.at`. No `console.*`. No mutation of an input argument: every function returns new objects.
- **`reduce` never throws.** An illegal or unrecognised action returns `{ state, events: [rejectedEvent] }` with the state referentially unchanged.
- **`rejected` is a diagnostic event, not a game fact.** Because rejection leaves the state referentially unchanged, `eventSeq` cannot advance, so consecutive rejections necessarily reuse an id. That is correct rather than a defect — a `rejected` event records that nothing happened. It carries no causal role, is never a `parent`, must never be appended to the move-history log, and is excluded from any id-uniqueness or monotonicity guarantee. Those guarantees bind only events that describe a state change.
- **No code comments in Russian.** English only (root [`CLAUDE.md`](../../CLAUDE.md)). Existing Russian comments elsewhere in the repo are legacy and are not a licence.
- **`CardId` values are exactly the catalogue's ids** from `apps/ui/src/cards/catalogue.ts` — `release-frontend`, `attack-security-bug`, `defense-not-a-bug`, `protection-debugger`, `support-code-review`, `trigger-error-503`, `trigger-ai`, `ai-crush-database`, … Read that file for the authoritative spelling; a typo here is a silent runtime miss.
- Every task ends with `pnpm -r typecheck` and `pnpm --filter @release/engine test` green before its commit. The repo's pre-commit hook runs `pnpm typecheck` across all packages.
- Branch: `game-page-design`.

---

## File Structure

**Created — all under `packages/engine/`**

| File | Responsibility |
|---|---|
| `package.json` | `@release/engine`, private, ESM, `exports` → source, `typecheck` + `test` scripts |
| `tsconfig.json` | Extends `@release/lint/tsconfig`; `types: ["vitest/globals"]` |
| `vitest.config.ts` | Node environment, globals on |
| `src/rng.ts` | `randomAt(seed, cursor)`, `shuffle(items, seed, cursor)` |
| `src/rng.test.ts` | Determinism, permutation preservation, cursor advance |
| `src/state.ts` | `GameState`, `PlayerState`, `Released`, `ReactionWindow`, `Pending`, id aliases |
| `src/view.ts` | `PlayerView`, `ReleaseView`, `WindowView`, `PendingView` |
| `src/actions.ts` | `Action`, `Choice`, `Target` |
| `src/events.ts` | `Event` union, `EventBase` |
| `src/cards.ts` | `CARD_RULES`, `SUPPORTED`, `rulesFor` |
| `src/cards.test.ts` | Table coverage + internal consistency |
| `src/engine.ts` | The `Engine` interface and `GameConfig` |
| `src/conformance.ts` | `describeEngine` — the executable specification |
| `src/index.ts` | Public surface |
| `src/fake/setup.ts` | `createGame` — deck build, shuffle, the deal |
| `src/fake/setup.test.ts` | Opening-hand rules, deck accounting, determinism |
| `src/fake/project.ts` | `project` — the privacy boundary |
| `src/fake/project.test.ts` | Own hand full, opponents counts only, no id leaks |
| `src/fake/core.ts` | Shared helpers every module needs: `createLog`, `Log`, `reject`, `setHand` |
| `src/fake/reduce.ts` | `reduce` — dispatch + turn cycle |
| `src/fake/reduce.test.ts` | Turn cycle, hand limit, rejection |
| `src/fake/release.ts` | Release play, discard cost, win detection |
| `src/fake/release.test.ts` | Zone rules, releases-per-turn, win |
| `src/fake/window.ts` | Reaction window open/attack/pass/unpass/expire |
| `src/fake/window.test.ts` | Round timings, revocable pass, Code Review suppression |
| `src/fake/attacks.ts` | Attack resolution, defenses, sudo, DDoS, freeze |
| `src/fake/attacks.test.ts` | Each defense type, sudo vs cancel/unicorn, DDoS reach |
| `src/fake/triggers.ts` | Error 503, neutralize, elimination, AI + event deck |
| `src/fake/triggers.test.ts` | Reveal, three neutralize methods, elimination |
| `src/fake/bots.ts` | Opponent policy — an action source, not a rule |
| `src/fake/bots.test.ts` | Chooses legal actions only; drives a window to completion |
| `src/fake/index.ts` | `createFakeEngine`, `FAKE_DECK`, `FAKE_EVENTS` |
| `src/fake/fake.test.ts` | Runs `describeEngine` against the fake |

**Modified**

| File | Change |
|---|---|
| `pnpm-workspace.yaml` | No change needed — `packages/*` already matches |

---

## Task 1: Package scaffold + seeded RNG

**Files:**
- Create: `packages/engine/package.json`
- Create: `packages/engine/tsconfig.json`
- Create: `packages/engine/vitest.config.ts`
- Create: `packages/engine/src/rng.ts`
- Test: `packages/engine/src/rng.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export function randomAt(seed: number, cursor: number): number          // [0, 1)
  export function shuffle<T>(
    items: readonly T[], seed: number, cursor: number,
  ): { items: T[]; cursor: number }
  ```
  `shuffle` advances the cursor by `items.length - 1` and returns it, so a caller writes the returned cursor back into `GameState.rngCursor`.

- [ ] **Step 1: Create the package files**

`packages/engine/package.json`:

```json
{
  "name": "@release/engine",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./fake": "./src/fake/index.ts"
  },
  "scripts": {
    "typecheck": "release-tsc --noEmit -p tsconfig.json",
    "test": "vitest run"
  },
  "devDependencies": {
    "vitest": "^4.1.9",
    "@release/lint": "workspace:*"
  }
}
```

`packages/engine/tsconfig.json`:

```json
{
  "extends": "@release/lint/tsconfig",
  "compilerOptions": {
    "types": ["vitest/globals"]
  },
  "include": ["src"]
}
```

`packages/engine/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

// Node environment: the engine is pure logic with no DOM surface.
export default defineConfig({
  test: { environment: 'node', globals: true },
})
```

Then install so the workspace link exists:

```bash
pnpm install
```

- [ ] **Step 2: Write the failing test**

Create `packages/engine/src/rng.test.ts`:

```ts
import { randomAt, shuffle } from './rng'

it('is a pure function of seed and cursor', () => {
  expect(randomAt(42, 7)).toBe(randomAt(42, 7))
  expect(randomAt(42, 7)).not.toBe(randomAt(42, 8))
  expect(randomAt(42, 7)).not.toBe(randomAt(43, 7))
})

it('returns values in [0, 1)', () => {
  for (let c = 0; c < 500; c += 1) {
    const v = randomAt(12345, c)
    expect(v).toBeGreaterThanOrEqual(0)
    expect(v).toBeLessThan(1)
  }
})

it('shuffles deterministically for a given seed and cursor', () => {
  const input = [1, 2, 3, 4, 5, 6, 7, 8]
  const a = shuffle(input, 99, 0)
  const b = shuffle(input, 99, 0)
  expect(a.items).toEqual(b.items)
  expect(shuffle(input, 100, 0).items).not.toEqual(a.items)
})

it('preserves the multiset and leaves the input untouched', () => {
  const input = [1, 2, 3, 4, 5, 6, 7, 8]
  const { items } = shuffle(input, 7, 3)
  expect([...items].sort((x, y) => x - y)).toEqual(input)
  expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
})

it('advances the cursor by length - 1', () => {
  expect(shuffle([1, 2, 3, 4, 5], 7, 10).cursor).toBe(14)
  expect(shuffle([], 7, 10).cursor).toBe(10)
  expect(shuffle([1], 7, 10).cursor).toBe(10)
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @release/engine test`
Expected: FAIL — `Failed to resolve import "./rng"`.

- [ ] **Step 4: Write the implementation**

Create `packages/engine/src/rng.ts`:

```ts
// Counter-based PRNG. Deliberately NOT a stateful generator: a pure reducer must
// be able to compute the same value from a serialized GameState on any peer, so
// randomness is addressed by (seed, cursor) rather than advanced in a closure.
// Integer hash in the lowbias32 family — cheap and well distributed over a counter.
export function randomAt(seed: number, cursor: number): number {
  let t = (seed + cursor * 0x9e3779b9) >>> 0
  t = Math.imul(t ^ (t >>> 16), 0x21f0aaad) >>> 0
  t = Math.imul(t ^ (t >>> 15), 0x735a2d97) >>> 0
  t = (t ^ (t >>> 15)) >>> 0
  return t / 0x100000000
}

// Fisher-Yates over a copy. Returns the advanced cursor so the caller can write
// it back into state — the cursor is the only record of how much randomness has
// been consumed.
export function shuffle<T>(
  items: readonly T[],
  seed: number,
  cursor: number,
): { items: T[]; cursor: number } {
  const out = items.slice()
  let c = cursor
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(randomAt(seed, c) * (i + 1))
    c += 1
    const swap = out[i] as T
    out[i] = out[j] as T
    out[j] = swap
  }
  return { items: out, cursor: c }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @release/engine test`
Expected: PASS — 5 tests.

Then: `pnpm -r typecheck`
Expected: all packages Done.

- [ ] **Step 6: Commit**

```bash
git add packages/engine pnpm-lock.yaml
git commit -m "feat(engine): package scaffold and counter-based seeded PRNG"
```

---

## Task 2: Contract types + card rules table

The types are the handoff artifact, so they land before any behaviour. The card table gives this task a real test cycle: it is data with invariants worth asserting.

**Files:**
- Create: `packages/engine/src/state.ts`
- Create: `packages/engine/src/view.ts`
- Create: `packages/engine/src/actions.ts`
- Create: `packages/engine/src/events.ts`
- Create: `packages/engine/src/engine.ts`
- Create: `packages/engine/src/cards.ts`
- Create: `packages/engine/src/index.ts`
- Test: `packages/engine/src/cards.test.ts`

**Reference:** `apps/ui/src/cards/catalogue.ts` for the authoritative `CardId` spellings and quantities. Read it; copy the ids, not the file.

**Interfaces:**
- Consumes: nothing.
- Produces every type the rest of the plan and the screen plan reference. Exact definitions are in Step 1.

- [ ] **Step 1: Write the type modules**

`packages/engine/src/state.ts`:

```ts
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
```

`packages/engine/src/actions.ts`:

```ts
import type { CardId, CardUid, NeutralizeMethod, PlayerId, ReleaseSlot } from './state'

export type Target =
  | { kind: 'player'; player: PlayerId }
  | { kind: 'release'; player: PlayerId; slot: ReleaseSlot }
  | { kind: 'monitoring'; player: PlayerId }
  | { kind: 'card'; card: CardUid }

export type Choice =
  | { kind: 'discardForRelease'; card: CardUid }
  // null is an explicit "I could block this and I choose not to".
  | { kind: 'defend'; card: CardUid | null }
  | { kind: 'neutralize503'; method: NeutralizeMethod; card?: CardUid }
  | { kind: 'crush'; method: NeutralizeMethod; card?: CardUid }
  // Security Bug names a card TYPE the opponent might hold — that is the bluff.
  | { kind: 'requestCard'; card: CardId }
  | { kind: 'giveCard'; card: CardUid }
  // An array: Memory Problem can leave a hand several cards over the limit.
  | { kind: 'handLimit'; cards: CardUid[] }

export type Action =
  | { type: 'DRAW'; player: PlayerId; pile?: number; at: number }
  | {
      type: 'PLAY'
      player: PlayerId
      card: CardUid
      target?: Target
      combo?: CardUid
      at: number
    }
  | { type: 'PUSH'; player: PlayerId; at: number }
  | { type: 'ATTACK'; player: PlayerId; card: CardUid; combo?: CardUid; at: number }
  | { type: 'PASS'; player: PlayerId; at: number }
  | { type: 'UNPASS'; player: PlayerId; at: number }
  | { type: 'WINDOW_EXPIRED'; at: number }
  | { type: 'RESOLVE'; player: PlayerId; choice: Choice; at: number }

export type ActionType = Action['type']
```

`packages/engine/src/events.ts`:

```ts
import type { Action } from './actions'
import type { CardId, NeutralizeMethod, PlayerId, ReleaseSlot } from './state'

export interface EventBase {
  id: number
  // The causing event's id. A defence names the attack it answered, an attack
  // names the release it targeted — so the history tree needs no inference.
  parent?: number
  // The audience, declared by the engine because only the rules know what is
  // secret. Absent means public. The future sync layer filters on this field.
  visibleTo?: PlayerId[]
}

export type Event = EventBase &
  (
    | { type: 'dealt'; player: PlayerId; count: number }
    | { type: 'drawn'; player: PlayerId; card?: CardId; pile: number; deckSize: number }
    | { type: 'released'; player: PlayerId; slot: ReleaseSlot; card: CardId; codeReview?: CardId }
    | { type: 'placed'; player: PlayerId; card: CardId }
    | { type: 'discarded'; player: PlayerId; card: CardId; reason: DiscardReason }
    | { type: 'windowOpened'; player: PlayerId; slot: ReleaseSlot; round: number; deadline: number }
    | { type: 'windowClosed'; player: PlayerId; slot: ReleaseSlot }
    | { type: 'passed'; player: PlayerId }
    | { type: 'unpassed'; player: PlayerId }
    | { type: 'attacked'; attacker: PlayerId; card: CardId; sudo: boolean; target: PlayerId }
    | { type: 'defended'; player: PlayerId; card: CardId; effect: DefenceEffect }
    | { type: 'tookHit'; player: PlayerId }
    | { type: 'releaseDestroyed'; player: PlayerId; slot: ReleaseSlot; card: CardId }
    | { type: 'releaseStolen'; from: PlayerId; to: PlayerId; slot: ReleaseSlot; card: CardId }
    | { type: 'releaseReturned'; player: PlayerId; slot: ReleaseSlot; card: CardId }
    | { type: 'monitoringDestroyed'; player: PlayerId; card: CardId }
    | { type: 'handTransfer'; from: PlayerId; to: PlayerId; card?: CardId }
    | { type: 'requested'; attacker: PlayerId; target: PlayerId; card: CardId; hit: boolean }
    | { type: 'revealed'; player: PlayerId; card: CardId }
    | { type: 'aiRevealed'; player: PlayerId; aiCard: CardId; eventCard: CardId }
    | { type: 'neutralized'; player: PlayerId; method: NeutralizeMethod }
    | { type: 'eliminated'; player: PlayerId }
    | { type: 'turnStarted'; player: PlayerId; index: number }
    | { type: 'turnEnded'; player: PlayerId }
    | { type: 'gameOver'; winner: PlayerId; condition: 'release' | 'lastStanding' }
    | { type: 'rejected'; action: Action; reason: string }
  )

export type DiscardReason =
  | 'releaseCost'
  | 'handLimit'
  | 'attackSpent'
  | 'defenceSpent'
  | 'destroyed'
  | 'neutralized'
  | 'trigger'
  | 'effect'

export type DefenceEffect = 'cancel' | 'return' | 'reflect' | 'take'

export type EventType = Event['type']
```

`packages/engine/src/view.ts`:

```ts
import type { CardInstance, CardId, CardUid, NeutralizeMethod, PlayerId, ReleaseSlot, Setup } from './state'

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
      deadline: number
    }
  | { kind: 'neutralize503'; player: PlayerId; methods: NeutralizeMethod[] }
  | { kind: 'crush'; player: PlayerId; slot: ReleaseSlot; methods: NeutralizeMethod[] }
  | { kind: 'requestCard'; player: PlayerId; target: PlayerId }
  | { kind: 'giveCard'; player: PlayerId; requested: CardId }
  | { kind: 'handLimit'; player: PlayerId; excess: number; options: CardUid[] }

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
```

`packages/engine/src/engine.ts`:

```ts
import type { Action, Target } from './actions'
import type { Event } from './events'
import type { CardId, CardUid, GameState, PlayerId, Setup } from './state'
import type { PlayerView } from './view'

// Deck composition, supplied by the caller from the card catalogue so quantities
// live in exactly one place.
export interface DeckEntry {
  id: CardId
  qty: number
}

export interface GameConfig {
  gameId: string
  // The host generates this with crypto.getRandomValues and passes it in; the
  // engine never sources randomness itself.
  seed: number
  players: { id: PlayerId; name: string }[]
  setup: Setup
  deck: DeckEntry[]
  events: DeckEntry[]
}

export interface Reduction {
  state: GameState
  events: Event[]
}

export interface Engine {
  createGame(config: GameConfig): GameState
  // Total: never throws. An illegal action returns the state unchanged plus a
  // `rejected` event.
  reduce(state: GameState, action: Action): Reduction
  project(state: GameState, viewerId: PlayerId): PlayerView
  legalTargets(state: GameState, actor: PlayerId, card: CardUid): Target[]
}
```

`packages/engine/src/cards.ts`:

```ts
import type { CardId, ReleaseSlot } from './state'

// Rules metadata only. Art, display names and visual tags stay in
// apps/ui/src/cards/catalogue.ts; the two tables describe different facts about
// the same id and are joined by that id.
export type CardKind =
  | 'release'
  | 'attack'
  | 'cancel'
  | 'unicorn'
  | 'protection'
  | 'support'
  | 'trigger'
  | 'ai'

export interface CardRules {
  kind: CardKind
  // Has a sudo-enhanced variant, playable only with support-sudo alongside.
  sudo?: boolean
  // Release cards only: which zone slot they occupy.
  slot?: ReleaseSlot
}

// The ids the fake implements. Git operations (operation-*) and ai-inside are
// deliberately absent — each needs a bespoke UI surface, deferred per the design.
export const CARD_RULES: Record<CardId, CardRules> = {
  'release-frontend': { kind: 'release', slot: 'frontend' },
  'release-backend': { kind: 'release', slot: 'backend' },
  'release-database': { kind: 'release', slot: 'database' },

  'attack-bug': { kind: 'attack', sudo: true },
  'attack-out-of-memory': { kind: 'attack', sudo: true },
  'attack-legacy-code': { kind: 'attack', sudo: true },
  'attack-security-bug': { kind: 'attack', sudo: true },
  'attack-ddos': { kind: 'attack' },

  'defense-hotfix': { kind: 'cancel' },
  'defense-rubber-ducky': { kind: 'cancel' },
  'defense-pr-approved': { kind: 'cancel' },
  'defense-rollback': { kind: 'cancel', sudo: true },
  'defense-not-a-bug': { kind: 'unicorn' },
  'defense-works-on-my-machine': { kind: 'unicorn' },

  'protection-monitoring': { kind: 'protection' },
  'protection-debugger': { kind: 'protection' },

  'support-sudo': { kind: 'support' },
  'support-code-review': { kind: 'support' },

  'trigger-error-503': { kind: 'trigger' },
  'trigger-ai': { kind: 'trigger' },

  'ai-crush-frontend': { kind: 'ai' },
  'ai-crush-backend': { kind: 'ai' },
  'ai-crush-database': { kind: 'ai' },
  'ai-monitoring': { kind: 'ai' },
  'ai-release-frontend': { kind: 'ai' },
  'ai-release-backend': { kind: 'ai' },
  'ai-release-database': { kind: 'ai' },
  'ai-good-vibe-coding': { kind: 'ai' },
  'ai-bad-vibe-coding': { kind: 'ai' },
  'ai-hallucination': { kind: 'ai' },
  'ai-error-503': { kind: 'ai' },
}

export const SUPPORTED: ReadonlySet<CardId> = new Set(Object.keys(CARD_RULES))

// Undefined for an id the engine does not implement — callers treat that as
// "not playable" rather than an error, so an unsupported card in a deck is inert
// instead of fatal.
export const rulesFor = (id: CardId): CardRules | undefined => CARD_RULES[id]

// The four attacks that a fresh release is vulnerable to. DDoS is excluded: it is
// the only card that reaches a Code Review-protected release or a Monitoring, and
// it does not destroy a bare release, so it resolves on its own path.
export const RELEASE_ATTACKS: ReadonlySet<CardId> = new Set([
  'attack-bug',
  'attack-out-of-memory',
  'attack-legacy-code',
  'attack-security-bug',
])
```

`packages/engine/src/index.ts`:

```ts
export { CARD_RULES, type CardKind, type CardRules, RELEASE_ATTACKS, rulesFor, SUPPORTED } from './cards'
export type { Action, ActionType, Choice, Target } from './actions'
export { describeEngine, type ConformanceOptions } from './conformance'
export type { DeckEntry, Engine, GameConfig, Reduction } from './engine'
export type { DefenceEffect, DiscardReason, Event, EventBase, EventType } from './events'
export { randomAt, shuffle } from './rng'
export type {
  CardId,
  CardInstance,
  CardUid,
  GameState,
  NeutralizeMethod,
  Pending,
  PlayerId,
  PlayerState,
  ReactionWindow,
  Released,
  ReleaseSlot,
  Setup,
} from './state'
export type {
  OpponentView,
  PendingView,
  PlayerView,
  ReleasedView,
  ReleaseView,
  WindowView,
} from './view'
```

> `index.ts` re-exports `describeEngine` from `./conformance`, which Task 5 creates. Until then this line is a typecheck error — so add it in Task 5, not now. Write `index.ts` without that line for this task.

- [ ] **Step 2: Write the failing test**

Create `packages/engine/src/cards.test.ts`:

```ts
import { CARD_RULES, RELEASE_ATTACKS, rulesFor, SUPPORTED } from './cards'

it('exposes every table key as supported', () => {
  expect(SUPPORTED.size).toBe(Object.keys(CARD_RULES).length)
  for (const id of Object.keys(CARD_RULES)) expect(SUPPORTED.has(id)).toBe(true)
})

it('gives every release card a distinct slot', () => {
  const slots = Object.entries(CARD_RULES)
    .filter(([, r]) => r.kind === 'release')
    .map(([, r]) => r.slot)
  expect(slots.sort()).toEqual(['backend', 'database', 'frontend'])
})

it('assigns a slot only to release cards', () => {
  for (const [id, r] of Object.entries(CARD_RULES)) {
    if (r.kind !== 'release') expect(r.slot, id).toBeUndefined()
    else expect(r.slot, id).toBeDefined()
  }
})

it('treats every release attack as a supported attack card', () => {
  for (const id of RELEASE_ATTACKS) {
    expect(rulesFor(id)?.kind, id).toBe('attack')
  }
  // DDoS attacks, but not on this path — it is the only card reaching a
  // protected release or a Monitoring.
  expect(rulesFor('attack-ddos')?.kind).toBe('attack')
  expect(RELEASE_ATTACKS.has('attack-ddos')).toBe(false)
})

it('omits the deferred cards', () => {
  for (const id of [
    'operation-git-branch',
    'operation-git-merge',
    'operation-git-rebase',
    'operation-git-cherry-pick',
    'operation-system-upgrade',
    'ai-inside',
  ]) {
    expect(rulesFor(id), id).toBeUndefined()
  }
})

it('returns undefined for an unknown id rather than throwing', () => {
  expect(() => rulesFor('not-a-card')).not.toThrow()
  expect(rulesFor('not-a-card')).toBeUndefined()
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @release/engine test`
Expected: FAIL — `Failed to resolve import "./cards"`.

- [ ] **Step 4: Confirm the implementation from Step 1 satisfies it**

The tables in Step 1 are the implementation. If any assertion fails, the table is wrong — fix `cards.ts`, not the test.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @release/engine test`
Expected: PASS — Task 1's 5 tests plus these 6.

Then: `pnpm -r typecheck`
Expected: all Done. A failure here means a type module references something undeclared.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src
git commit -m "feat(engine): contract types and the card rules table"
```

---

## Task 3: `createGame` — deck build and the deal

Implements the setup rules from [`docs/rules-board-game.md`](../rules-board-game.md) §Подготовка: one Debugger plus four random cards each, with AI and Error 503 returned to the deck and replaced, then a shuffle.

**Files:**
- Create: `packages/engine/src/fake/setup.ts`
- Test: `packages/engine/src/fake/setup.test.ts`

**Interfaces:**
- Consumes: `shuffle` from `../rng`; `SUPPORTED` from `../cards`; `GameConfig`, `DeckEntry` from `../engine`; `CardInstance`, `GameState`, `PlayerId`, `PlayerState` from `../state`.
- Produces:
  ```ts
  export function createGame(config: GameConfig): GameState
  export function expand(entries: readonly DeckEntry[]): CardInstance[]
  export const OPENING_EXCLUDED: ReadonlySet<CardId>
  ```
  `expand` assigns deterministic uids of the form `` `${id}#${n}` `` — no counter state, so two runs of the same config produce identical uids and `reduce` stays replayable.

- [ ] **Step 1: Write the failing test**

Create `packages/engine/src/fake/setup.test.ts`:

```ts
import type { GameConfig } from '../engine'
import { createGame, expand, OPENING_EXCLUDED } from './setup'

const DECK = [
  { id: 'release-frontend', qty: 4 },
  { id: 'release-backend', qty: 4 },
  { id: 'release-database', qty: 5 },
  { id: 'attack-bug', qty: 7 },
  { id: 'attack-security-bug', qty: 5 },
  { id: 'attack-ddos', qty: 6 },
  { id: 'defense-hotfix', qty: 3 },
  { id: 'defense-not-a-bug', qty: 2 },
  { id: 'protection-monitoring', qty: 4 },
  { id: 'protection-debugger', qty: 8 },
  { id: 'support-sudo', qty: 5 },
  { id: 'support-code-review', qty: 5 },
  { id: 'trigger-error-503', qty: 7 },
  { id: 'trigger-ai', qty: 12 },
]

const EVENTS = [
  { id: 'ai-crush-frontend', qty: 2 },
  { id: 'ai-hallucination', qty: 2 },
]

const config = (over: Partial<GameConfig> = {}): GameConfig => ({
  gameId: 'g1',
  seed: 4242,
  players: [
    { id: 'p1', name: 'you' },
    { id: 'p2', name: 'kernel_panic' },
    { id: 'p3', name: 'segfault' },
  ],
  setup: { handLimit: 'base', releases: 'base', releaseCond: 'base', ai: 'base', gitBranch: 'base' },
  deck: DECK,
  events: EVENTS,
  ...over,
})

it('assigns deterministic uids and honours quantities', () => {
  const items = expand([{ id: 'attack-bug', qty: 3 }])
  expect(items).toEqual([
    { uid: 'attack-bug#0', id: 'attack-bug' },
    { uid: 'attack-bug#1', id: 'attack-bug' },
    { uid: 'attack-bug#2', id: 'attack-bug' },
  ])
})

it('deals five cards to every player', () => {
  const s = createGame(config())
  for (const id of s.seating) expect(s.players[id].hand).toHaveLength(5)
})

// "One Debugger plus 4 random" — and those 4 come from a deck that still holds
// other Debuggers, so a second one by chance is rules-correct. The guarantee is
// a floor, not an exact count. Swept across seeds so it cannot pass by luck.
it('guarantees every player at least one Debugger, on any seed', () => {
  for (let seed = 0; seed < 50; seed += 1) {
    const s = createGame(config({ seed }))
    for (const id of s.seating) {
      const n = s.players[id].hand.filter((c) => c.id === 'protection-debugger').length
      expect(n, `seed ${seed}, ${id}`).toBeGreaterThanOrEqual(1)
    }
  }
})

it('keeps AI and Error 503 out of every opening hand', () => {
  const s = createGame(config())
  for (const id of s.seating) {
    for (const c of s.players[id].hand) {
      expect(OPENING_EXCLUDED.has(c.id), `${id} holds ${c.id}`).toBe(false)
    }
  }
})

it('accounts for every card exactly once', () => {
  const s = createGame(config())
  const dealt = s.seating.flatMap((id) => s.players[id].hand.map((c) => c.uid))
  const inDeck = s.decks.main.flat().map((c) => c.uid)
  const all = [...dealt, ...inDeck, ...s.decks.discard.map((c) => c.uid)]
  const total = DECK.reduce((n, e) => n + e.qty, 0)
  expect(all).toHaveLength(total)
  expect(new Set(all).size).toBe(total)
})

it('starts with one draw pile, an events deck and an empty discard', () => {
  const s = createGame(config())
  expect(s.decks.main).toHaveLength(1)
  expect(s.decks.events).toHaveLength(4)
  expect(s.decks.discard).toEqual([])
})

it('is deterministic for a given seed and divergent across seeds', () => {
  expect(createGame(config())).toEqual(createGame(config()))
  expect(createGame(config({ seed: 99 })).players.p1.hand).not.toEqual(
    createGame(config()).players.p1.hand,
  )
})

it('excludes deck entries the engine does not implement', () => {
  const s = createGame(
    config({ deck: [...DECK, { id: 'operation-git-branch', qty: 3 }, { id: 'ai-inside', qty: 2 }] }),
  )
  const ids = [...s.seating.flatMap((id) => s.players[id].hand), ...s.decks.main.flat()].map(
    (c) => c.id,
  )
  expect(ids).not.toContain('operation-git-branch')
  expect(ids).not.toContain('ai-inside')
})

it('opens on the first seat with nothing drawn or released', () => {
  const s = createGame(config())
  expect(s.turn).toEqual({ player: 'p1', index: 0, hasDrawn: false, releasesPlayed: 0 })
  expect(s.window).toBeNull()
  expect(s.pending).toBeNull()
  expect(s.over).toBeNull()
  expect(s.eliminated).toEqual([])
  expect(s.eventSeq).toBe(0)
})

it('leaves every release zone empty', () => {
  const s = createGame(config())
  for (const id of s.seating) {
    expect(s.players[id].release).toEqual({})
    expect(s.players[id].frozen).toEqual([])
  }
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @release/engine test src/fake/setup.test.ts`
Expected: FAIL — `Failed to resolve import "./setup"`.

- [ ] **Step 3: Write the implementation**

Create `packages/engine/src/fake/setup.ts`:

```ts
import { SUPPORTED } from '../cards'
import type { DeckEntry, GameConfig } from '../engine'
import { shuffle } from '../rng'
import type { CardId, CardInstance, GameState, PlayerId, PlayerState } from '../state'

// Trigger cards cannot sit in an opening hand: their effect fires on the draw, so
// holding one from setup would mean an unfired trigger (rules, Подготовка §3).
export const OPENING_EXCLUDED: ReadonlySet<CardId> = new Set(['trigger-error-503', 'trigger-ai'])

const OPENING_HAND = 5

// Deterministic uids: `${id}#${n}`. A counter would make two runs of the same
// config produce different uids, which would break replay from seed + action log.
export function expand(entries: readonly DeckEntry[]): CardInstance[] {
  const out: CardInstance[] = []
  for (const e of entries) {
    for (let n = 0; n < e.qty; n += 1) out.push({ uid: `${e.id}#${n}`, id: e.id })
  }
  return out
}

export function createGame(config: GameConfig): GameState {
  const { seed } = config
  let cursor = 0

  // An unsupported id would be an inert card nobody can ever play, so it never
  // enters the deck.
  const supported = config.deck.filter((e) => SUPPORTED.has(e.id))
  const first = shuffle(expand(supported), seed, cursor)
  cursor = first.cursor

  // Reserve one Debugger per player before dealing, so the guaranteed opening
  // card cannot depend on where the shuffle happened to put them.
  const debuggers: CardInstance[] = []
  const rest: CardInstance[] = []
  for (const c of first.items) {
    if (c.id === 'protection-debugger' && debuggers.length < config.players.length) {
      debuggers.push(c)
    } else {
      rest.push(c)
    }
  }

  const players: Record<PlayerId, PlayerState> = {}
  // Cards skipped because they are trigger cards go back into the deck, which is
  // then reshuffled — the rules' "return them and take others" (Подготовка §3-4).
  const skipped: CardInstance[] = []
  let i = 0

  for (const [n, p] of config.players.entries()) {
    const hand: CardInstance[] = []
    const dbg = debuggers[n]
    if (dbg) hand.push(dbg)
    while (hand.length < OPENING_HAND && i < rest.length) {
      const c = rest[i]
      i += 1
      if (OPENING_EXCLUDED.has(c.id)) skipped.push(c)
      else hand.push(c)
    }
    players[p.id] = {
      id: p.id,
      name: p.name,
      hand,
      release: {},
      frozen: [],
    }
  }

  const remaining = shuffle([...skipped, ...rest.slice(i)], seed, cursor)
  cursor = remaining.cursor

  const eventDeck = shuffle(
    expand(config.events.filter((e) => SUPPORTED.has(e.id))),
    seed,
    cursor,
  )
  cursor = eventDeck.cursor

  const seating = config.players.map((p) => p.id)

  return {
    gameId: config.gameId,
    seed,
    rngCursor: cursor,
    eventSeq: 0,
    seating,
    players,
    eliminated: [],
    turn: { player: seating[0], index: 0, hasDrawn: false, releasesPlayed: 0 },
    decks: { main: [remaining.items], events: eventDeck.items, discard: [] },
    pending: null,
    window: null,
    setup: config.setup,
    over: null,
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @release/engine test`
Expected: PASS — all 10 setup tests plus the earlier suites.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/fake
git commit -m "feat(engine): createGame builds the deck and deals opening hands"
```

---

## Task 4: `project` — the privacy boundary

The one function that decides what a seat may know. Its test is the reason the design forbids the page from touching `GameState`.

**Files:**
- Create: `packages/engine/src/fake/project.ts`
- Test: `packages/engine/src/fake/project.test.ts`

**Interfaces:**
- Consumes: `GameState`, `PlayerId`, `Released` from `../state`; the view types from `../view`; `rulesFor` from `../cards`.
- Produces:
  ```ts
  export function project(state: GameState, viewerId: PlayerId): PlayerView
  export function playableFor(state: GameState, viewerId: PlayerId): CardUid[]
  ```
  `playableFor` is exported separately because Task 6 onward needs it to validate an incoming `PLAY`, and duplicating legality between validation and projection is how the two silently diverge.

- [ ] **Step 1: Write the failing test**

Create `packages/engine/src/fake/project.test.ts`:

```ts
import type { GameConfig } from '../engine'
import { project } from './project'
import { createGame } from './setup'

const config = (): GameConfig => ({
  gameId: 'g1',
  seed: 4242,
  players: [
    { id: 'p1', name: 'you' },
    { id: 'p2', name: 'kernel_panic' },
  ],
  setup: { handLimit: 'base', releases: 'base', releaseCond: 'base', ai: 'base', gitBranch: 'base' },
  deck: [
    { id: 'release-frontend', qty: 4 },
    { id: 'attack-bug', qty: 7 },
    { id: 'protection-debugger', qty: 8 },
    { id: 'support-sudo', qty: 5 },
    { id: 'trigger-ai', qty: 12 },
  ],
  events: [{ id: 'ai-hallucination', qty: 2 }],
})

it('shows the viewer their own hand in full', () => {
  const s = createGame(config())
  const v = project(s, 'p1')
  expect(v.self.id).toBe('p1')
  expect(v.self.hand).toEqual(s.players.p1.hand)
})

it('reduces opponents to a hand count', () => {
  const s = createGame(config())
  const v = project(s, 'p1')
  expect(v.opponents).toHaveLength(1)
  expect(v.opponents[0].id).toBe('p2')
  expect(v.opponents[0].handCount).toBe(5)
  expect(JSON.stringify(v.opponents[0])).not.toContain('uid')
})

it('leaks no opponent card identity anywhere in the view', () => {
  const s = createGame(config())
  const v = project(s, 'p1')
  const serialized = JSON.stringify(v)
  for (const c of s.players.p2.hand) {
    expect(serialized, `leaked ${c.uid}`).not.toContain(c.uid)
  }
})

it('never reveals the ordered draw pile, only its size', () => {
  const s = createGame(config())
  const v = project(s, 'p1')
  expect(v.decks.piles).toEqual([s.decks.main[0].length])
  const serialized = JSON.stringify(v)
  for (const c of s.decks.main[0]) {
    expect(serialized, `leaked ${c.uid}`).not.toContain(c.uid)
  }
})

it('publishes the discard top and count', () => {
  const s = createGame(config())
  const withDiscard = {
    ...s,
    decks: { ...s.decks, discard: [{ uid: 'attack-bug#0', id: 'attack-bug' }] },
  }
  const v = project(withDiscard, 'p1')
  expect(v.decks.discardTop).toBe('attack-bug')
  expect(v.decks.discardCount).toBe(1)
})

it('publishes release zones as card ids for both sides', () => {
  const s = createGame(config())
  const placed = {
    ...s,
    players: {
      ...s.players,
      p2: {
        ...s.players.p2,
        release: {
          frontend: {
            card: { uid: 'release-frontend#0', id: 'release-frontend' },
            codeReview: { uid: 'support-code-review#0', id: 'support-code-review' },
          },
        },
      },
    },
  }
  const v = project(placed, 'p1')
  expect(v.opponents[0].release.frontend).toEqual({
    uid: 'release-frontend#0',
    card: 'release-frontend',
    codeReview: 'support-code-review',
  })
})

it('marks a player on their own turn as able to play something', () => {
  const s = createGame(config())
  expect(project(s, 'p1').self.playable.length).toBeGreaterThan(0)
})

it('offers nothing playable to a player whose turn it is not', () => {
  const s = createGame(config())
  expect(project(s, 'p2').self.playable).toEqual([])
})

it('reports elimination on the opponent view', () => {
  const s = createGame(config())
  const out = { ...s, eliminated: ['p2'] }
  expect(project(out, 'p1').opponents[0].eliminated).toBe(true)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @release/engine test src/fake/project.test.ts`
Expected: FAIL — `Failed to resolve import "./project"`.

- [ ] **Step 3: Write the implementation**

Create `packages/engine/src/fake/project.ts`:

```ts
import { rulesFor } from '../cards'
import type { CardUid, GameState, PlayerId, Released } from '../state'
import type { PlayerView, ReleasedView, ReleaseView } from '../view'

const releasedView = (r: Released | undefined): ReleasedView | undefined =>
  r && { uid: r.card.uid, card: r.card.id, codeReview: r.codeReview?.id }

function releaseView(state: GameState, id: PlayerId): ReleaseView {
  const z = state.players[id].release
  const view: ReleaseView = {
    frontend: releasedView(z.frontend),
    backend: releasedView(z.backend),
    database: releasedView(z.database),
  }
  if (z.monitoring) view.monitoring = { uid: z.monitoring.uid, card: z.monitoring.id }
  return view
}

// Which of a player's cards may be played right now. Exported so validation and
// projection share one answer — two copies of legality drift silently.
export function playableFor(state: GameState, viewerId: PlayerId): CardUid[] {
  if (state.over) return []
  // A pending decision suspends normal play; its own options are carried on the
  // pending view instead.
  if (state.pending) return []
  if (state.window) return []
  if (state.turn.player !== viewerId) return []
  if (state.eliminated.includes(viewerId)) return []

  const me = state.players[viewerId]
  const releaseCap = state.setup.releases === 'fast' ? Number.POSITIVE_INFINITY : 1

  return me.hand
    .filter((c) => {
      if (me.frozen.includes(c.uid)) return false
      const rules = rulesFor(c.id)
      if (!rules) return false
      switch (rules.kind) {
        case 'release': {
          if (state.turn.releasesPlayed >= releaseCap) return false
          // One card of each type only; the slot must be free.
          return !me.release[rules.slot as 'frontend']
        }
        case 'protection':
          // Monitoring goes to the zone (one at a time); Debugger only answers a
          // trigger, so it is never played proactively.
          return c.id === 'protection-monitoring' ? !me.release.monitoring : false
        case 'attack':
          return true
        // Defences answer an attack, supports ride along with another card, and
        // triggers fire on the draw — none is a standalone play.
        case 'cancel':
        case 'unicorn':
        case 'support':
        case 'trigger':
        case 'ai':
          return false
      }
    })
    .map((c) => c.uid)
}

export function project(state: GameState, viewerId: PlayerId): PlayerView {
  const me = state.players[viewerId]
  const top = state.decks.discard[state.decks.discard.length - 1]

  return {
    self: {
      id: me.id,
      name: me.name,
      hand: me.hand.map((c) => ({ ...c })),
      release: releaseView(state, viewerId),
      playable: playableFor(state, viewerId),
      frozen: [...me.frozen],
    },
    opponents: state.seating
      .filter((id) => id !== viewerId)
      .map((id) => ({
        id,
        name: state.players[id].name,
        handCount: state.players[id].hand.length,
        release: releaseView(state, id),
        eliminated: state.eliminated.includes(id),
      })),
    decks: {
      piles: state.decks.main.map((p) => p.length),
      events: state.decks.events.length,
      discardTop: top?.id,
      discardCount: state.decks.discard.length,
    },
    turn: {
      player: state.turn.player,
      index: state.turn.index,
      hasDrawn: state.turn.hasDrawn,
    },
    // Task 8 fills these in as the window and pending machinery lands; until then
    // a projected view carries no window and no prompt.
    window: null,
    pending: null,
    // Copied, not shared: handing out the live objects would let a caller mutate
    // GameState through the view — the barrier this function exists to enforce.
    setup: { ...state.setup },
    over: state.over && { ...state.over },
  }
}
```

> `window` and `pending` are hardcoded `null` here and are replaced in Task 8. That is a deliberate staging step, not a placeholder: Task 8's tests fail until they are wired, and Task 8 lists the change.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @release/engine test`
Expected: PASS — 9 projection tests plus the earlier suites.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/fake
git commit -m "feat(engine): project derives a per-seat view and card legality"
```

---

## Task 5: `reduce` — the turn cycle, and the assembled engine

Creates `reduce`, the event log helper, `legalTargets`, and `createFakeEngine`, so the `Engine` interface is satisfiable from here on. Behaviour in this task is the mandatory draw, `PUSH`, the hand limit, and rejection of everything else.

**Files:**
- Create: `packages/engine/src/fake/reduce.ts`
- Create: `packages/engine/src/fake/index.ts`
- Test: `packages/engine/src/fake/reduce.test.ts`

**Note on a duplication this creates:** `apps/frontend/src/network/session/turn.ts` already exports a `nextTurn`. The engine owns turn order from now on and cannot import from the frontend, so it implements its own. Do **not** delete or edit the frontend's copy in this plan — the network layer still uses it, and retiring it belongs to the P2P sync spec.

**Interfaces:**
- Consumes: `playableFor`, `project` from `./project`; `createGame` from `./setup`; `rulesFor` from `../cards`; the contract types.
- Produces:
  ```ts
  export function reduce(state: GameState, action: Action): Reduction
  export function legalTargets(state: GameState, actor: PlayerId, card: CardUid): Target[]
  export function handLimitFor(setup: Setup): number      // Infinity when uncapped
  export function nextSeat(state: GameState, from: PlayerId): PlayerId
  // fake/index.ts
  export function createFakeEngine(): Engine
  export const FAKE_DECK: DeckEntry[]
  export const FAKE_EVENTS: DeckEntry[]
  ```
  `FAKE_DECK` / `FAKE_EVENTS` carry the catalogue quantities for the supported ids, so tests and the playground share one composition.

- [ ] **Step 1: Write the failing test**

Create `packages/engine/src/fake/reduce.test.ts`:

```ts
import type { Action } from '../actions'
import type { GameConfig } from '../engine'
import type { GameState, Setup } from '../state'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from './index'
import { handLimitFor, nextSeat, reduce } from './reduce'

const engine = createFakeEngine()

const BASE: Setup = {
  handLimit: 'base',
  releases: 'base',
  releaseCond: 'base',
  ai: 'base',
  gitBranch: 'base',
}

const config = (setup: Setup = BASE): GameConfig => ({
  gameId: 'g1',
  seed: 4242,
  players: [
    { id: 'p1', name: 'you' },
    { id: 'p2', name: 'kernel_panic' },
    { id: 'p3', name: 'segfault' },
  ],
  setup,
  deck: FAKE_DECK,
  events: FAKE_EVENTS,
})

// Opening hands carry no trigger cards, so a draw in these tests must not fire a
// trigger. Strip triggers from the pile to keep the turn-cycle tests isolated
// from Task 10's reveal machinery.
const withoutTriggers = (s: GameState): GameState => ({
  ...s,
  decks: {
    ...s.decks,
    main: s.decks.main.map((pile) =>
      pile.filter((c) => c.id !== 'trigger-ai' && c.id !== 'trigger-error-503'),
    ),
  },
})

it('maps the hand-limit mode axis', () => {
  expect(handLimitFor(BASE)).toBe(Number.POSITIVE_INFINITY)
  expect(handLimitFor({ ...BASE, handLimit: '8bit' })).toBe(8)
  expect(handLimitFor({ ...BASE, handLimit: 'memory' })).toBe(5)
})

it('rotates to the next living seat, wrapping the table', () => {
  const s = engine.createGame(config())
  expect(nextSeat(s, 'p1')).toBe('p2')
  expect(nextSeat(s, 'p3')).toBe('p1')
  expect(nextSeat({ ...s, eliminated: ['p2'] }, 'p1')).toBe('p3')
})

it('draws one card and marks the turn as drawn', () => {
  const s = withoutTriggers(engine.createGame(config()))
  const before = s.decks.main[0].length
  const r = reduce(s, { type: 'DRAW', player: 'p1', at: 1000 })
  expect(r.state.players.p1.hand).toHaveLength(6)
  expect(r.state.decks.main[0]).toHaveLength(before - 1)
  expect(r.state.turn.hasDrawn).toBe(true)
  expect(r.events.map((e) => e.type)).toEqual(['drawn'])
})

it('keeps a drawn card private to the drawer', () => {
  const s = withoutTriggers(engine.createGame(config()))
  const r = reduce(s, { type: 'DRAW', player: 'p1', at: 1000 })
  const drawn = r.events[0]
  expect(drawn.visibleTo).toEqual(['p1'])
  expect(drawn.type === 'drawn' && drawn.card).toBeDefined()
})

it('rejects a second draw in the same turn', () => {
  const s = withoutTriggers(engine.createGame(config()))
  const once = reduce(s, { type: 'DRAW', player: 'p1', at: 1000 })
  const twice = reduce(once.state, { type: 'DRAW', player: 'p1', at: 1001 })
  expect(twice.state).toBe(once.state)
  expect(twice.events).toHaveLength(1)
  expect(twice.events[0].type).toBe('rejected')
})

it('rejects a draw from a player whose turn it is not', () => {
  const s = withoutTriggers(engine.createGame(config()))
  const r = reduce(s, { type: 'DRAW', player: 'p2', at: 1000 })
  expect(r.state).toBe(s)
  expect(r.events[0].type).toBe('rejected')
})

it('rejects PUSH before the mandatory draw', () => {
  const s = engine.createGame(config())
  const r = reduce(s, { type: 'PUSH', player: 'p1', at: 1000 })
  expect(r.state).toBe(s)
  expect(r.events[0].type).toBe('rejected')
})

it('ends the turn on PUSH after drawing and advances the seat', () => {
  const s = withoutTriggers(engine.createGame(config()))
  const drawn = reduce(s, { type: 'DRAW', player: 'p1', at: 1000 })
  const r = reduce(drawn.state, { type: 'PUSH', player: 'p1', at: 1001 })
  expect(r.state.turn).toEqual({ player: 'p2', index: 1, hasDrawn: false, releasesPlayed: 0 })
  expect(r.events.map((e) => e.type)).toEqual(['turnEnded', 'turnStarted'])
})

it('holds the turn open on a hand-limit overflow instead of advancing', () => {
  const s = withoutTriggers(engine.createGame(config({ ...BASE, handLimit: 'memory' })))
  const drawn = reduce(s, { type: 'DRAW', player: 'p1', at: 1000 })
  // Six cards against a limit of five.
  const r = reduce(drawn.state, { type: 'PUSH', player: 'p1', at: 1001 })
  expect(r.state.turn.player).toBe('p1')
  expect(r.state.pending).toEqual({ kind: 'handLimit', player: 'p1', excess: 1 })
})

it('advances the turn once the overflow is discarded', () => {
  const s = withoutTriggers(engine.createGame(config({ ...BASE, handLimit: 'memory' })))
  const drawn = reduce(s, { type: 'DRAW', player: 'p1', at: 1000 })
  const held = reduce(drawn.state, { type: 'PUSH', player: 'p1', at: 1001 })
  const victim = held.state.players.p1.hand[0].uid
  const r = reduce(held.state, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'handLimit', cards: [victim] },
    at: 1002,
  })
  expect(r.state.pending).toBeNull()
  expect(r.state.players.p1.hand).toHaveLength(5)
  expect(r.state.decks.discard.at(-1)?.uid).toBe(victim)
  expect(r.state.turn.player).toBe('p2')
})

it('rejects a hand-limit discard of the wrong size', () => {
  const s = withoutTriggers(engine.createGame(config({ ...BASE, handLimit: 'memory' })))
  const drawn = reduce(s, { type: 'DRAW', player: 'p1', at: 1000 })
  const held = reduce(drawn.state, { type: 'PUSH', player: 'p1', at: 1001 })
  const r = reduce(held.state, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'handLimit', cards: [] },
    at: 1002,
  })
  expect(r.state).toBe(held.state)
  expect(r.events[0].type).toBe('rejected')
})

it('numbers events monotonically across reductions', () => {
  const s = withoutTriggers(engine.createGame(config()))
  const a = reduce(s, { type: 'DRAW', player: 'p1', at: 1000 })
  const b = reduce(a.state, { type: 'PUSH', player: 'p1', at: 1001 })
  expect(a.events.map((e) => e.id)).toEqual([1])
  expect(b.events.map((e) => e.id)).toEqual([2, 3])
  expect(b.state.eventSeq).toBe(3)
})

it('rejects an unknown action without throwing', () => {
  const s = engine.createGame(config())
  const bogus = { type: 'NOPE', player: 'p1', at: 1 } as unknown as Action
  expect(() => reduce(s, bogus)).not.toThrow()
  expect(reduce(s, bogus).state).toBe(s)
})

it('offers every living opponent as a hand-attack target', () => {
  const s = withoutTriggers(engine.createGame(config()))
  const bug = { uid: 'attack-bug#0', id: 'attack-bug' }
  const armed = {
    ...s,
    players: { ...s.players, p1: { ...s.players.p1, hand: [bug] } },
  }
  expect(engine.legalTargets(armed, 'p1', bug.uid)).toEqual([
    { kind: 'player', player: 'p2' },
    { kind: 'player', player: 'p3' },
  ])
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @release/engine test src/fake/reduce.test.ts`
Expected: FAIL — `Failed to resolve import "./index"`.

- [ ] **Step 3: Write the shared core**

Every later module appends to the *same* event log and rejects the same way. Those
helpers live in their own module from the start: `project`, `window`, `release` and
`attacks` all need them, and importing them from `reduce.ts` — which imports
`project` — would form an import cycle.

Create `packages/engine/src/fake/core.ts`:

```ts
import type { Action } from '../actions'
import type { Reduction } from '../engine'
import type { Event } from '../events'
import type { GameState, PlayerId, PlayerState } from '../state'

// Omit over a union collapses to the shared keys, so distribute it first —
// otherwise an event input loses every variant-specific field.
type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never
export type EventInput = DistributiveOmit<Event, 'id' | 'parent'>

// Allocates event ids from the state's counter and records the causal parent, so
// the frontend can build MoveHistory's tree without inferring grouping.
export function createLog(start: number) {
  let seq = start
  const events: Event[] = []
  return {
    events,
    add(input: EventInput, parent?: number): number {
      seq += 1
      events.push({ ...input, id: seq, ...(parent === undefined ? {} : { parent }) } as Event)
      return seq
    },
    get seq() {
      return seq
    },
  }
}

export type Log = ReturnType<typeof createLog>

export function reject(state: GameState, action: Action, reason: string): Reduction {
  const log = createLog(state.eventSeq)
  log.add({ type: 'rejected', action, reason })
  // The state reference is deliberately unchanged — callers assert on identity.
  return { state, events: log.events }
}

export const setHand = (
  state: GameState,
  id: PlayerId,
  hand: PlayerState['hand'],
): GameState => ({
  ...state,
  players: { ...state.players, [id]: { ...state.players[id], hand } },
})

// The TS Action type does not survive JSON deserialization, so an action from a
// remote peer may be any shape at all. Validating once at reduce's entry means
// every handler can destructure freely, and no later handler can reopen the hole
// that "reduce never throws" exists to close. Per-variant payloads are NOT
// checked here — a handler still guards its own choice fields.
export function isWellFormedAction(action: unknown): action is Action {
  if (typeof action !== 'object' || action === null) return false
  const a = action as { type?: unknown; choice?: unknown }
  if (typeof a.type !== 'string') return false
  if (a.type !== 'RESOLVE') return true
  return (
    typeof a.choice === 'object' &&
    a.choice !== null &&
    typeof (a.choice as { kind?: unknown }).kind === 'string'
  )
}
```

- [ ] **Step 4: Write the reducer**

Create `packages/engine/src/fake/reduce.ts`:

```ts
import type { Action, Target } from '../actions'
import { rulesFor } from '../cards'
import type { Reduction } from '../engine'
import type { CardUid, GameState, PlayerId, Setup } from '../state'
import { createLog, reject, setHand } from './core'
import { playableFor } from './project'

const HAND_LIMITS: Record<string, number> = { '8bit': 8, memory: 5 }

export function handLimitFor(setup: Setup): number {
  return HAND_LIMITS[setup.handLimit] ?? Number.POSITIVE_INFINITY
}

export function nextSeat(state: GameState, from: PlayerId): PlayerId {
  const n = state.seating.length
  const start = state.seating.indexOf(from)
  for (let step = 1; step <= n; step += 1) {
    const candidate = state.seating[(start + step) % n]
    if (!state.eliminated.includes(candidate)) return candidate
  }
  // The caller checks the last-standing condition before rotating, so this is
  // unreachable in practice; returning `from` keeps reduce total.
  return from
}

export function legalTargets(state: GameState, actor: PlayerId, card: CardUid): Target[] {
  if (!playableFor(state, actor).includes(card)) return []
  const held = state.players[actor].hand.find((c) => c.uid === card)
  if (!held) return []
  const rules = rulesFor(held.id)
  if (rules?.kind !== 'attack') return []

  const others = state.seating.filter((id) => id !== actor && !state.eliminated.includes(id))

  // DDoS does not touch a bare release or a hand: it destroys a Monitoring or
  // returns a release (protected or not) to its owner's hand.
  if (held.id === 'attack-ddos') {
    const targets: Target[] = []
    for (const id of others) {
      if (state.players[id].release.monitoring) targets.push({ kind: 'monitoring', player: id })
      for (const slot of ['frontend', 'backend', 'database'] as const) {
        if (state.players[id].release[slot]) targets.push({ kind: 'release', player: id, slot })
      }
    }
    return targets
  }

  // The other attacks, played on your own turn, take from a hand.
  return others.map((id) => ({ kind: 'player', player: id }) as Target)
}

// Ends the turn, or holds it open when the hand is over the mode's limit.
function endTurn(state: GameState, log: ReturnType<typeof createLog>): GameState {
  const me = state.turn.player
  const limit = handLimitFor(state.setup)
  const excess = state.players[me].hand.length - limit
  if (excess > 0) {
    return { ...state, pending: { kind: 'handLimit', player: me, excess }, eventSeq: log.seq }
  }
  log.add({ type: 'turnEnded', player: me })
  const next = nextSeat(state, me)
  log.add({ type: 'turnStarted', player: next, index: state.turn.index + 1 })
  return {
    ...state,
    turn: { player: next, index: state.turn.index + 1, hasDrawn: false, releasesPlayed: 0 },
    pending: null,
    eventSeq: log.seq,
  }
}

function onDraw(state: GameState, action: Action & { type: 'DRAW' }): Reduction {
  if (state.over) return reject(state, action, 'game is over')
  if (state.pending) return reject(state, action, 'a decision is pending')
  if (state.window) return reject(state, action, 'a reaction window is open')
  if (state.turn.player !== action.player) return reject(state, action, 'not your turn')
  if (state.turn.hasDrawn) return reject(state, action, 'already drew this turn')

  const pileIndex = action.pile ?? 0
  const pile = state.decks.main[pileIndex]
  if (!pile || pile.length === 0) return reject(state, action, 'that pile is empty')

  const card = pile[0]
  const main = state.decks.main.map((p, i) => (i === pileIndex ? p.slice(1) : p))
  const log = createLog(state.eventSeq)
  // Identity is private to the drawer. Task 10 replaces this for trigger cards,
  // which must be revealed to everyone the moment they are drawn.
  log.add({
    type: 'drawn',
    player: action.player,
    card: card.id,
    pile: pileIndex,
    deckSize: main[pileIndex].length,
    visibleTo: [action.player],
  })

  const withCard = setHand(state, action.player, [...state.players[action.player].hand, card])
  return {
    state: {
      ...withCard,
      decks: { ...withCard.decks, main },
      turn: { ...state.turn, hasDrawn: true },
      eventSeq: log.seq,
    },
    events: log.events,
  }
}

function onPush(state: GameState, action: Action & { type: 'PUSH' }): Reduction {
  if (state.over) return reject(state, action, 'game is over')
  if (state.pending) return reject(state, action, 'a decision is pending')
  if (state.window) return reject(state, action, 'a reaction window is open')
  if (state.turn.player !== action.player) return reject(state, action, 'not your turn')
  // The draw is mandatory, so a turn cannot be passed without it.
  if (!state.turn.hasDrawn) return reject(state, action, 'you must draw before pushing')

  const log = createLog(state.eventSeq)
  return { state: endTurn(state, log), events: log.events }
}

function onHandLimit(state: GameState, action: Action & { type: 'RESOLVE' }): Reduction {
  const pending = state.pending
  if (pending?.kind !== 'handLimit') return reject(state, action, 'no hand-limit decision pending')
  if (pending.player !== action.player) return reject(state, action, 'not your decision')
  const choice = action.choice
  if (choice.kind !== 'handLimit') return reject(state, action, 'wrong choice for this decision')
  // isWellFormedAction validates the action's shape but deliberately does not
  // descend into per-variant payloads, so each handler guards its own.
  if (!Array.isArray(choice.cards)) return reject(state, action, 'cards must be an array')
  if (choice.cards.length !== pending.excess) {
    return reject(state, action, `discard exactly ${pending.excess}`)
  }

  const hand = state.players[action.player].hand
  const doomed = new Set(choice.cards)
  if (choice.cards.some((uid) => !hand.some((c) => c.uid === uid))) {
    return reject(state, action, 'you do not hold that card')
  }

  const log = createLog(state.eventSeq)
  const discarded = hand.filter((c) => doomed.has(c.uid))
  for (const c of discarded) {
    log.add({ type: 'discarded', player: action.player, card: c.id, reason: 'handLimit' })
  }

  const kept = setHand(
    state,
    action.player,
    hand.filter((c) => !doomed.has(c.uid)),
  )
  const withDiscard: GameState = {
    ...kept,
    decks: { ...kept.decks, discard: [...kept.decks.discard, ...discarded] },
    pending: null,
  }
  return { state: endTurn(withDiscard, log), events: log.events }
}

function onResolve(state: GameState, action: Action & { type: 'RESOLVE' }): Reduction {
  switch (action.choice.kind) {
    case 'handLimit':
      return onHandLimit(state, action)
    // Later tasks add the remaining decisions. Until then an unimplemented choice
    // is rejected rather than silently ignored.
    default:
      return reject(state, action, `unsupported choice: ${action.choice.kind}`)
  }
}

export function reduce(state: GameState, action: Action): Reduction {
  // Shape-check once, before dispatch: a malformed action from a remote peer must
  // reject, never throw.
  if (!isWellFormedAction(action)) return reject(state, action, 'malformed action')
  switch (action.type) {
    case 'DRAW':
      return onDraw(state, action)
    case 'PUSH':
      return onPush(state, action)
    case 'RESOLVE':
      return onResolve(state, action)
    // PLAY, ATTACK, PASS, UNPASS and WINDOW_EXPIRED arrive in Tasks 7 and 8.
    default:
      return reject(state, action, `unsupported action: ${String(action?.type)}`)
  }
}
```

- [ ] **Step 5: Assemble the engine**

Create `packages/engine/src/fake/index.ts`:

```ts
import type { DeckEntry, Engine } from '../engine'
import { project } from './project'
import { legalTargets, reduce } from './reduce'
import { createGame } from './setup'

// Quantities mirror apps/ui/src/cards/catalogue.ts. Only the ids the fake
// implements appear — Git operations, System Upgrade and ai-inside are deferred
// per the design, and createGame filters anything unsupported anyway.
export const FAKE_DECK: DeckEntry[] = [
  { id: 'release-frontend', qty: 4 },
  { id: 'release-backend', qty: 4 },
  { id: 'release-database', qty: 5 },
  { id: 'attack-security-bug', qty: 5 },
  { id: 'attack-ddos', qty: 6 },
  { id: 'attack-bug', qty: 7 },
  { id: 'attack-legacy-code', qty: 3 },
  { id: 'attack-out-of-memory', qty: 2 },
  { id: 'defense-not-a-bug', qty: 2 },
  { id: 'defense-works-on-my-machine', qty: 2 },
  { id: 'defense-rollback', qty: 3 },
  { id: 'defense-hotfix', qty: 3 },
  { id: 'defense-pr-approved', qty: 2 },
  { id: 'defense-rubber-ducky', qty: 2 },
  { id: 'protection-monitoring', qty: 4 },
  { id: 'protection-debugger', qty: 8 },
  { id: 'support-sudo', qty: 5 },
  { id: 'support-code-review', qty: 5 },
  { id: 'trigger-error-503', qty: 7 },
  { id: 'trigger-ai', qty: 12 },
]

export const FAKE_EVENTS: DeckEntry[] = [
  { id: 'ai-crush-database', qty: 2 },
  { id: 'ai-crush-frontend', qty: 2 },
  { id: 'ai-crush-backend', qty: 2 },
  { id: 'ai-monitoring', qty: 2 },
  { id: 'ai-release-database', qty: 1 },
  { id: 'ai-release-frontend', qty: 1 },
  { id: 'ai-release-backend', qty: 1 },
  { id: 'ai-good-vibe-coding', qty: 3 },
  { id: 'ai-bad-vibe-coding', qty: 2 },
  { id: 'ai-hallucination', qty: 2 },
  { id: 'ai-error-503', qty: 1 },
]

export function createFakeEngine(): Engine {
  return { createGame, reduce, project, legalTargets }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @release/engine test`
Expected: PASS — 14 reduce tests plus the earlier suites.

Then: `pnpm -r typecheck`

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/fake
git commit -m "feat(engine): shared core, turn cycle, hand limit, assembled fake engine"
```

---

## Task 6: Conformance suite — determinism, totality, privacy

Lands now rather than last, so every later task inherits its guarantees. The suite is parameterised over the **contract**, so the rules author runs the same file.

**Files:**
- Create: `packages/engine/src/conformance.ts`
- Modify: `packages/engine/src/index.ts` — add the `describeEngine` re-export deferred in Task 2
- Test: `packages/engine/src/fake/fake.test.ts`

**Interfaces:**
- Consumes: `Engine`, `GameConfig`, `DeckEntry` from `./engine`; `Action`, `Choice` from `./actions`; `randomAt` from `./rng`.
- Produces:
  ```ts
  export interface ConformanceOptions {
    deck: DeckEntry[]
    events: DeckEntry[]
  }
  export function describeEngine(
    name: string, make: () => Engine, options: ConformanceOptions,
  ): void
  ```

- [ ] **Step 1: Write the failing test**

Create `packages/engine/src/fake/fake.test.ts`:

```ts
import { describeEngine } from '../conformance'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from './index'

// Every implementation runs the same suite. The fake's deck simply omits the
// cards whose UI surfaces the design defers, so nothing here needs gating.
describeEngine('fake', createFakeEngine, { deck: FAKE_DECK, events: FAKE_EVENTS })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @release/engine test src/fake/fake.test.ts`
Expected: FAIL — `Failed to resolve import "../conformance"`.

> **Superseded in part by what shipped.** Review found four properties in the listing below that could not fail, and they were strengthened during implementation: mutation-safety now snapshots **every** transition rather than only the first; seed-divergence asserts on seed-*derived* data (draw-pile order and dealt hands) instead of whole-state inequality, which passed on the copied `seed` scalar alone; a second `MEMORY_SETUP` config (`handLimit: 'memory'`) runs the totality and structural properties so `onHandLimit` is reachable at all — under `BASE_SETUP` the limit is `Infinity` and it was dead code; and the privacy scan enumerates `decks.events` as well as `decks.main`. Each strengthening was verified by a targeted break. **`packages/engine/src/conformance.ts` as shipped is the source of truth**; the listing below records the original intent. Task 13 extends the shipped file.

- [ ] **Step 3: Write the implementation**

Create `packages/engine/src/conformance.ts`:

```ts
import type { Action } from './actions'
import type { DeckEntry, Engine, GameConfig } from './engine'
import { randomAt } from './rng'
import type { GameState, PlayerId, Setup } from './state'

export interface ConformanceOptions {
  deck: DeckEntry[]
  events: DeckEntry[]
}

const BASE_SETUP: Setup = {
  handLimit: 'base',
  releases: 'base',
  releaseCond: 'base',
  ai: 'base',
  gitBranch: 'base',
}

const configFor = (options: ConformanceOptions, seed: number, setup = BASE_SETUP): GameConfig => ({
  gameId: 'conformance',
  seed,
  players: [
    { id: 'p1', name: 'one' },
    { id: 'p2', name: 'two' },
    { id: 'p3', name: 'three' },
  ],
  setup,
  deck: options.deck,
  events: options.events,
})

// A deterministic pseudo-random action stream. Deliberately includes illegal
// actions — most of these will be rejected, which is exactly what totality means.
function fuzzAction(state: GameState, seed: number, n: number): Action {
  const pick = <T>(items: readonly T[], salt: number): T =>
    items[Math.floor(randomAt(seed, n * 8 + salt) * items.length)]
  const player: PlayerId = pick(state.seating, 1)
  const hand = state.players[player].hand
  const uid = hand.length > 0 ? pick(hand, 2).uid : 'no-such-card'
  const at = 1000 + n

  const kind = Math.floor(randomAt(seed, n * 8 + 3) * 7)
  switch (kind) {
    case 0:
      return { type: 'DRAW', player, at }
    case 1:
      return { type: 'PUSH', player, at }
    case 2:
      return { type: 'PLAY', player, card: uid, at }
    case 3:
      return { type: 'ATTACK', player, card: uid, at }
    case 4:
      return { type: 'PASS', player, at }
    case 5:
      return { type: 'WINDOW_EXPIRED', at }
    default:
      return { type: 'RESOLVE', player, choice: { kind: 'defend', card: null }, at }
  }
}

function drive(engine: Engine, state: GameState, seed: number, steps: number) {
  let current = state
  const events = []
  for (let n = 0; n < steps; n += 1) {
    const r = engine.reduce(current, fuzzAction(current, seed, n))
    current = r.state
    events.push(...r.events)
  }
  return { state: current, events }
}

export function describeEngine(
  name: string,
  make: () => Engine,
  options: ConformanceOptions,
): void {
  describe(`engine conformance: ${name}`, () => {
    describe('determinism', () => {
      it('builds an identical game from an identical config', () => {
        const a = make().createGame(configFor(options, 777))
        const b = make().createGame(configFor(options, 777))
        expect(a).toEqual(b)
      })

      it('diverges on a different seed', () => {
        const a = make().createGame(configFor(options, 777))
        const b = make().createGame(configFor(options, 778))
        expect(a).not.toEqual(b)
      })

      it('yields identical state and events for an identical action stream', () => {
        const engine = make()
        const start = engine.createGame(configFor(options, 4242))
        const a = drive(engine, start, 31, 120)
        const b = drive(make(), engine.createGame(configFor(options, 4242)), 31, 120)
        expect(a.state).toEqual(b.state)
        expect(a.events).toEqual(b.events)
      })

      it('does not mutate the state handed to reduce', () => {
        const engine = make()
        const start = engine.createGame(configFor(options, 4242))
        const snapshot = structuredClone(start)
        drive(engine, start, 5, 60)
        expect(start).toEqual(snapshot)
      })
    })

    describe('totality', () => {
      it('never throws across a long fuzz stream', () => {
        const engine = make()
        const start = engine.createGame(configFor(options, 99))
        expect(() => drive(engine, start, 17, 400)).not.toThrow()
      })

      it('rejects an unrecognised action and leaves the state identical', () => {
        const engine = make()
        const start = engine.createGame(configFor(options, 99))
        const bogus = { type: 'NOT_AN_ACTION', player: 'p1', at: 1 } as unknown as Action
        const r = engine.reduce(start, bogus)
        expect(r.state).toBe(start)
        expect(r.events.map((e) => e.type)).toEqual(['rejected'])
      })

      it('keeps state structurally valid throughout the stream', () => {
        const engine = make()
        const start = engine.createGame(configFor(options, 55))
        const { state } = drive(engine, start, 23, 300)
        expect(state.seating).toHaveLength(3)
        for (const id of state.seating) expect(state.players[id]).toBeDefined()
        expect(state.decks.main.length).toBeGreaterThan(0)
        expect(state.eventSeq).toBeGreaterThanOrEqual(start.eventSeq)
      })

      it('numbers every event uniquely and monotonically', () => {
        const engine = make()
        const start = engine.createGame(configFor(options, 55))
        const { events } = drive(engine, start, 23, 200)
        const ids = events.map((e) => e.id)
        expect(new Set(ids).size).toBe(ids.length)
        expect([...ids].sort((x, y) => x - y)).toEqual(ids)
      })
    })

    describe('projection privacy', () => {
      // The property that would otherwise leak silently: nothing a viewer must not
      // know may appear anywhere in their view, at any point in a game.
      it('never exposes another hand or the ordered deck', () => {
        const engine = make()
        let state = engine.createGame(configFor(options, 2024))
        for (let n = 0; n < 150; n += 1) {
          for (const viewer of state.seating) {
            const serialized = JSON.stringify(engine.project(state, viewer))
            for (const other of state.seating) {
              if (other === viewer) continue
              for (const c of state.players[other].hand) {
                expect(serialized, `${viewer} can see ${other}'s ${c.uid}`).not.toContain(c.uid)
              }
            }
            for (const pile of state.decks.main) {
              for (const c of pile) {
                expect(serialized, `${viewer} can see deck card ${c.uid}`).not.toContain(c.uid)
              }
            }
          }
          state = engine.reduce(state, fuzzAction(state, 2024, n)).state
        }
      })

      it('reports opponents by hand count', () => {
        const engine = make()
        const state = engine.createGame(configFor(options, 2024))
        const view = engine.project(state, 'p1')
        expect(view.opponents.map((o) => o.id)).toEqual(['p2', 'p3'])
        for (const o of view.opponents) {
          expect(o.handCount).toBe(state.players[o.id].hand.length)
        }
      })

      it('offers no playable card to a player who is not on turn', () => {
        const engine = make()
        const state = engine.createGame(configFor(options, 2024))
        const idle = state.seating.filter((id) => id !== state.turn.player)
        for (const id of idle) expect(engine.project(state, id).self.playable).toEqual([])
      })

      it('never marks an unheld card as playable', () => {
        const engine = make()
        let state = engine.createGame(configFor(options, 8080))
        for (let n = 0; n < 120; n += 1) {
          for (const viewer of state.seating) {
            const view = engine.project(state, viewer)
            const held = new Set(state.players[viewer].hand.map((c) => c.uid))
            for (const uid of view.self.playable) expect(held.has(uid)).toBe(true)
          }
          state = engine.reduce(state, fuzzAction(state, 8080, n)).state
        }
      })
    })

    describe('legalTargets', () => {
      it('returns nothing for a card the actor cannot play', () => {
        const engine = make()
        const state = engine.createGame(configFor(options, 31337))
        expect(engine.legalTargets(state, 'p1', 'no-such-card')).toEqual([])
        const idle = state.seating.find((id) => id !== state.turn.player) as PlayerId
        const someCard = state.players[idle].hand[0].uid
        expect(engine.legalTargets(state, idle, someCard)).toEqual([])
      })

      it('never names the actor as their own target', () => {
        const engine = make()
        let state = engine.createGame(configFor(options, 31337))
        for (let n = 0; n < 80; n += 1) {
          const actor = state.turn.player
          for (const c of state.players[actor].hand) {
            for (const t of engine.legalTargets(state, actor, c.uid)) {
              if ('player' in t) expect(t.player).not.toBe(actor)
            }
          }
          state = engine.reduce(state, fuzzAction(state, 31337, n)).state
        }
      })
    })

    // Task 13 adds the rules-invariant suite here.
  })
}
```

- [ ] **Step 4: Add the deferred re-export**

In `packages/engine/src/index.ts`, add the line held back in Task 2:

```ts
export { describeEngine, type ConformanceOptions } from './conformance'
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @release/engine test`
Expected: PASS.

A privacy failure here is a real defect, not a flaky test — read which uid leaked into which viewer's view and fix `project`.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src
git commit -m "test(engine): conformance suite for determinism, totality, and privacy"
```

---

## Task 7: Release play — the discard cost, zone rules, and winning

**Files:**
- Create: `packages/engine/src/fake/release.ts`
- Modify: `packages/engine/src/fake/reduce.ts` — export shared helpers, route `PLAY` and `discardForRelease`
- Test: `packages/engine/src/fake/release.test.ts`

**Interfaces:**
- Consumes: `createLog`, `reject`, `setHand`, `Log` from `./core`; `rulesFor` from `../cards`; `playableFor` from `./project`.
- Produces:
  ```ts
  export function onPlay(state: GameState, action: Action & { type: 'PLAY' }): Reduction
  export function onDiscardForRelease(state: GameState, action: Action & { type: 'RESOLVE' }): Reduction
  export function placeRelease(
    state: GameState, log: Log, player: PlayerId, release: CardUid, codeReview?: CardUid,
  ): GameState
  export function checkWin(state: GameState, log: Log): GameState
  ```

- [ ] **Step 1: Write the failing test**

Create `packages/engine/src/fake/release.test.ts`:

```ts
import type { GameConfig } from '../engine'
import type { CardInstance, GameState, Setup } from '../state'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from './index'
import { reduce } from './reduce'

const engine = createFakeEngine()

const BASE: Setup = {
  handLimit: 'base',
  releases: 'base',
  releaseCond: 'base',
  ai: 'base',
  gitBranch: 'base',
}

const config = (setup: Setup = BASE): GameConfig => ({
  gameId: 'g1',
  seed: 4242,
  players: [
    { id: 'p1', name: 'you' },
    { id: 'p2', name: 'kernel_panic' },
  ],
  setup,
  deck: FAKE_DECK,
  events: FAKE_EVENTS,
})

const FE: CardInstance = { uid: 'release-frontend#0', id: 'release-frontend' }
const BE: CardInstance = { uid: 'release-backend#0', id: 'release-backend' }
const DB: CardInstance = { uid: 'release-database#0', id: 'release-database' }
const CR: CardInstance = { uid: 'support-code-review#0', id: 'support-code-review' }
const MON: CardInstance = { uid: 'protection-monitoring#0', id: 'protection-monitoring' }
const BUG: CardInstance = { uid: 'attack-bug#0', id: 'attack-bug' }

// Deal p1 an exact hand so each test is about a rule, not about the shuffle.
const handed = (hand: CardInstance[], setup: Setup = BASE): GameState => {
  const s = engine.createGame(config(setup))
  return { ...s, players: { ...s.players, p1: { ...s.players.p1, hand } } }
}

it('asks for the discard cost before the release lands', () => {
  const r = reduce(handed([FE, BUG]), { type: 'PLAY', player: 'p1', card: FE.uid, at: 1000 })
  expect(r.state.pending).toEqual({ kind: 'discardForRelease', player: 'p1', release: FE.uid })
  expect(r.state.players.p1.release.frontend).toBeUndefined()
  expect(r.state.players.p1.hand).toHaveLength(2)
})

it('places the release once the cost is paid', () => {
  const asked = reduce(handed([FE, BUG]), { type: 'PLAY', player: 'p1', card: FE.uid, at: 1000 })
  const r = reduce(asked.state, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'discardForRelease', card: BUG.uid },
    at: 1001,
  })
  expect(r.state.players.p1.release.frontend?.card).toEqual(FE)
  expect(r.state.players.p1.hand).toEqual([])
  expect(r.state.decks.discard.at(-1)).toEqual(BUG)
  expect(r.state.turn.releasesPlayed).toBe(1)
  expect(r.events.map((e) => e.type)).toEqual(['discarded', 'released'])
})

it('refuses to pay the cost with the release itself', () => {
  const asked = reduce(handed([FE, BUG]), { type: 'PLAY', player: 'p1', card: FE.uid, at: 1000 })
  const r = reduce(asked.state, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'discardForRelease', card: FE.uid },
    at: 1001,
  })
  expect(r.state).toBe(asked.state)
  expect(r.events[0].type).toBe('rejected')
})

it('skips the cost under Easy Release', () => {
  const s = handed([FE, BUG], { ...BASE, releaseCond: 'easy' })
  const r = reduce(s, { type: 'PLAY', player: 'p1', card: FE.uid, at: 1000 })
  expect(r.state.pending).toBeNull()
  expect(r.state.players.p1.release.frontend?.card).toEqual(FE)
  expect(r.state.players.p1.hand).toEqual([BUG])
})

it('rejects a second release in a turn under Base, allows it under Fast Release', () => {
  const easy = { ...BASE, releaseCond: 'easy' }
  const first = reduce(handed([FE, BE], easy), {
    type: 'PLAY',
    player: 'p1',
    card: FE.uid,
    at: 1000,
  })
  const capped = reduce(first.state, { type: 'PLAY', player: 'p1', card: BE.uid, at: 1001 })
  expect(capped.state).toBe(first.state)
  expect(capped.events[0].type).toBe('rejected')

  const fastFirst = reduce(handed([FE, BE], { ...easy, releases: 'fast' }), {
    type: 'PLAY',
    player: 'p1',
    card: FE.uid,
    at: 1000,
  })
  const fast = reduce(fastFirst.state, { type: 'PLAY', player: 'p1', card: BE.uid, at: 1001 })
  expect(fast.state.players.p1.release.backend?.card).toEqual(BE)
  expect(fast.state.turn.releasesPlayed).toBe(2)
})

it('rejects a duplicate release type in the zone', () => {
  const twin: CardInstance = { uid: 'release-frontend#1', id: 'release-frontend' }
  const s = handed([FE, twin], { ...BASE, releaseCond: 'easy', releases: 'fast' })
  const first = reduce(s, { type: 'PLAY', player: 'p1', card: FE.uid, at: 1000 })
  const r = reduce(first.state, { type: 'PLAY', player: 'p1', card: twin.uid, at: 1001 })
  expect(r.state).toBe(first.state)
  expect(r.events[0].type).toBe('rejected')
})

it('binds Code Review to the release it was played with', () => {
  const s = handed([FE, CR], { ...BASE, releaseCond: 'easy' })
  const r = reduce(s, { type: 'PLAY', player: 'p1', card: FE.uid, combo: CR.uid, at: 1000 })
  expect(r.state.players.p1.release.frontend).toEqual({ card: FE, codeReview: CR })
  expect(r.state.players.p1.hand).toEqual([])
})

it('carries a combo Code Review across the discard pause', () => {
  const asked = reduce(handed([FE, CR, BUG]), {
    type: 'PLAY',
    player: 'p1',
    card: FE.uid,
    combo: CR.uid,
    at: 1000,
  })
  expect(asked.state.pending).toEqual({
    kind: 'discardForRelease',
    player: 'p1',
    release: FE.uid,
    codeReview: CR.uid,
  })
  const r = reduce(asked.state, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'discardForRelease', card: BUG.uid },
    at: 1001,
  })
  expect(r.state.players.p1.release.frontend).toEqual({ card: FE, codeReview: CR })
})

it('rejects Code Review paired with something that is not a release', () => {
  const s = handed([MON, CR], { ...BASE, releaseCond: 'easy' })
  const r = reduce(s, { type: 'PLAY', player: 'p1', card: MON.uid, combo: CR.uid, at: 1000 })
  expect(r.state).toBe(s)
  expect(r.events[0].type).toBe('rejected')
})

it('places Monitoring in the zone, one at a time', () => {
  const twin: CardInstance = { uid: 'protection-monitoring#1', id: 'protection-monitoring' }
  const first = reduce(handed([MON, twin]), { type: 'PLAY', player: 'p1', card: MON.uid, at: 1000 })
  expect(first.state.players.p1.release.monitoring).toEqual(MON)
  expect(first.events.map((e) => e.type)).toEqual(['placed'])
  const r = reduce(first.state, { type: 'PLAY', player: 'p1', card: twin.uid, at: 1001 })
  expect(r.state).toBe(first.state)
  expect(r.events[0].type).toBe('rejected')
})

it('never lets Debugger be played proactively', () => {
  const dbg: CardInstance = { uid: 'protection-debugger#0', id: 'protection-debugger' }
  const r = reduce(handed([dbg]), { type: 'PLAY', player: 'p1', card: dbg.uid, at: 1000 })
  expect(r.events[0].type).toBe('rejected')
})

it('ends the game when a third release lands', () => {
  const s = handed([DB], { ...BASE, releaseCond: 'easy' })
  const primed: GameState = {
    ...s,
    players: {
      ...s.players,
      p1: { ...s.players.p1, release: { frontend: { card: FE }, backend: { card: BE } } },
    },
  }
  const r = reduce(primed, { type: 'PLAY', player: 'p1', card: DB.uid, at: 1000 })
  expect(r.state.over).toEqual({ winner: 'p1', condition: 'release' })
  expect(r.events.map((e) => e.type)).toEqual(['released', 'gameOver'])
})

it('rejects a play once the game is over, or of a frozen card', () => {
  const s = handed([FE], { ...BASE, releaseCond: 'easy' })
  const over: GameState = { ...s, over: { winner: 'p2', condition: 'release' } }
  expect(reduce(over, { type: 'PLAY', player: 'p1', card: FE.uid, at: 1000 }).state).toBe(over)

  const frozen: GameState = {
    ...s,
    players: { ...s.players, p1: { ...s.players.p1, frozen: [FE.uid] } },
  }
  const r = reduce(frozen, { type: 'PLAY', player: 'p1', card: FE.uid, at: 1000 })
  expect(r.state).toBe(frozen)
  expect(r.events[0].type).toBe('rejected')
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @release/engine test src/fake/release.test.ts`
Expected: FAIL — every `PLAY` is rejected with "unsupported action: PLAY".

- [ ] **Step 3: Write the implementation**

Create `packages/engine/src/fake/release.ts`:

```ts
import type { Action } from '../actions'
import { rulesFor } from '../cards'
import type { Reduction } from '../engine'
import type { CardUid, GameState, PlayerId, ReleaseSlot } from '../state'
import { playableFor } from './project'
import { createLog, type Log, reject, setHand } from './core'

const SLOTS: readonly ReleaseSlot[] = ['frontend', 'backend', 'database']

// Three different release types in one zone ends the game immediately.
export function checkWin(state: GameState, log: Log): GameState {
  for (const id of state.seating) {
    if (state.eliminated.includes(id)) continue
    if (SLOTS.every((slot) => state.players[id].release[slot])) {
      log.add({ type: 'gameOver', winner: id, condition: 'release' })
      return { ...state, over: { winner: id, condition: 'release' }, eventSeq: log.seq }
    }
  }
  return { ...state, eventSeq: log.seq }
}

export function placeRelease(
  state: GameState,
  log: Log,
  player: PlayerId,
  release: CardUid,
  codeReview?: CardUid,
): GameState {
  const hand = state.players[player].hand
  const card = hand.find((c) => c.uid === release)
  if (!card) return { ...state, eventSeq: log.seq }
  const slot = rulesFor(card.id)?.slot as ReleaseSlot
  const cr = codeReview ? hand.find((c) => c.uid === codeReview) : undefined

  log.add({ type: 'released', player, slot, card: card.id, ...(cr ? { codeReview: cr.id } : {}) })

  const withHand = setHand(
    state,
    player,
    hand.filter((c) => c.uid !== release && c.uid !== codeReview),
  )
  const placed: GameState = {
    ...withHand,
    players: {
      ...withHand.players,
      [player]: {
        ...withHand.players[player],
        release: {
          ...withHand.players[player].release,
          [slot]: { card, ...(cr ? { codeReview: cr } : {}) },
        },
      },
    },
    turn: { ...state.turn, releasesPlayed: state.turn.releasesPlayed + 1 },
    pending: null,
  }
  // Task 8 opens the reaction window here when there is no Code Review.
  return checkWin(placed, log)
}

export function onPlay(state: GameState, action: Action & { type: 'PLAY' }): Reduction {
  // playableFor already covers game-over, a pending decision, an open window, turn
  // ownership, freezing, the release cap and the occupied-slot rule — one
  // membership check instead of a stack of duplicated guards that could disagree.
  if (!playableFor(state, action.player).includes(action.card)) {
    return reject(state, action, 'that card is not playable right now')
  }

  const hand = state.players[action.player].hand
  const card = hand.find((c) => c.uid === action.card)
  if (!card) return reject(state, action, 'you do not hold that card')
  const rules = rulesFor(card.id)
  if (!rules) return reject(state, action, 'unknown card')

  // Code Review is the only combo a release accepts, and only at play time.
  let codeReview: CardUid | undefined
  if (action.combo !== undefined) {
    const partner = hand.find((c) => c.uid === action.combo)
    if (!partner) return reject(state, action, 'you do not hold the combo card')
    if (partner.id !== 'support-code-review') {
      return reject(state, action, 'that card cannot be comboed here')
    }
    if (rules.kind !== 'release') {
      return reject(state, action, 'Code Review only pairs with a release')
    }
    codeReview = partner.uid
  }

  const log = createLog(state.eventSeq)

  if (rules.kind === 'release') {
    if (state.setup.releaseCond === 'easy') {
      const next = placeRelease(state, log, action.player, action.card, codeReview)
      return { state: next, events: log.events }
    }
    // The cost is a second card, so a lone release is unplayable.
    const spare = hand.filter((c) => c.uid !== action.card && c.uid !== codeReview)
    if (spare.length === 0) return reject(state, action, 'no card left to pay the release cost')
    return {
      state: {
        ...state,
        pending: {
          kind: 'discardForRelease',
          player: action.player,
          release: action.card,
          ...(codeReview ? { codeReview } : {}),
        },
      },
      events: [],
    }
  }

  if (card.id === 'protection-monitoring') {
    log.add({ type: 'placed', player: action.player, card: card.id })
    const withHand = setHand(
      state,
      action.player,
      hand.filter((c) => c.uid !== action.card),
    )
    return {
      state: {
        ...withHand,
        players: {
          ...withHand.players,
          [action.player]: {
            ...withHand.players[action.player],
            release: { ...withHand.players[action.player].release, monitoring: card },
          },
        },
        eventSeq: log.seq,
      },
      events: log.events,
    }
  }

  // Attacks route through Task 9; nothing else is a standalone play.
  return reject(state, action, `cannot play ${card.id} this way`)
}

export function onDiscardForRelease(
  state: GameState,
  action: Action & { type: 'RESOLVE' },
): Reduction {
  const pending = state.pending
  if (pending?.kind !== 'discardForRelease') return reject(state, action, 'no release cost pending')
  if (pending.player !== action.player) return reject(state, action, 'not your decision')
  const choice = action.choice
  if (choice.kind !== 'discardForRelease') {
    return reject(state, action, 'wrong choice for this decision')
  }
  // Neither the release nor a comboed Code Review can pay for the release.
  if (choice.card === pending.release || choice.card === pending.codeReview) {
    return reject(state, action, 'that card is part of the release')
  }
  const hand = state.players[action.player].hand
  const paid = hand.find((c) => c.uid === choice.card)
  if (!paid) return reject(state, action, 'you do not hold that card')

  const log = createLog(state.eventSeq)
  log.add({ type: 'discarded', player: action.player, card: paid.id, reason: 'releaseCost' })

  const withoutPaid = setHand(
    state,
    action.player,
    hand.filter((c) => c.uid !== choice.card),
  )
  const banked: GameState = {
    ...withoutPaid,
    decks: { ...withoutPaid.decks, discard: [...withoutPaid.decks.discard, paid] },
  }
  return {
    state: placeRelease(banked, log, action.player, pending.release, pending.codeReview),
    events: log.events,
  }
}
```

- [ ] **Step 4: Route the new cases in `reduce.ts`**

Add the import:

```ts
import { onDiscardForRelease, onPlay } from './release'
```

In `onResolve`'s switch, above `default`:

```ts
    case 'discardForRelease':
      return onDiscardForRelease(state, action)
```

In `reduce`'s switch, above `default`:

```ts
    case 'PLAY':
      return onPlay(state, action)
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @release/engine test`
Expected: PASS — 13 release tests plus every earlier suite, conformance included.

Then: `pnpm -r typecheck`

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/fake
git commit -m "feat(engine): release play, discard cost, Code Review, win detection"
```

---

## Task 8: The reaction window

Implements [`docs/understanding.md`](../understanding.md) §7 literally: 15s on the first round and 10s after, a revocable pass, closure on expiry or unanimous pass, and no window at all for a Code Review-protected release.

**Files:**
- Create: `packages/engine/src/fake/window.ts`
- Modify: `packages/engine/src/fake/release.ts` — `placeRelease` gains `at` and opens the window
- Modify: `packages/engine/src/fake/reduce.ts` — route `PASS`, `UNPASS`, `WINDOW_EXPIRED`
- Modify: `packages/engine/src/fake/project.ts` — replace the hardcoded `window: null`
- Test: `packages/engine/src/fake/window.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const WINDOW_FIRST_MS = 15_000
  export const WINDOW_NEXT_MS = 10_000
  export function openWindow(
    state: GameState, log: Log, target: ReactionWindow['target'], round: number, at: number,
  ): GameState
  export function closeWindow(state: GameState, log: Log): GameState
  export function onPass(state: GameState, action: Action & { type: 'PASS' }): Reduction
  export function onUnpass(state: GameState, action: Action & { type: 'UNPASS' }): Reduction
  export function onWindowExpired(state: GameState, action: Action & { type: 'WINDOW_EXPIRED' }): Reduction
  export function respondersFor(state: GameState, owner: PlayerId): PlayerId[]
  export function canAttackWith(state: GameState, viewer: PlayerId): CardUid[]
  ```

**Signature change:** `placeRelease` gains an `at: number` parameter after `log`. Both existing call sites in `release.ts` pass `action.at`. It could not be added in Task 7 — `noUnusedParameters` is on, so an unused parameter fails typecheck.

- [ ] **Step 1: Write the failing test**

Create `packages/engine/src/fake/window.test.ts`:

```ts
import type { GameConfig } from '../engine'
import type { CardInstance, GameState, Setup } from '../state'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from './index'
import { reduce } from './reduce'
import { WINDOW_FIRST_MS } from './window'

const engine = createFakeEngine()

const EASY: Setup = {
  handLimit: 'base',
  releases: 'base',
  releaseCond: 'easy',
  ai: 'base',
  gitBranch: 'base',
}

const config = (): GameConfig => ({
  gameId: 'g1',
  seed: 4242,
  players: [
    { id: 'p1', name: 'you' },
    { id: 'p2', name: 'kernel_panic' },
    { id: 'p3', name: 'segfault' },
  ],
  setup: EASY,
  deck: FAKE_DECK,
  events: FAKE_EVENTS,
})

const FE: CardInstance = { uid: 'release-frontend#0', id: 'release-frontend' }
const CR: CardInstance = { uid: 'support-code-review#0', id: 'support-code-review' }
const BUG: CardInstance = { uid: 'attack-bug#0', id: 'attack-bug' }

// p1 releases; p2 holds a Bug, p3 holds nothing useful.
const released = (extra: Partial<Record<'p2' | 'p3', CardInstance[]>> = {}): GameState => {
  const s = engine.createGame(config())
  const primed: GameState = {
    ...s,
    players: {
      ...s.players,
      p1: { ...s.players.p1, hand: [FE, CR] },
      p2: { ...s.players.p2, hand: extra.p2 ?? [BUG] },
      p3: { ...s.players.p3, hand: extra.p3 ?? [] },
    },
  }
  return reduce(primed, { type: 'PLAY', player: 'p1', card: FE.uid, at: 1000 }).state
}

it('opens a 15s window on a bare release', () => {
  const s = released()
  expect(s.window).toEqual({
    target: { player: 'p1', slot: 'frontend', card: FE.uid },
    round: 1,
    deadline: 1000 + WINDOW_FIRST_MS,
    passed: [],
  })
})

it('opens no window when the release carries Code Review', () => {
  const s = engine.createGame(config())
  const primed: GameState = { ...s, players: { ...s.players, p1: { ...s.players.p1, hand: [FE, CR] } } }
  const r = reduce(primed, { type: 'PLAY', player: 'p1', card: FE.uid, combo: CR.uid, at: 1000 })
  expect(r.state.window).toBeNull()
  expect(r.events.map((e) => e.type)).toEqual(['released'])
})

it('closes once every responder has passed', () => {
  const one = reduce(released(), { type: 'PASS', player: 'p2', at: 1001 })
  expect(one.state.window?.passed).toEqual(['p2'])
  const two = reduce(one.state, { type: 'PASS', player: 'p3', at: 1002 })
  expect(two.state.window).toBeNull()
  expect(two.events.map((e) => e.type)).toEqual(['passed', 'windowClosed'])
})

it('lets a passer change their mind while the window lives', () => {
  const passed = reduce(released(), { type: 'PASS', player: 'p2', at: 1001 })
  const back = reduce(passed.state, { type: 'UNPASS', player: 'p2', at: 1002 })
  expect(back.state.window?.passed).toEqual([])
  expect(back.events.map((e) => e.type)).toEqual(['unpassed'])
})

it('refuses a pass from the release owner', () => {
  const s = released()
  const r = reduce(s, { type: 'PASS', player: 'p1', at: 1001 })
  expect(r.state).toBe(s)
  expect(r.events[0].type).toBe('rejected')
})

it('closes on expiry only once the deadline has passed', () => {
  const s = released()
  const early = reduce(s, { type: 'WINDOW_EXPIRED', at: 1000 })
  expect(early.state).toBe(s)
  expect(early.events[0].type).toBe('rejected')

  const late = reduce(s, { type: 'WINDOW_EXPIRED', at: 1000 + WINDOW_FIRST_MS })
  expect(late.state.window).toBeNull()
  expect(late.events.map((e) => e.type)).toEqual(['windowClosed'])
})

it('blocks the turn owner from acting while a window is open', () => {
  const s = released()
  expect(reduce(s, { type: 'PUSH', player: 'p1', at: 1001 }).events[0].type).toBe('rejected')
  expect(reduce(s, { type: 'DRAW', player: 'p1', at: 1001 }).events[0].type).toBe('rejected')
})

it('projects the window with the viewer’s usable attacks', () => {
  const s = released()
  const attacker = engine.project(s, 'p2')
  expect(attacker.window?.round).toBe(1)
  expect(attacker.window?.canAttackWith).toEqual([BUG.uid])

  // The owner sees the window but can never throw into it.
  const owner = engine.project(s, 'p1')
  expect(owner.window?.canAttackWith).toEqual([])
  // A responder holding nothing relevant sees an empty option set.
  expect(engine.project(s, 'p3').window?.canAttackWith).toEqual([])
})

it('does not count DDoS as a reaction-window attack', () => {
  const ddos: CardInstance = { uid: 'attack-ddos#0', id: 'attack-ddos' }
  const s = released({ p2: [ddos] })
  expect(engine.project(s, 'p2').window?.canAttackWith).toEqual([])
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @release/engine test src/fake/window.test.ts`
Expected: FAIL — `Failed to resolve import "./window"`.

- [ ] **Step 3: Write the implementation**

Create `packages/engine/src/fake/window.ts`:

```ts
import type { Action } from '../actions'
import { RELEASE_ATTACKS } from '../cards'
import type { Reduction } from '../engine'
import type { CardUid, GameState, PlayerId, ReactionWindow } from '../state'
import { createLog, type Log, reject } from './core'

// understanding.md §7: the first reaction gets 15s; every later round in the same
// exchange gets 10s.
export const WINDOW_FIRST_MS = 15_000
export const WINDOW_NEXT_MS = 10_000

// Everyone who may throw an attack: living players other than the release owner.
export function respondersFor(state: GameState, owner: PlayerId): PlayerId[] {
  return state.seating.filter((id) => id !== owner && !state.eliminated.includes(id))
}

// Which of a viewer's cards may be thrown into the open window. DDoS is excluded:
// it does not destroy a bare release and resolves on its own path.
export function canAttackWith(state: GameState, viewer: PlayerId): CardUid[] {
  const w = state.window
  if (!w || state.pending) return []
  if (viewer === w.target.player) return []
  if (state.eliminated.includes(viewer)) return []
  return state.players[viewer].hand.filter((c) => RELEASE_ATTACKS.has(c.id)).map((c) => c.uid)
}

export function openWindow(
  state: GameState,
  log: Log,
  target: ReactionWindow['target'],
  round: number,
  at: number,
): GameState {
  // With nobody able to answer there is no window to open.
  if (respondersFor(state, target.player).length === 0) return { ...state, eventSeq: log.seq }
  const deadline = at + (round === 1 ? WINDOW_FIRST_MS : WINDOW_NEXT_MS)
  log.add({ type: 'windowOpened', player: target.player, slot: target.slot, round, deadline })
  return { ...state, window: { target, round, deadline, passed: [] }, eventSeq: log.seq }
}

export function closeWindow(state: GameState, log: Log): GameState {
  const w = state.window
  if (!w) return { ...state, eventSeq: log.seq }
  log.add({ type: 'windowClosed', player: w.target.player, slot: w.target.slot })
  return { ...state, window: null, eventSeq: log.seq }
}

export function onPass(state: GameState, action: Action & { type: 'PASS' }): Reduction {
  const w = state.window
  if (!w) return reject(state, action, 'no reaction window is open')
  if (state.pending) return reject(state, action, 'a decision is pending')
  if (!respondersFor(state, w.target.player).includes(action.player)) {
    return reject(state, action, 'you cannot respond to this window')
  }
  if (w.passed.includes(action.player)) return reject(state, action, 'you already passed')

  const log = createLog(state.eventSeq)
  log.add({ type: 'passed', player: action.player })
  const passed = [...w.passed, action.player]
  const next: GameState = { ...state, window: { ...w, passed }, eventSeq: log.seq }
  // A pass is only "close early if everyone agrees" — the window ends when the
  // last responder concurs, or when the clock runs out.
  if (passed.length === respondersFor(state, w.target.player).length) {
    return { state: closeWindow(next, log), events: log.events }
  }
  return { state: next, events: log.events }
}

export function onUnpass(state: GameState, action: Action & { type: 'UNPASS' }): Reduction {
  const w = state.window
  if (!w) return reject(state, action, 'no reaction window is open')
  if (!w.passed.includes(action.player)) return reject(state, action, 'you have not passed')

  const log = createLog(state.eventSeq)
  log.add({ type: 'unpassed', player: action.player })
  return {
    state: {
      ...state,
      window: { ...w, passed: w.passed.filter((id) => id !== action.player) },
      eventSeq: log.seq,
    },
    events: log.events,
  }
}

export function onWindowExpired(
  state: GameState,
  action: Action & { type: 'WINDOW_EXPIRED' },
): Reduction {
  const w = state.window
  if (!w) return reject(state, action, 'no reaction window is open')
  // The deadline is authoritative, not the caller's say-so: an early expiry would
  // let one peer cut everyone else's reaction time short.
  if (action.at < w.deadline) return reject(state, action, 'the window has not expired')

  const log = createLog(state.eventSeq)
  return { state: closeWindow(state, log), events: log.events }
}
```

- [ ] **Step 4: Open the window from `placeRelease`**

In `packages/engine/src/fake/release.ts`, add the import and change the signature:

```ts
import { openWindow } from './window'
```

```ts
export function placeRelease(
  state: GameState,
  log: Log,
  at: number,
  player: PlayerId,
  release: CardUid,
  codeReview?: CardUid,
): GameState {
```

Replace the closing `return checkWin(placed, log)` with:

```ts
  const decided = checkWin(placed, log)
  // A Code Review-protected release cannot be attacked at all, so no window opens
  // (understanding.md §8). Neither does one on a game that just ended.
  if (cr || decided.over) return decided
  return openWindow(decided, log, { player, slot, card: card.uid }, 1, at)
```

Update both call sites in the same file to pass `action.at` as the third argument:

```ts
      const next = placeRelease(state, log, action.at, action.player, action.card, codeReview)
```

```ts
    state: placeRelease(banked, log, action.at, action.player, pending.release, pending.codeReview),
```

- [ ] **Step 5: Route the new actions and project the window**

In `reduce.ts` add the import and three cases above `default`:

```ts
import { onPass, onUnpass, onWindowExpired } from './window'
```

```ts
    case 'PASS':
      return onPass(state, action)
    case 'UNPASS':
      return onUnpass(state, action)
    case 'WINDOW_EXPIRED':
      return onWindowExpired(state, action)
```

In `project.ts`, import `canAttackWith` from `./window` and replace the hardcoded `window: null`:

```ts
    window: state.window && {
      player: state.window.target.player,
      slot: state.window.target.slot,
      round: state.window.round,
      deadline: state.window.deadline,
      passed: [...state.window.passed],
      canAttackWith: canAttackWith(state, viewerId),
    },
```

> No cycle forms here, because `core.ts` (Task 5) owns the shared helpers: `project → window → core` and `reduce → {project, window, release}` are both acyclic. If a later import does reach back into `reduce.ts` from one of those modules, move the shared symbol down into `core.ts` rather than accepting the cycle.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @release/engine test`
Expected: PASS — 9 window tests plus every earlier suite.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/fake
git commit -m "feat(engine): reaction window with revocable pass and Code Review suppression"
```

---

## Task 9: Attacks in the window, and defence resolution

**Files:**
- Create: `packages/engine/src/fake/attacks.ts`
- Modify: `packages/engine/src/fake/reduce.ts` — route `ATTACK` and the `defend` choice
- Modify: `packages/engine/src/fake/project.ts` — replace the hardcoded `pending: null`
- Test: `packages/engine/src/fake/attacks.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const DEFEND_MS = 15_000
  export function onAttack(state: GameState, action: Action & { type: 'ATTACK' }): Reduction
  export function onDefend(state: GameState, action: Action & { type: 'RESOLVE' }): Reduction
  export function defencesFor(state: GameState, player: PlayerId, sudo: boolean): CardUid[]
  export function pendingView(state: GameState, viewerId: PlayerId): PendingView | null
  ```

**Rules encoded here** (from [`docs/rules-board-game.md`](../rules-board-game.md)):
- Cancel-type defences (Hotfix, Rubber Ducky, PR Approved, Rollback) do **not** work against a sudo-boosted attack; Unicorn-type (Not a Bug, Works on my Machine) work even then.
- Rollback returns the attack card to the attacker's hand; sudo Rollback gives it to the defender instead.
- Works on my Machine turns the effect back on the attacker.
- Security Bug steals the release into the attacker's zone; if that slot is already taken, the stolen release is discarded.
- A repelled attack reopens the window at `round + 1`.

- [ ] **Step 1: Write the failing test**

Create `packages/engine/src/fake/attacks.test.ts`:

```ts
import type { GameConfig } from '../engine'
import type { CardInstance, GameState, Setup } from '../state'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from './index'
import { reduce } from './reduce'
import { WINDOW_NEXT_MS } from './window'

const engine = createFakeEngine()

const EASY: Setup = {
  handLimit: 'base',
  releases: 'base',
  releaseCond: 'easy',
  ai: 'base',
  gitBranch: 'base',
}

const config = (): GameConfig => ({
  gameId: 'g1',
  seed: 4242,
  players: [
    { id: 'p1', name: 'you' },
    { id: 'p2', name: 'kernel_panic' },
  ],
  setup: EASY,
  deck: FAKE_DECK,
  events: FAKE_EVENTS,
})

const FE: CardInstance = { uid: 'release-frontend#0', id: 'release-frontend' }
const BUG: CardInstance = { uid: 'attack-bug#0', id: 'attack-bug' }
const SEC: CardInstance = { uid: 'attack-security-bug#0', id: 'attack-security-bug' }
const SUDO: CardInstance = { uid: 'support-sudo#0', id: 'support-sudo' }
const HOTFIX: CardInstance = { uid: 'defense-hotfix#0', id: 'defense-hotfix' }
const NOTABUG: CardInstance = { uid: 'defense-not-a-bug#0', id: 'defense-not-a-bug' }
const ROLLBACK: CardInstance = { uid: 'defense-rollback#0', id: 'defense-rollback' }
const WOMM: CardInstance = { uid: 'defense-works-on-my-machine#0', id: 'defense-works-on-my-machine' }

// p1 releases Frontend; p1 then holds `defence`, p2 holds `attack`.
const staged = (attack: CardInstance[], defence: CardInstance[]): GameState => {
  const s = engine.createGame(config())
  const primed: GameState = {
    ...s,
    players: {
      ...s.players,
      p1: { ...s.players.p1, hand: [FE, ...defence] },
      p2: { ...s.players.p2, hand: attack },
    },
  }
  return reduce(primed, { type: 'PLAY', player: 'p1', card: FE.uid, at: 1000 }).state
}

it('turns an attack into a defence decision for the release owner', () => {
  const r = reduce(staged([BUG], [HOTFIX]), {
    type: 'ATTACK',
    player: 'p2',
    card: BUG.uid,
    at: 1001,
  })
  expect(r.state.pending).toMatchObject({
    kind: 'defend',
    player: 'p1',
    attacker: 'p2',
    attack: BUG.uid,
    sudo: false,
    canDefendWith: [HOTFIX.uid],
  })
  expect(r.events.map((e) => e.type)).toEqual(['attacked'])
})

it('destroys the release when the owner takes the hit', () => {
  const attacked = reduce(staged([BUG], []), {
    type: 'ATTACK',
    player: 'p2',
    card: BUG.uid,
    at: 1001,
  })
  const r = reduce(attacked.state, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'defend', card: null },
    at: 1002,
  })
  expect(r.state.players.p1.release.frontend).toBeUndefined()
  expect(r.state.window).toBeNull()
  expect(r.state.decks.discard.map((c) => c.uid)).toContain(FE.uid)
  expect(r.events.map((e) => e.type)).toEqual(['tookHit', 'releaseDestroyed', 'windowClosed'])
})

it('reopens the window a round later when the attack is cancelled', () => {
  const attacked = reduce(staged([BUG], [HOTFIX]), {
    type: 'ATTACK',
    player: 'p2',
    card: BUG.uid,
    at: 1001,
  })
  const r = reduce(attacked.state, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'defend', card: HOTFIX.uid },
    at: 1002,
  })
  expect(r.state.players.p1.release.frontend?.card).toEqual(FE)
  expect(r.state.window).toMatchObject({ round: 2, deadline: 1002 + WINDOW_NEXT_MS, passed: [] })
  expect(r.state.decks.discard.map((c) => c.uid)).toEqual([BUG.uid, HOTFIX.uid])
})

it('denies a Cancel defence against a sudo attack but allows a Unicorn', () => {
  const withSudo = staged([BUG, SUDO], [HOTFIX, NOTABUG])
  const attacked = reduce(withSudo, {
    type: 'ATTACK',
    player: 'p2',
    card: BUG.uid,
    combo: SUDO.uid,
    at: 1001,
  })
  expect(attacked.state.pending).toMatchObject({ sudo: true, canDefendWith: [NOTABUG.uid] })

  const refused = reduce(attacked.state, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'defend', card: HOTFIX.uid },
    at: 1002,
  })
  expect(refused.state).toBe(attacked.state)
  expect(refused.events[0].type).toBe('rejected')

  const held = reduce(attacked.state, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'defend', card: NOTABUG.uid },
    at: 1002,
  })
  expect(held.state.players.p1.release.frontend?.card).toEqual(FE)
})

it('returns the attack to the attacker’s hand on Rollback', () => {
  const attacked = reduce(staged([BUG], [ROLLBACK]), {
    type: 'ATTACK',
    player: 'p2',
    card: BUG.uid,
    at: 1001,
  })
  const r = reduce(attacked.state, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'defend', card: ROLLBACK.uid },
    at: 1002,
  })
  expect(r.state.players.p2.hand.map((c) => c.uid)).toEqual([BUG.uid])
  expect(r.state.decks.discard.map((c) => c.uid)).toEqual([ROLLBACK.uid])
})

it('gives the attack to the defender on sudo Rollback', () => {
  const attacked = reduce(staged([BUG], [ROLLBACK, SUDO]), {
    type: 'ATTACK',
    player: 'p2',
    card: BUG.uid,
    at: 1001,
  })
  const r = reduce(attacked.state, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'defend', card: ROLLBACK.uid, combo: SUDO.uid },
    at: 1002,
  } as never)
  expect(r.state.players.p1.hand.map((c) => c.uid)).toContain(BUG.uid)
})

it('reflects the effect onto the attacker with Works on my Machine', () => {
  const s = staged([BUG], [WOMM])
  const withAttackerRelease: GameState = {
    ...s,
    players: {
      ...s.players,
      p2: {
        ...s.players.p2,
        release: { backend: { card: { uid: 'release-backend#0', id: 'release-backend' } } },
      },
    },
  }
  const attacked = reduce(withAttackerRelease, {
    type: 'ATTACK',
    player: 'p2',
    card: BUG.uid,
    at: 1001,
  })
  const r = reduce(attacked.state, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'defend', card: WOMM.uid },
    at: 1002,
  })
  expect(r.state.players.p1.release.frontend?.card).toEqual(FE)
  expect(r.state.players.p2.release.backend).toBeUndefined()
  expect(r.events.some((e) => e.type === 'defended' && e.effect === 'reflect')).toBe(true)
})

it('steals the release into the attacker’s zone with Security Bug', () => {
  const attacked = reduce(staged([SEC], []), {
    type: 'ATTACK',
    player: 'p2',
    card: SEC.uid,
    at: 1001,
  })
  const r = reduce(attacked.state, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'defend', card: null },
    at: 1002,
  })
  expect(r.state.players.p1.release.frontend).toBeUndefined()
  expect(r.state.players.p2.release.frontend?.card).toEqual(FE)
  expect(r.events.some((e) => e.type === 'releaseStolen')).toBe(true)
})

it('rejects an attack from someone who cannot respond', () => {
  const s = staged([BUG], [])
  expect(reduce(s, { type: 'ATTACK', player: 'p1', card: BUG.uid, at: 1001 }).events[0].type).toBe(
    'rejected',
  )
})

it('projects the defence prompt only to the player who owes it', () => {
  const attacked = reduce(staged([BUG], [HOTFIX]), {
    type: 'ATTACK',
    player: 'p2',
    card: BUG.uid,
    at: 1001,
  }).state
  expect(engine.project(attacked, 'p1').pending).toMatchObject({
    kind: 'defend',
    options: [HOTFIX.uid],
    attackCard: 'attack-bug',
  })
  // p2 learns a decision is outstanding but never sees p1's options.
  const other = engine.project(attacked, 'p2').pending
  expect(other?.kind).toBe('defend')
  expect(other && 'options' in other && other.options).toEqual([])
})
```

> The sudo-Rollback test passes `combo` on a `defend` choice. Add that field to the `Choice` union in `actions.ts` as part of Step 3 — `{ kind: 'defend'; card: CardUid | null; combo?: CardUid }` — and drop the `as never` cast from the test once it typechecks.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @release/engine test src/fake/attacks.test.ts`
Expected: FAIL — `Failed to resolve import "./attacks"`.

- [ ] **Step 3: Extend the `defend` choice**

In `packages/engine/src/actions.ts`:

```ts
  // `combo` carries a Sudo played alongside the defence (sudo Rollback).
  | { kind: 'defend'; card: CardUid | null; combo?: CardUid }
```

- [ ] **Step 4: Write the implementation**

Create `packages/engine/src/fake/attacks.ts`:

```ts
import type { Action } from '../actions'
import { RELEASE_ATTACKS, rulesFor } from '../cards'
import type { Reduction } from '../engine'
import type { CardInstance, CardUid, GameState, PlayerId, ReleaseSlot } from '../state'
import type { PendingView } from '../view'
import { createLog, type Log, reject, setHand } from './core'
import { closeWindow, openWindow, respondersFor } from './window'

// A stalled defence blocks everyone, so it carries a deadline like the window.
export const DEFEND_MS = 15_000

const SLOTS: readonly ReleaseSlot[] = ['frontend', 'backend', 'database']

// Cancel-type defences fail against a sudo attack; Unicorn-type never do.
export function defencesFor(state: GameState, player: PlayerId, sudo: boolean): CardUid[] {
  return state.players[player].hand
    .filter((c) => {
      const kind = rulesFor(c.id)?.kind
      return kind === 'unicorn' || (kind === 'cancel' && !sudo)
    })
    .map((c) => c.uid)
}

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
    log.add({ type: 'releaseStolen', from: owner, to: stealer, slot, card: released.card.id }, parent)
    const withCodeReviewGone = released.codeReview ? discard(cleared, [released.codeReview]) : cleared
    return {
      ...withCodeReviewGone,
      players: {
        ...withCodeReviewGone.players,
        [stealer]: {
          ...withCodeReviewGone.players[stealer],
          release: { ...withCodeReviewGone.players[stealer].release, [slot]: { card: released.card } },
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
  if (!RELEASE_ATTACKS.has(card.id)) return reject(state, action, 'that card cannot attack a release')

  // A Sudo rides along as one action and must actually be held.
  let sudo = false
  if (action.combo !== undefined) {
    const partner = hand.find((c) => c.uid === action.combo)
    if (!partner || partner.id !== 'support-sudo') {
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
        deadline: action.at + DEFEND_MS,
      },
      eventSeq: log.seq,
    },
    events: log.events,
  }
}

export function onDefend(state: GameState, action: Action & { type: 'RESOLVE' }): Reduction {
  const pending = state.pending
  const w = state.window
  if (pending?.kind !== 'defend' || !w) return reject(state, action, 'no defence pending')
  if (pending.player !== action.player) return reject(state, action, 'not your decision')
  const choice = action.choice
  if (choice.kind !== 'defend') return reject(state, action, 'wrong choice for this decision')

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
    if (!partner || partner.id !== 'support-sudo') return reject(state, action, 'invalid sudo combo')
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
  let next: GameState = discard(
    { ...spentHand, pending: null },
    [defence, ...(sudoCard ? [sudoCard] : [])],
  )

  if (effect === 'return') {
    // Rollback hands the attack back; sudo Rollback keeps it for the defender.
    const recipient = sudoDefence ? action.player : attacker
    next = setHand(next, recipient, [...next.players[recipient].hand, attackCard])
  } else if (effect === 'reflect') {
    // Works on my Machine turns the attack on its author: their own release falls.
    next = discard(next, [attackCard])
    const victimSlot = SLOTS.find((s) => next.players[attacker].release[s])
    if (victimSlot) next = takeRelease(next, log, attacker, victimSlot, null)
  } else {
    next = discard(next, [attackCard])
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
        deadline: p.deadline,
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
    // Task 10 fills in the trigger decisions.
    default:
      return null
  }
}
```

- [ ] **Step 5: Route the new cases**

In `reduce.ts`:

```ts
import { onAttack, onDefend } from './attacks'
```

In `onResolve`'s switch: `case 'defend': return onDefend(state, action)`
In `reduce`'s switch: `case 'ATTACK': return onAttack(state, action)`

In `project.ts`, import `pendingView` from `./attacks` and replace `pending: null` with `pending: pendingView(state, viewerId)`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @release/engine test`
Expected: PASS — 10 attack tests plus every earlier suite.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src
git commit -m "feat(engine): window attacks, defence resolution, sudo and steal rules"
```

---

## Task 10: Proactive attacks on your own turn

Bug / Out of Memory / Legacy Code take a random card from a hand; Security Bug names a card type; DDoS destroys a Monitoring or returns a release and freezes it. All four are defensible, so they reuse the `defend` pending — which needs a scope, since a cancelled hand attack has no release to spare.

**Files:**
- Modify: `packages/engine/src/state.ts` — `defend` pending gains `scope`; add the two trigger-free pendings
- Create: `packages/engine/src/fake/handAttacks.ts`
- Modify: `packages/engine/src/fake/release.ts` — `onPlay` routes attack cards
- Modify: `packages/engine/src/fake/attacks.ts` — `onDefend` branches on `scope`
- Test: `packages/engine/src/fake/handAttacks.test.ts`

- [ ] **Step 1: Widen the `defend` pending**

In `packages/engine/src/state.ts`, replace the `defend` variant:

```ts
  | {
      kind: 'defend'
      player: PlayerId
      attacker: PlayerId
      attack: CardUid
      sudo: boolean
      canDefendWith: CardUid[]
      deadline: number
      // 'release' answers a reaction window; 'hand' answers an attack on the
      // player's hand, where surviving means the theft simply does not happen.
      scope: 'release' | 'hand'
      // Security Bug only: the card type the attacker named.
      requested?: CardId
    }
```

`PendingView`'s `defend` variant gains the same `scope` field in `view.ts`, and `pendingView` in `attacks.ts` passes it through. `onAttack` (Task 9) sets `scope: 'release'`.

- [ ] **Step 2: Write the failing test**

Create `packages/engine/src/fake/handAttacks.test.ts`:

```ts
import type { GameConfig } from '../engine'
import type { CardInstance, GameState, Setup } from '../state'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from './index'
import { reduce } from './reduce'

const engine = createFakeEngine()

const EASY: Setup = {
  handLimit: 'base',
  releases: 'base',
  releaseCond: 'easy',
  ai: 'base',
  gitBranch: 'base',
}

const config = (): GameConfig => ({
  gameId: 'g1',
  seed: 4242,
  players: [
    { id: 'p1', name: 'you' },
    { id: 'p2', name: 'kernel_panic' },
  ],
  setup: EASY,
  deck: FAKE_DECK,
  events: FAKE_EVENTS,
})

const BUG: CardInstance = { uid: 'attack-bug#0', id: 'attack-bug' }
const SEC: CardInstance = { uid: 'attack-security-bug#0', id: 'attack-security-bug' }
const DDOS: CardInstance = { uid: 'attack-ddos#0', id: 'attack-ddos' }
const MON: CardInstance = { uid: 'protection-monitoring#0', id: 'protection-monitoring' }
const FE: CardInstance = { uid: 'release-frontend#0', id: 'release-frontend' }
const CR: CardInstance = { uid: 'support-code-review#0', id: 'support-code-review' }
const HOTFIX: CardInstance = { uid: 'defense-hotfix#0', id: 'defense-hotfix' }

const table = (p1: CardInstance[], p2: CardInstance[]): GameState => {
  const s = engine.createGame(config())
  return {
    ...s,
    players: {
      ...s.players,
      p1: { ...s.players.p1, hand: p1 },
      p2: { ...s.players.p2, hand: p2 },
    },
  }
}

it('opens a hand-scoped defence when Bug targets a player', () => {
  const r = reduce(table([BUG], [HOTFIX]), {
    type: 'PLAY',
    player: 'p1',
    card: BUG.uid,
    target: { kind: 'player', player: 'p2' },
    at: 1000,
  })
  expect(r.state.pending).toMatchObject({ kind: 'defend', player: 'p2', scope: 'hand' })
  expect(r.state.window).toBeNull()
})

it('steals one card when the hand attack is taken', () => {
  const victim: CardInstance = { uid: 'support-sudo#0', id: 'support-sudo' }
  const attacked = reduce(table([BUG], [victim]), {
    type: 'PLAY',
    player: 'p1',
    card: BUG.uid,
    target: { kind: 'player', player: 'p2' },
    at: 1000,
  })
  const r = reduce(attacked.state, {
    type: 'RESOLVE',
    player: 'p2',
    choice: { kind: 'defend', card: null },
    at: 1001,
  })
  expect(r.state.players.p2.hand).toEqual([])
  expect(r.state.players.p1.hand.map((c) => c.uid)).toEqual([victim.uid])
  // The identity of a stolen card is private to the two parties.
  const transfer = r.events.find((e) => e.type === 'handTransfer')
  expect(transfer?.visibleTo?.sort()).toEqual(['p1', 'p2'])
})

it('leaves the hand intact when the attack is cancelled', () => {
  const attacked = reduce(table([BUG], [HOTFIX]), {
    type: 'PLAY',
    player: 'p1',
    card: BUG.uid,
    target: { kind: 'player', player: 'p2' },
    at: 1000,
  })
  const r = reduce(attacked.state, {
    type: 'RESOLVE',
    player: 'p2',
    choice: { kind: 'defend', card: HOTFIX.uid },
    at: 1001,
  })
  expect(r.state.players.p2.hand).toEqual([])
  expect(r.state.players.p1.hand).toEqual([])
  expect(r.state.window).toBeNull()
})

it('asks Security Bug for a card type, and misses when it is absent', () => {
  const attacked = reduce(table([SEC], []), {
    type: 'PLAY',
    player: 'p1',
    card: SEC.uid,
    target: { kind: 'player', player: 'p2' },
    at: 1000,
  })
  const taken = reduce(attacked.state, {
    type: 'RESOLVE',
    player: 'p2',
    choice: { kind: 'defend', card: null },
    at: 1001,
  })
  expect(taken.state.pending).toMatchObject({ kind: 'requestCard', player: 'p1', target: 'p2' })

  const r = reduce(taken.state, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'requestCard', card: 'support-sudo' },
    at: 1002,
  })
  expect(r.state.pending).toBeNull()
  expect(r.events.some((e) => e.type === 'requested' && e.hit === false)).toBe(true)
})

it('destroys a Monitoring with DDoS', () => {
  const s = table([DDOS], [])
  const guarded: GameState = {
    ...s,
    players: { ...s.players, p2: { ...s.players.p2, release: { monitoring: MON } } },
  }
  const r = reduce(guarded, {
    type: 'PLAY',
    player: 'p1',
    card: DDOS.uid,
    target: { kind: 'monitoring', player: 'p2' },
    at: 1000,
  })
  expect(r.state.players.p2.release.monitoring).toBeUndefined()
  expect(r.state.decks.discard.map((c) => c.uid)).toContain(MON.uid)
})

it('returns a protected release to hand and freezes it', () => {
  const s = table([DDOS], [])
  const guarded: GameState = {
    ...s,
    players: {
      ...s.players,
      p2: { ...s.players.p2, release: { frontend: { card: FE, codeReview: CR } } },
    },
  }
  const r = reduce(guarded, {
    type: 'PLAY',
    player: 'p1',
    card: DDOS.uid,
    target: { kind: 'release', player: 'p2', slot: 'frontend' },
    at: 1000,
  })
  expect(r.state.players.p2.release.frontend).toBeUndefined()
  expect(r.state.players.p2.hand.map((c) => c.uid)).toEqual([FE.uid])
  expect(r.state.players.p2.frozen).toEqual([FE.uid])
  // Code Review is discarded rather than returned with it.
  expect(r.state.decks.discard.map((c) => c.uid)).toContain(CR.uid)
})

it('thaws a frozen card when its owner’s next turn ends', () => {
  const s = table([], [])
  const frozen: GameState = {
    ...s,
    players: { ...s.players, p1: { ...s.players.p1, frozen: [FE.uid], hand: [FE] } },
    turn: { player: 'p1', index: 0, hasDrawn: true, releasesPlayed: 0 },
  }
  const r = reduce(frozen, { type: 'PUSH', player: 'p1', at: 1000 })
  expect(r.state.players.p1.frozen).toEqual([])
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @release/engine test src/fake/handAttacks.test.ts`
Expected: FAIL — `Failed to resolve import "./handAttacks"`.

- [ ] **Step 4: Write the implementation**

Create `packages/engine/src/fake/handAttacks.ts`:

```ts
import type { Action, Target } from '../actions'
import type { Reduction } from '../engine'
import { randomAt } from '../rng'
import type { CardInstance, GameState, PlayerId } from '../state'
import { defencesFor, DEFEND_MS } from './attacks'
import { createLog, type Log, reject, setHand } from './core'

const discard = (state: GameState, cards: CardInstance[]): GameState => ({
  ...state,
  decks: { ...state.decks, discard: [...state.decks.discard, ...cards] },
})

// Opens a hand-scoped defence. The attack card has already left the attacker's
// hand; a successful defence simply means the theft never happens.
export function openHandAttack(
  state: GameState,
  log: Log,
  attacker: PlayerId,
  attack: CardInstance,
  target: PlayerId,
  sudo: boolean,
  at: number,
): GameState {
  log.add({ type: 'attacked', attacker, card: attack.id, sudo, target })
  return {
    ...state,
    pending: {
      kind: 'defend',
      player: target,
      attacker,
      attack: attack.uid,
      attackId: attack.id,
      sudo,
      canDefendWith: defencesFor(state, target, sudo),
      deadline: at + DEFEND_MS,
      scope: 'hand',
    },
    eventSeq: log.seq,
  }
}

// Bug / Out of Memory / Legacy Code: one card at random. The cursor advances
// through state, so the same action on the same state always takes the same card.
export function stealRandom(
  state: GameState,
  log: Log,
  from: PlayerId,
  to: PlayerId,
  parent?: number,
): GameState {
  const hand = state.players[from].hand
  if (hand.length === 0) return { ...state, eventSeq: log.seq }
  const index = Math.floor(randomAt(state.seed, state.rngCursor) * hand.length)
  const card = hand[index]
  log.add(
    {
      type: 'handTransfer',
      from,
      to,
      card: card.id,
      // Only the two parties learn which card moved; the table sees counts.
      visibleTo: [from, to],
    },
    parent,
  )
  const stripped = setHand(
    state,
    from,
    hand.filter((c) => c.uid !== card.uid),
  )
  return {
    ...setHand(stripped, to, [...stripped.players[to].hand, card]),
    rngCursor: state.rngCursor + 1,
    eventSeq: log.seq,
  }
}

// DDoS: destroy a Monitoring, or bounce a release back to its owner's hand and
// freeze that instance for a round. It is the only card that reaches a release
// protected by Code Review — which is discarded rather than returned.
export function resolveDdos(
  state: GameState,
  log: Log,
  actor: PlayerId,
  target: Target,
): GameState {
  if (target.kind === 'monitoring') {
    const mon = state.players[target.player].release.monitoring
    if (!mon) return { ...state, eventSeq: log.seq }
    log.add({ type: 'monitoringDestroyed', player: target.player, card: mon.id })
    const zone = { ...state.players[target.player].release }
    delete zone.monitoring
    return {
      ...discard(
        {
          ...state,
          players: {
            ...state.players,
            [target.player]: { ...state.players[target.player], release: zone },
          },
        },
        [mon],
      ),
      eventSeq: log.seq,
    }
  }

  if (target.kind !== 'release') return { ...state, eventSeq: log.seq }
  const released = state.players[target.player].release[target.slot]
  if (!released) return { ...state, eventSeq: log.seq }

  log.add({
    type: 'releaseReturned',
    player: target.player,
    slot: target.slot,
    card: released.card.id,
  })
  const zone = { ...state.players[target.player].release }
  delete zone[target.slot]
  const owner = state.players[target.player]
  const bounced: GameState = {
    ...state,
    players: {
      ...state.players,
      [target.player]: {
        ...owner,
        release: zone,
        hand: [...owner.hand, released.card],
        frozen: [...owner.frozen, released.card.uid],
      },
    },
  }
  const cleaned = released.codeReview ? discard(bounced, [released.codeReview]) : bounced
  return { ...cleaned, eventSeq: log.seq }
}

export function onRequestCard(
  state: GameState,
  action: Action & { type: 'RESOLVE' },
): Reduction {
  const pending = state.pending
  if (pending?.kind !== 'requestCard') return reject(state, action, 'no request pending')
  if (pending.player !== action.player) return reject(state, action, 'not your decision')
  const choice = action.choice
  if (choice.kind !== 'requestCard') return reject(state, action, 'wrong choice for this decision')

  const log = createLog(state.eventSeq)
  const held = state.players[pending.target].hand.filter((c) => c.id === choice.card)

  if (held.length === 0) {
    // A miss is public: everyone learns the guess was wrong.
    log.add({
      type: 'requested',
      attacker: pending.player,
      target: pending.target,
      card: choice.card,
      hit: false,
    })
    return { state: { ...state, pending: null, eventSeq: log.seq }, events: log.events }
  }

  log.add({
    type: 'requested',
    attacker: pending.player,
    target: pending.target,
    card: choice.card,
    hit: true,
  })
  // The holder chooses which copy to surrender.
  return {
    state: {
      ...state,
      pending: {
        kind: 'giveCard',
        player: pending.target,
        requested: choice.card,
        attacker: pending.player,
      },
      eventSeq: log.seq,
    },
    events: log.events,
  }
}

export function onGiveCard(state: GameState, action: Action & { type: 'RESOLVE' }): Reduction {
  const pending = state.pending
  if (pending?.kind !== 'giveCard') return reject(state, action, 'no handover pending')
  if (pending.player !== action.player) return reject(state, action, 'not your decision')
  const choice = action.choice
  if (choice.kind !== 'giveCard') return reject(state, action, 'wrong choice for this decision')

  const hand = state.players[action.player].hand
  const card = hand.find((c) => c.uid === choice.card)
  if (!card || card.id !== pending.requested) {
    return reject(state, action, 'that is not the requested card')
  }

  const log = createLog(state.eventSeq)
  log.add({
    type: 'handTransfer',
    from: action.player,
    to: pending.attacker,
    card: card.id,
    visibleTo: [action.player, pending.attacker],
  })
  const stripped = setHand(
    state,
    action.player,
    hand.filter((c) => c.uid !== choice.card),
  )
  const moved = setHand(stripped, pending.attacker, [
    ...stripped.players[pending.attacker].hand,
    card,
  ])
  return { state: { ...moved, pending: null, eventSeq: log.seq }, events: log.events }
}
```

- [ ] **Step 5: Route attack plays and branch the defence**

In `release.ts`, add the imports the branch needs:

```ts
import type { Action, Target } from '../actions'
import { legalTargets } from './reduce'
import { openHandAttack, resolveDdos } from './handAttacks'
```

Then in `onPlay`, before the final `reject`, add the attack branch:

```ts
  if (rules.kind === 'attack') {
    if (!action.target) return reject(state, action, 'that card needs a target')
    if (!legalTargets(state, action.player, action.card).some((t) => sameTarget(t, action.target))) {
      return reject(state, action, 'illegal target')
    }
    let sudo = false
    if (action.combo !== undefined) {
      const partner = hand.find((c) => c.uid === action.combo)
      if (!partner || partner.id !== 'support-sudo') return reject(state, action, 'invalid sudo combo')
      if (!rules.sudo) return reject(state, action, 'that card has no sudo effect')
      sudo = true
    }
    const spentCards = hand.filter((c) => c.uid === action.card || c.uid === action.combo)
    const spent = setHand(state, action.player, hand.filter((c) => !spentCards.includes(c)))

    // DDoS resolves immediately: it is not answerable by a defence card.
    if (card.id === 'attack-ddos') {
      const banked = {
        ...spent,
        decks: { ...spent.decks, discard: [...spent.decks.discard, ...spentCards] },
      }
      return { state: resolveDdos(banked, log, action.player, action.target), events: log.events }
    }

    const sudoOnly = spentCards.filter((c) => c.uid === action.combo)
    const withSudoSpent = {
      ...spent,
      decks: { ...spent.decks, discard: [...spent.decks.discard, ...sudoOnly] },
    }
    return {
      state: openHandAttack(
        withSudoSpent, log, action.player, card, action.target.player, sudo, action.at,
      ),
      events: log.events,
    }
  }
```

Add the helper at module scope in `release.ts`:

```ts
// Structural target equality — targets are small value objects, so a field-wise
// comparison is cheaper and clearer than serializing.
const sameTarget = (a: Target, b: Target): boolean =>
  a.kind === b.kind &&
  ('player' in a ? a.player === (b as { player: string }).player : true) &&
  ('slot' in a ? a.slot === (b as { slot: string }).slot : true) &&
  ('card' in a ? a.card === (b as { card: string }).card : true)
```

`action.target.player` is only reachable for `kind: 'player'`, so narrow before the `openHandAttack` call with an explicit check that `action.target.kind === 'player'`, rejecting otherwise.

In `attacks.ts`'s `onDefend`, branch at the top on `pending.scope`. When it is `'hand'`:
- a `null` choice discards the attack card, then applies `stealRandom` (Bug / Out of Memory / Legacy Code) or sets the `requestCard` pending (Security Bug);
- a defence card discards both and clears `pending` with no window to reopen.

Also extend `playableFor` in `project.ts` so `attack` cards are only playable when `legalTargets` is non-empty — otherwise an attack with no living opponent shows as playable and then rejects.

In `reduce.ts`'s `onResolve` switch add `case 'requestCard'` and `case 'giveCard'`.

In `reduce.ts`'s `endTurn`, thaw the departing player's frozen cards:

```ts
  // A DDoS freeze lasts exactly one round: it lifts as its victim's next turn ends.
  const thawed = { ...state.players[me], frozen: [] }
```

and use it when building the returned state.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @release/engine test`
Expected: PASS — 7 hand-attack tests plus every earlier suite.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src
git commit -m "feat(engine): hand attacks, Security Bug requests, DDoS and freeze"
```

---

## Task 11: Triggers — Error 503, AI, and elimination

**Files:**
- Create: `packages/engine/src/fake/triggers.ts`
- Modify: `packages/engine/src/fake/reduce.ts` — `onDraw` fires triggers; route the two neutralize choices
- Test: `packages/engine/src/fake/triggers.test.ts`

**Rules encoded here:**
- Error 503 on draw is revealed to everyone and must be neutralized: play a Debugger, have a Monitoring (which survives), or sacrifice one of your own releases. Failing that, the player is eliminated.
- AI on draw is revealed, discarded, and pulls one random card from the event deck, which resolves immediately and returns to that deck.
- The last living player wins by `lastStanding`.

- [ ] **Step 1: Write the failing test**

Create `packages/engine/src/fake/triggers.test.ts`:

```ts
import type { GameConfig } from '../engine'
import type { CardInstance, GameState, Setup } from '../state'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from './index'
import { reduce } from './reduce'

const engine = createFakeEngine()

const BASE: Setup = {
  handLimit: 'base',
  releases: 'base',
  releaseCond: 'base',
  ai: 'base',
  gitBranch: 'base',
}

const config = (): GameConfig => ({
  gameId: 'g1',
  seed: 4242,
  players: [
    { id: 'p1', name: 'you' },
    { id: 'p2', name: 'kernel_panic' },
  ],
  setup: BASE,
  deck: FAKE_DECK,
  events: FAKE_EVENTS,
})

const E503: CardInstance = { uid: 'trigger-error-503#0', id: 'trigger-error-503' }
const DBG: CardInstance = { uid: 'protection-debugger#0', id: 'protection-debugger' }
const MON: CardInstance = { uid: 'protection-monitoring#0', id: 'protection-monitoring' }
const FE: CardInstance = { uid: 'release-frontend#0', id: 'release-frontend' }

// Stack `top` as the next card p1 will draw.
const withTop = (top: CardInstance, hand: CardInstance[] = []): GameState => {
  const s = engine.createGame(config())
  return {
    ...s,
    players: { ...s.players, p1: { ...s.players.p1, hand } },
    decks: { ...s.decks, main: [[top, ...s.decks.main[0]]] },
  }
}

it('reveals Error 503 to everyone and demands neutralization', () => {
  const r = reduce(withTop(E503, [DBG]), { type: 'DRAW', player: 'p1', at: 1000 })
  const revealed = r.events.find((e) => e.type === 'revealed')
  expect(revealed).toBeDefined()
  expect(revealed?.visibleTo).toBeUndefined()
  expect(r.state.pending).toEqual({ kind: 'neutralize503', player: 'p1', methods: ['debugger'] })
})

it('spends a Debugger to neutralize', () => {
  const drawn = reduce(withTop(E503, [DBG]), { type: 'DRAW', player: 'p1', at: 1000 })
  const r = reduce(drawn.state, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'neutralize503', method: 'debugger' },
    at: 1001,
  })
  expect(r.state.pending).toBeNull()
  expect(r.state.players.p1.hand).toEqual([])
  expect(r.state.decks.discard.map((c) => c.uid)).toEqual(
    expect.arrayContaining([DBG.uid, E503.uid]),
  )
})

it('lets Monitoring absorb it and survive', () => {
  const s = withTop(E503, [])
  const guarded: GameState = {
    ...s,
    players: { ...s.players, p1: { ...s.players.p1, release: { monitoring: MON } } },
  }
  const drawn = reduce(guarded, { type: 'DRAW', player: 'p1', at: 1000 })
  expect(drawn.state.pending).toMatchObject({ methods: ['monitoring'] })
  const r = reduce(drawn.state, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'neutralize503', method: 'monitoring' },
    at: 1001,
  })
  expect(r.state.players.p1.release.monitoring).toEqual(MON)
  expect(r.state.decks.discard.map((c) => c.uid)).toContain(E503.uid)
})

it('sacrifices a release when that is the only way out', () => {
  const s = withTop(E503, [])
  const holding: GameState = {
    ...s,
    players: { ...s.players, p1: { ...s.players.p1, release: { frontend: { card: FE } } } },
  }
  const drawn = reduce(holding, { type: 'DRAW', player: 'p1', at: 1000 })
  expect(drawn.state.pending).toMatchObject({ methods: ['sacrifice'] })
  const r = reduce(drawn.state, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'neutralize503', method: 'sacrifice', card: FE.uid },
    at: 1001,
  })
  expect(r.state.players.p1.release.frontend).toBeUndefined()
  expect(r.state.eliminated).toEqual([])
})

it('eliminates a player with no way to neutralize, ending the game', () => {
  const r = reduce(withTop(E503, []), { type: 'DRAW', player: 'p1', at: 1000 })
  expect(r.state.pending).toBeNull()
  expect(r.state.eliminated).toEqual(['p1'])
  expect(r.state.over).toEqual({ winner: 'p2', condition: 'lastStanding' })
  expect(r.events.map((e) => e.type)).toEqual(
    expect.arrayContaining(['revealed', 'eliminated', 'gameOver']),
  )
})

it('reveals an AI trigger together with the event it pulls', () => {
  const ai: CardInstance = { uid: 'trigger-ai#0', id: 'trigger-ai' }
  const r = reduce(withTop(ai, []), { type: 'DRAW', player: 'p1', at: 1000 })
  const revealed = r.events.find((e) => e.type === 'aiRevealed')
  expect(revealed).toBeDefined()
  expect(revealed?.visibleTo).toBeUndefined()
  // The trigger goes to the discard; the event card returns to its own deck.
  expect(r.state.decks.discard.map((c) => c.uid)).toContain(ai.uid)
  expect(r.state.decks.events).toHaveLength(
    FAKE_EVENTS.reduce((n, e) => n + e.qty, 0),
  )
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @release/engine test src/fake/triggers.test.ts`
Expected: FAIL — `Failed to resolve import "./triggers"` once `reduce.ts` imports it, or assertion failures showing the trigger drawn into hand.

- [ ] **Step 3: Write the implementation**

Create `packages/engine/src/fake/triggers.ts` exporting:

```ts
export function neutralizeOptions(state: GameState, player: PlayerId): NeutralizeMethod[]
export function fireTrigger(
  state: GameState, log: Log, player: PlayerId, card: CardInstance, at: number,
): GameState
export function onNeutralize(state: GameState, action: Action & { type: 'RESOLVE' }): Reduction
export function eliminate(state: GameState, log: Log, player: PlayerId): GameState
export function resolveAiEvent(
  state: GameState, log: Log, player: PlayerId, event: CardInstance, at: number,
): GameState
```

`neutralizeOptions` returns `'debugger'` when a Debugger is in hand, `'monitoring'` when the zone holds one, and `'sacrifice'` when any release slot is filled — in that order.

`fireTrigger` handles the two trigger ids. For `trigger-error-503` it adds a public `revealed` event, discards the trigger, then either sets `pending: { kind: 'neutralize503', player, methods }` or — when `methods` is empty — calls `eliminate`. For `trigger-ai` it adds a public `aiRevealed`, discards the trigger, draws an event card at `randomAt(seed, rngCursor)` (advancing the cursor), resolves it via `resolveAiEvent`, and returns it to the events deck.

`eliminate` appends to `state.eliminated`, discards that player's hand and zone, adds an `eliminated` event, and when exactly one living player remains adds `gameOver` with `condition: 'lastStanding'`.

`resolveAiEvent` implements the fake's event set, each reusing machinery that already exists:
- `ai-crush-frontend` / `-backend` / `-database` → `pending: { kind: 'crush', player, slot, methods: neutralizeOptions(...) }`, resolved by `onNeutralize`'s `crush` branch, which destroys that slot when unanswered.
- `ai-release-frontend` / `-backend` / `-database` → place the release directly into the zone when its slot is free, with no Code Review and no window.
- `ai-monitoring` → place into `release.monitoring` when empty.
- `ai-good-vibe-coding` → draw two, re-entering `fireTrigger` for each so a chained trigger still fires.
- `ai-bad-vibe-coding` → `pending: { kind: 'handLimit', player, excess: 1 }`, reusing the existing discard prompt.
- `ai-hallucination` → end the turn immediately via `endTurn`.
- `ai-error-503` → the same path as `trigger-error-503`.

- [ ] **Step 4: Fire triggers from `onDraw`**

In `reduce.ts`'s `onDraw`, replace the private `drawn` event and hand append for trigger cards:

```ts
  // A trigger cannot stay private: it is revealed the moment it is drawn, and it
  // never reaches the drawer's hand.
  if (rulesFor(card.id)?.kind === 'trigger') {
    const base: GameState = {
      ...state,
      decks: { ...state.decks, main },
      turn: { ...state.turn, hasDrawn: true },
    }
    log.add({ type: 'drawn', player: action.player, pile: pileIndex, deckSize: main[pileIndex].length })
    return { state: fireTrigger(base, log, action.player, card, action.at), events: log.events }
  }
```

Note the public `drawn` event here carries no `card` and no `visibleTo` — the reveal is a separate event from `fireTrigger`.

Add `case 'neutralize503':` and `case 'crush':` to `onResolve`, both routing to `onNeutralize`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @release/engine test`
Expected: PASS — 6 trigger tests plus every earlier suite. The `withoutTriggers` helper in `reduce.test.ts` exists precisely so those turn-cycle tests stay unaffected.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src
git commit -m "feat(engine): Error 503, AI events, neutralization and elimination"
```

---

## Task 12: The opponent policy

Lives outside the reducer. A bot and the future P2P sync layer are the same kind of thing — a source of actions feeding an unchanged pure reducer — so getting a second action source working now is what makes the third cheap.

**Files:**
- Create: `packages/engine/src/fake/bots.ts`
- Test: `packages/engine/src/fake/bots.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function botAction(engine: Engine, state: GameState, me: PlayerId, at: number): Action | null
  export function runUntilIdle(engine: Engine, state: GameState, human: PlayerId, at: number): GameState
  ```
  `botAction` returns `null` when the seat has nothing to do. `runUntilIdle` drives every non-human seat until only the human owes an action, with a hard iteration cap so a policy bug cannot hang the caller.

- [ ] **Step 1: Write the failing test**

Create `packages/engine/src/fake/bots.test.ts`:

```ts
import type { GameConfig } from '../engine'
import { botAction, runUntilIdle } from './bots'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from './index'

const engine = createFakeEngine()

const config = (): GameConfig => ({
  gameId: 'g1',
  seed: 4242,
  players: [
    { id: 'p1', name: 'you' },
    { id: 'p2', name: 'kernel_panic' },
    { id: 'p3', name: 'segfault' },
  ],
  setup: { handLimit: 'base', releases: 'base', releaseCond: 'base', ai: 'base', gitBranch: 'base' },
  deck: FAKE_DECK,
  events: FAKE_EVENTS,
})

it('offers nothing to a seat with no outstanding action', () => {
  const s = engine.createGame(config())
  expect(botAction(engine, s, 'p2', 1000)).toBeNull()
})

it('only ever proposes an action the engine accepts', () => {
  let state = engine.createGame(config())
  for (let n = 0; n < 400 && !state.over; n += 1) {
    const seat = state.pending?.player ?? state.turn.player
    const action = botAction(engine, state, seat, 1000 + n * 100)
    if (!action) break
    const r = engine.reduce(state, action)
    expect(
      r.events.filter((e) => e.type === 'rejected'),
      `rejected ${JSON.stringify(action)}`,
    ).toEqual([])
    state = r.state
  }
})

it('drives the table back to the human without hanging', () => {
  const s = engine.createGame(config())
  const advanced = runUntilIdle(engine, { ...s, turn: { ...s.turn, player: 'p2' } }, 'p1', 1000)
  expect(advanced.turn.player === 'p1' || advanced.over !== null).toBe(true)
})

it('reaches a finished game when every seat is driven', () => {
  let state = engine.createGame(config())
  for (let n = 0; n < 2000 && !state.over; n += 1) {
    const seat = state.pending?.player ?? state.turn.player
    const action = botAction(engine, state, seat, 1000 + n * 100)
    if (!action) break
    state = engine.reduce(state, action).state
  }
  expect(state.over).not.toBeNull()
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @release/engine test src/fake/bots.test.ts`
Expected: FAIL — `Failed to resolve import "./bots"`.

- [ ] **Step 3: Write the implementation**

Create `packages/engine/src/fake/bots.ts`. `botAction` decides in this order, taking the first that applies:

1. `state.over` → `null`.
2. A `pending` owned by `me` → resolve it from the options the pending itself carries. `defend` takes the first option, or `null` when there are none. `discardForRelease` and `handLimit` take the first option. `neutralize503` and `crush` take the first method, passing the first filled release slot as `card` for `'sacrifice'`. `requestCard` names a card id the bot has seen in the discard. `giveCard` surrenders the first matching instance.
3. An open `window` where `me` may respond → attack with the first entry of `project(state, me).window.canAttackWith`, otherwise `PASS`. This is what makes the reaction window reachable in solo play.
4. `me` is the turn player → play the first entry of `project(state, me).self.playable`, choosing `legalTargets(...)[0]` when the card needs one; then `DRAW` when it has not happened; then `PUSH`.
5. Otherwise `null`.

Every branch reads its options from `project` or `legalTargets`, never from `GameState` directly — the bot is a consumer of the same contract the UI uses, which is what makes it a real test of that contract.

`runUntilIdle` loops `botAction` for the seat that currently owes an action, stopping when that seat is `human`, when `botAction` returns `null`, when the game ends, or after 500 iterations.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @release/engine test`
Expected: PASS — 4 bot tests plus every earlier suite.

The "only ever proposes an action the engine accepts" test is the valuable one: a rejection means the engine's advertised legality and its validation disagree, which is a contract bug rather than a bot bug.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/fake
git commit -m "feat(engine): opponent policy driving the fake to a finished game"
```

---

## Task 13: Rules invariants in the conformance suite, and the handoff README

**Files:**
- Modify: `packages/engine/src/conformance.ts` — the rules-invariant suite
- Create: `packages/engine/README.md`
- Test: the existing `packages/engine/src/fake/fake.test.ts` picks the new cases up unchanged

- [ ] **Step 1: Write the failing rules suite**

Add to `describeEngine` in `conformance.ts`, alongside the existing suites, a `describe('rules invariants')` block asserting — driven through `botAction` so it exercises real play rather than hand-built states:

```ts
    describe('rules invariants', () => {
      it('never holds two releases of one type in a zone', () => {
        const engine = make()
        let state = engine.createGame(configFor(options, 6161))
        for (let n = 0; n < 600 && !state.over; n += 1) {
          for (const id of state.seating) {
            const z = state.players[id].release
            for (const slot of ['frontend', 'backend', 'database'] as const) {
              const r = z[slot]
              if (r) expect(r.card.id.endsWith(slot), `${id} ${slot} holds ${r.card.id}`).toBe(true)
            }
          }
          const next = engine.reduce(state, fuzzAction(state, 6161, n)).state
          if (next === state) continue
          state = next
        }
      })

      it('never exceeds the release cap in a turn under Base', () => {
        const engine = make()
        let state = engine.createGame(configFor(options, 6262))
        for (let n = 0; n < 600; n += 1) {
          expect(state.turn.releasesPlayed).toBeLessThanOrEqual(1)
          state = engine.reduce(state, fuzzAction(state, 6262, n)).state
        }
      })

      it('enforces the hand limit at the end of a turn', () => {
        const engine = make()
        const setup = { ...BASE_SETUP, handLimit: 'memory' }
        let state = engine.createGame(configFor(options, 6363, setup))
        let previous = state.turn.index
        for (let n = 0; n < 800; n += 1) {
          state = engine.reduce(state, fuzzAction(state, 6363, n)).state
          // Checked only where a turn actually changed hands: mid-turn a hand may
          // legitimately sit over the limit until the discard prompt resolves.
          if (state.turn.index !== previous) {
            previous = state.turn.index
            for (const id of state.seating) {
              if (id === state.turn.player) continue
              expect(state.players[id].hand.length).toBeLessThanOrEqual(5)
            }
          }
        }
      })

      it('opens no reaction window for a Code Review-protected release', () => {
        const engine = make()
        let state = engine.createGame(configFor(options, 6464))
        for (let n = 0; n < 600; n += 1) {
          const w = state.window
          if (w) {
            const target = state.players[w.target.player].release[w.target.slot]
            expect(target?.codeReview, 'a protected release drew a window').toBeUndefined()
          }
          state = engine.reduce(state, fuzzAction(state, 6464, n)).state
        }
      })

      it('times the window at 15s on the first round and 10s after', () => {
        const engine = make()
        let state = engine.createGame(configFor(options, 6565))
        const seen = new Set<number>()
        for (let n = 0; n < 800; n += 1) {
          const r = engine.reduce(state, fuzzAction(state, 6565, n))
          for (const e of r.events) {
            if (e.type !== 'windowOpened') continue
            seen.add(e.round)
            expect(e.deadline - (1000 + n)).toBe(e.round === 1 ? 15_000 : 10_000)
          }
          state = r.state
        }
        expect(seen.size).toBeGreaterThan(0)
      })

      it('ends exactly once and then accepts nothing', () => {
        const engine = make()
        let state = engine.createGame(configFor(options, 6666))
        let overAt = -1
        for (let n = 0; n < 900; n += 1) {
          const r = engine.reduce(state, fuzzAction(state, 6666, n))
          if (r.state.over && overAt < 0) overAt = n
          if (overAt >= 0 && n > overAt) {
            expect(r.events.every((e) => e.type === 'rejected')).toBe(true)
            expect(r.state).toBe(state)
          }
          state = r.state
        }
      })
    })
```

`fuzzAction` and `BASE_SETUP` are already module-scope in `conformance.ts` from Task 6, and `configFor` already takes a `setup` override.

- [ ] **Step 2: Run to verify the new cases fail where the engine is wrong**

Run: `pnpm --filter @release/engine test`

Any failure here is an engine defect, not a test defect. Fix the implementation; do not relax the assertion.

- [ ] **Step 3: Write the handoff README**

Create `packages/engine/README.md` covering: the four contract functions and their guarantees; the three hard rules (purity, totality, projection privacy) with why each exists; how to run the conformance suite against a new implementation (`describeEngine('real', createRealEngine, { deck, events })`); the `` `${id}#${n}` `` uid convention, noting that nothing reads its internal structure — a `CardId` is always carried explicitly, never parsed back out; which cards the fake omits and why; and that quantities come from `GameConfig.deck` while `CARD_RULES` holds rules metadata only.

- [ ] **Step 4: Full verification**

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
```

All three must pass. `pnpm lint` runs Biome across the repo plus per-package Stylelint; the engine ships no CSS, so only Biome applies to it.

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "test(engine): rules invariants in conformance; docs: engine handoff README"
```

---

## Verification Checklist

- [ ] `packages/engine` has no runtime dependency on `@release/ui`, `@release/translation`, React, or `apps/frontend` — confirm with `grep -rn "@release/ui\|@release/translation\|from 'react'" packages/engine/src`, expecting no matches
- [ ] No `Math.random`, `Date.now`, `performance.now` or `new Date` anywhere under `packages/engine/src` — confirm with `grep -rn "Math.random\|Date.now\|performance.now\|new Date" packages/engine/src`
- [ ] `pnpm --filter @release/engine test` green, including the full conformance suite
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` green from the repo root
- [ ] `packages/engine/README.md` explains how the rules author runs `describeEngine` against their implementation
- [ ] `apps/ui/src/cards/catalogue.ts` is **unmodified** — retiring its three mock-logic functions belongs to the screen plan, and `apps/playground/stories/ComboStory/ComboStory.tsx` still imports them
- [ ] `apps/frontend/src/network/session/turn.ts` is **unmodified** — the network layer still owns it

## Follow-ups for the screen plan

- Retire `cardCanTarget`, `isComboSource` and `validComboTarget` from `apps/ui/src/cards/catalogue.ts` (and both index files), moving the three helpers into `ComboStory` as story-local mocks — it is their only consumer.
- Add the `@release/engine` alias to `apps/frontend/vite.config.ts`, `apps/frontend/vitest.config.ts`, `apps/playground/vite.config.ts` and both `tsconfig.json` path maps.
- `apps/frontend/src/entities/game/types.ts` becomes a re-export of the engine's types.
