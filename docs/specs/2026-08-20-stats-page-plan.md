# The stats page — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/board/:gameId/stats` show a real finished match — who won, what every seat did,
who leads each achievement, and where everyone went afterwards.

**Architecture:** The engine folds a per-player tally out of its own event log into `GameState`,
so every peer reads identical numbers and a keeper handover carries them for free; the projection
hands the tally over only once the match is over. Presence rides a new `WHEREABOUTS` message
shaped exactly like `PLAYER_READY`. The board stops being a route layout so the results screen can
own the viewport, and a pure mapper turns tally + seats + roster into the screen's `StatPlayer[]`.

**Tech Stack:** TypeScript, React 19, Vitest + @testing-library/react, pnpm workspaces, CSS
Modules. No new dependencies.

**Spec:** [`docs/specs/2026-08-20-stats-page-design.md`](./2026-08-20-stats-page-design.md)

**Branch:** `feat/19-stats-page` (already created off `origin/main`).

## Global Constraints

- **No string literals in `.tsx`.** All user-visible text goes through `t()`
  ([CLAUDE.md](../../CLAUDE.md#i18n-rule)).
- **A key must exist in both catalogs.** `packages/translation/src/locales/en/common.json` and
  `…/ru/common.json`. A key missing from one silently falls back. The typed-key augmentation reads
  the **en** catalog (`i18next.d.ts`), so en is what makes `t()` typecheck and ru is what stops it
  lying — there is no parity test to catch a miss.
- **`@release/web` never imports `react-i18next` directly** — only `@release/translation`.
- **`@release/ui` is i18n-agnostic** — copy arrives as props.
- **Code comments in English.** Existing Russian comments are legacy; do not add more.
- **No hardcoded colours.** Tokens from `apps/ui/src/design/tokens.css` via `var(--*)`.
- **Verify before claiming.** `pnpm lint`, `pnpm typecheck`, `pnpm test` must pass before a task
  is called done. Never report a step green without the output.
- **Commit per task**, message in this repo's voice: lowercase conventional prefix, a sentence that
  says what changed, `(#19)` suffix.

---

## File structure

| File | Responsibility |
|---|---|
| `packages/engine/src/tally.ts` | **new.** `PlayerTally`, `Tallies`, `emptyTally`, `seedTally`, `foldTally`. Pure over the event log. |
| `packages/engine/src/tally.test.ts` | **new.** The fold, metric by metric. |
| `packages/engine/src/state.ts` | `GameState.tally`. |
| `packages/engine/src/view.ts` | `PlayerView.tally`, null until the match ends. |
| `packages/engine/src/index.ts` | Export the new types. |
| `packages/engine/src/fake/setup.ts` | `createGame` seeds zeros. |
| `packages/engine/src/fake/reduce.ts` | One fold at the exit. |
| `packages/engine/src/fake/project.ts` | Project the tally only when `over`. |
| `packages/engine/src/fake/tally.test.ts` | **new.** The tally through real reductions. |
| `packages/engine/src/conformance.ts` | Tally cases every engine must satisfy. |
| `apps/frontend/src/network/types.ts` | `Where`, `PeerInfo.where`, `WHEREABOUTS`, `PEER_JOINED` payload. |
| `apps/frontend/src/network/lobby/host.ts` | `handleWhereabouts`; `where` on every `PeerInfo` built. |
| `apps/frontend/src/network/useLobby.ts` | `setWhere`, the host branch, per-match `gameId`, `leaveGame`. |
| `apps/ui/src/screens/Stats/Stats.tsx` | `onToLobby`. |
| `apps/ui/src/screens/Stats/Stats.test.tsx` | **new.** The screen's own contract. |
| `apps/frontend/src/pages/board/[gameId]/index.tsx` | **renamed from `_layout.tsx`.** The board as an index route. |
| `apps/frontend/src/entities/game/stats/toStatPlayers.ts` | **new.** tally + seats + roster → `StatPlayer[]`. |
| `apps/frontend/src/pages/board/[gameId]/stats.tsx` | The real results page. |
| `apps/frontend/src/app/FollowGameStart.tsx` | **new.** Render-null follower inside the session provider. |
| `packages/translation/src/locales/{en,ru}/common.json` | `stats.selfTag`. |

---

## Task 1: The tally fold

A pure module with no callers yet, so it can be got exactly right before anything depends on it.

**Files:**
- Create: `packages/engine/src/tally.ts`
- Test: `packages/engine/src/tally.test.ts`
- Modify: `packages/engine/src/index.ts`

**Interfaces:**
- Consumes: `Event` from `./events`, `PlayerId` from `./state`.
- Produces:
  - `interface PlayerTally { attack, defense, ddos, ai, err503, cherryPick, attackedInto: number }`
  - `type Tallies = Record<PlayerId, PlayerTally>`
  - `emptyTally(): PlayerTally`
  - `seedTally(seating: PlayerId[]): Tallies`
  - `foldTally(prev: Tallies, events: Event[]): Tallies`

- [ ] **Step 1: Write the failing test**

Create `packages/engine/src/tally.test.ts`:

```ts
import type { Event } from './events'
import { emptyTally, foldTally, seedTally } from './tally'

// Events carry an `id`; nothing in the fold reads it, so one counter keeps the
// fixtures short without pretending the ids mean anything.
let seq = 0
const ev = (e: Omit<Event, 'id'>): Event => ({ ...e, id: (seq += 1) } as Event)

const base = () => seedTally(['p1', 'p2'])

it('seeds every seat at zero', () => {
  expect(seedTally(['p1', 'p2'])).toEqual({ p1: emptyTally(), p2: emptyTally() })
})

it('counts an attack against its attacker, whatever it was thrown at', () => {
  const out = foldTally(base(), [
    ev({ type: 'attacked', attacker: 'p1', card: 'attack-bug', sudo: false, target: 'p2' }),
    ev({ type: 'attacked', attacker: 'p1', card: 'attack-ddos', sudo: false, target: 'p2' }),
  ])
  expect(out.p1.attack).toBe(2)
  expect(out.p2.attack).toBe(0)
})

it('counts DDoS as both an attack and a DDoS', () => {
  const out = foldTally(base(), [
    ev({ type: 'attacked', attacker: 'p1', card: 'attack-ddos', sudo: false, target: 'p2' }),
  ])
  expect(out.p1).toMatchObject({ attack: 1, ddos: 1 })
})

it('counts a defence against the defender', () => {
  const out = foldTally(base(), [
    ev({ type: 'defended', player: 'p2', card: 'defense-hotfix', effect: 'cancel' }),
  ])
  expect(out.p2.defense).toBe(1)
})

it('counts an AI reveal against the seat that drew it', () => {
  const out = foldTally(base(), [
    ev({ type: 'aiRevealed', player: 'p1', aiCard: 'ai-inside', eventCard: 'ai-inside' }),
  ])
  expect(out.p1.ai).toBe(1)
})

it('counts only the Error 503 trigger, not the AI card of the same name', () => {
  const out = foldTally(base(), [
    ev({ type: 'revealed', player: 'p1', card: 'trigger-error-503' }),
    ev({ type: 'revealed', player: 'p1', card: 'ai-error-503' }),
  ])
  expect(out.p1.err503).toBe(1)
})

it('counts a cherry-pick once per play, not once per card pulled', () => {
  // One Git Cherry-pick emits two events: the card taken to hand (public) and
  // the card slid onto the deck (private to the player). Counting both would
  // double every pull, and counting the private one would make the number
  // unverifiable from any other peer's log.
  const out = foldTally(base(), [
    ev({ type: 'takenFromDiscard', player: 'p1', card: 'attack-bug', to: 'hand' }),
    ev({ type: 'takenFromDiscard', player: 'p1', card: 'defense-hotfix', to: 'deck' }),
  ])
  expect(out.p1.cherryPick).toBe(1)
})

it('counts a landed attack against the seat that took it', () => {
  const out = foldTally(base(), [ev({ type: 'tookHit', player: 'p2' })])
  expect(out.p2.attackedInto).toBe(1)
})

it('ignores events no metric asks about', () => {
  const before = base()
  const out = foldTally(before, [
    ev({ type: 'passed', player: 'p1' }),
    ev({ type: 'turnEnded', player: 'p1' }),
  ])
  expect(out).toBe(before)
})

it('does not mutate the tally it was handed', () => {
  const before = base()
  const snapshot = structuredClone(before)
  foldTally(before, [
    ev({ type: 'attacked', attacker: 'p1', card: 'attack-bug', sudo: false, target: 'p2' }),
  ])
  expect(before).toEqual(snapshot)
})

it('accumulates across successive folds', () => {
  const one = foldTally(base(), [ev({ type: 'tookHit', player: 'p2' })])
  const two = foldTally(one, [ev({ type: 'tookHit', player: 'p2' })])
  expect(two.p2.attackedInto).toBe(2)
})

it('counts a seat the seed never named', () => {
  // Defensive rather than reachable: seating is fixed at createGame. If a future
  // engine ever emits for an unseeded id, the fold must not throw on undefined.
  const out = foldTally({}, [ev({ type: 'tookHit', player: 'p9' })])
  expect(out.p9.attackedInto).toBe(1)
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @release/engine test -- tally.test.ts
```

Expected: FAIL — `Failed to resolve import "./tally"`.

- [ ] **Step 3: Write the implementation**

Create `packages/engine/src/tally.ts`:

```ts
import type { Event } from './events'
import type { PlayerId } from './state'

// What the results screen counts, per seat. Every field is a plain occurrence
// count over the event log — see foldTally for the event each one reads.
export interface PlayerTally {
  attack: number
  defense: number
  ddos: number
  ai: number
  err503: number
  cherryPick: number
  attackedInto: number
}

export type Tallies = Record<PlayerId, PlayerTally>

export const emptyTally = (): PlayerTally => ({
  attack: 0,
  defense: 0,
  ddos: 0,
  ai: 0,
  err503: 0,
  cherryPick: 0,
  attackedInto: 0,
})

export function seedTally(seating: PlayerId[]): Tallies {
  const out: Tallies = {}
  for (const id of seating) out[id] = emptyTally()
  return out
}

// The whole tally, in one place, reading nothing but the log. Counting inside
// the rules code instead would scatter seven counters across five modules, and
// every future rules change would be a chance for one of them to quietly stop
// counting. Here the rule is single and checkable: if the event was emitted, it
// was counted.
//
// Three of the seven are defaults over copy that does not pin an event — see
// "Open questions" in the design. Each is one line to change.
export function foldTally(prev: Tallies, events: Event[]): Tallies {
  const next: Tallies = { ...prev }
  let counted = false

  const bump = (player: PlayerId, key: keyof PlayerTally) => {
    counted = true
    const current = next[player] ?? emptyTally()
    next[player] = { ...current, [key]: current[key] + 1 }
  }

  for (const e of events) {
    switch (e.type) {
      // Release attacks and hand attacks emit the same event (fake/handAttacks.ts),
      // so both scopes count with no special case. `requested` is the
      // request-a-card mechanic, not an attack card, and is not counted.
      case 'attacked':
        bump(e.attacker, 'attack')
        if (e.card === 'attack-ddos') bump(e.attacker, 'ddos')
        break
      case 'defended':
        bump(e.player, 'defense')
        break
      case 'aiRevealed':
        bump(e.player, 'ai')
        break
      // `revealed` also fires for the AI card ai-error-503 off the events deck
      // (fake/triggers.ts). Default: the draw-deck trigger only.
      case 'revealed':
        if (e.card === 'trigger-error-503') bump(e.player, 'err503')
        break
      // Default: times played, not cards pulled. The `to: 'deck'` half of a
      // cherry-pick is visibleTo the player alone, so counting it would put a
      // number on the screen no other peer could ever verify.
      case 'takenFromDiscard':
        if (e.to === 'hand') bump(e.player, 'cherryPick')
        break
      // Default: attacks that landed, not attacks aimed.
      case 'tookHit':
        bump(e.player, 'attackedInto')
        break
      default:
        break
    }
  }

  // Identity is preserved when nothing counted, so a reduction that touched no
  // metric leaves `state.tally` the very object it was handed.
  return counted ? next : prev
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @release/engine test -- tally.test.ts
```

Expected: PASS, 11 tests.

- [ ] **Step 5: Export from the barrel**

In `packages/engine/src/index.ts`, add after the `./state` type export block:

```ts
export { emptyTally, foldTally, seedTally } from './tally'
export type { PlayerTally, Tallies } from './tally'
```

- [ ] **Step 6: Typecheck and lint**

```bash
pnpm typecheck && pnpm lint
```

Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/tally.ts packages/engine/src/tally.test.ts packages/engine/src/index.ts
git commit -m "feat(engine): the results screen's seven counters, folded from the event log (#19)"
```

---

## Task 2: The tally in the state, and in the projection

**Files:**
- Modify: `packages/engine/src/state.ts` (`GameState`)
- Modify: `packages/engine/src/view.ts` (`PlayerView`)
- Modify: `packages/engine/src/fake/setup.ts` (`createGame`'s return)
- Modify: `packages/engine/src/fake/reduce.ts` (`reduce`'s exit, ~line 315-319)
- Modify: `packages/engine/src/fake/project.ts` (`project`'s return, ~line 136)
- Test: `packages/engine/src/fake/tally.test.ts` (create)

**Interfaces:**
- Consumes: `seedTally`, `foldTally`, `PlayerTally`, `Tallies` from Task 1.
- Produces: `GameState.tally: Tallies`; `PlayerView.tally: Record<PlayerId, PlayerTally> | null`,
  non-null exactly when `PlayerView.over` is non-null.

- [ ] **Step 1: Write the failing test**

Create `packages/engine/src/fake/tally.test.ts`:

```ts
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from './index'

const config = (seed: number) => ({
  gameId: 'tally',
  seed,
  players: [
    { id: 'p1', name: 'one' },
    { id: 'p2', name: 'two' },
    { id: 'p3', name: 'three' },
  ],
  setup: { handLimit: 'base', releases: 'base', releaseCond: 'base', ai: 'base', gitBranch: 'base' },
  deck: FAKE_DECK,
  events: FAKE_EVENTS,
})

it('starts every seat at zero', () => {
  const state = createFakeEngine().createGame(config(4242))
  expect(Object.keys(state.tally).sort()).toEqual(['p1', 'p2', 'p3'])
  for (const id of state.seating) {
    expect(state.tally[id]).toEqual({
      attack: 0, defense: 0, ddos: 0, ai: 0, err503: 0, cherryPick: 0, attackedInto: 0,
    })
  }
})

it('leaves the tally alone when an action is rejected', () => {
  const engine = createFakeEngine()
  const state = engine.createGame(config(4242))
  // p2 is not on turn, so this is rejected and the identical state comes back.
  const after = engine.reduce(state, { type: 'DRAW', player: 'p2', at: 1000 })
  expect(after.state.tally).toBe(state.tally)
})

it('withholds the tally from the projection until the match ends', () => {
  const engine = createFakeEngine()
  const state = engine.createGame(config(4242))
  expect(state.over).toBeNull()
  expect(engine.project(state, 'p1').tally).toBeNull()
})

it('hands over every seat's tally once the match ends', () => {
  const engine = createFakeEngine()
  // A hand-built ending: `over` is what gates the projection, so set it rather
  // than fuzzing thousands of steps to reach a natural win.
  const state = { ...engine.createGame(config(4242)), over: { winner: 'p1' as const, condition: 'release' as const } }
  const view = engine.project(state, 'p1')
  expect(view.tally).not.toBeNull()
  expect(Object.keys(view.tally ?? {}).sort()).toEqual(['p1', 'p2', 'p3'])
})

it('does not hand the caller the state's own tally objects', () => {
  const engine = createFakeEngine()
  const state = { ...engine.createGame(config(4242)), over: { winner: 'p1' as const, condition: 'release' as const } }
  const view = engine.project(state, 'p1')
  expect(view.tally?.p1).not.toBe(state.tally.p1)
  expect(view.tally?.p1).toEqual(state.tally.p1)
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @release/engine test -- fake/tally.test.ts
```

Expected: FAIL — `Property 'tally' does not exist on type 'GameState'`.

- [ ] **Step 3: Add `tally` to `GameState`**

In `packages/engine/src/state.ts`, add the import at the top:

```ts
import type { Tallies } from './tally'
```

and inside `interface GameState`, immediately before `over`:

```ts
  // Per-seat counters for the results screen, folded from this game's own event
  // log (tally.ts). It lives in GameState rather than beside the keeper for two
  // reasons: every peer then reads one authority's numbers instead of counting a
  // log that visibleTo made different for each of them, and a keeper handover
  // carries it for free because KEEPER_STATE carries GameState.
  tally: Tallies
```

- [ ] **Step 4: Seed it in `createGame`**

In `packages/engine/src/fake/setup.ts`, add to the imports:

```ts
import { seedTally } from '../tally'
```

and in the returned object, immediately before `over: null`:

```ts
    tally: seedTally(seating),
```

- [ ] **Step 5: Fold it in `reduce`**

In `packages/engine/src/fake/reduce.ts`, add to the imports:

```ts
import { foldTally } from '../tally'
```

and replace the last two lines of `reduce` (currently lines 315-318):

```ts
  // A rejected action hands back the identical state object, and must keep
  // doing so — the clock only moves on a commit.
  if (result.state === state) return result
  return { state: stampTurnClock(result.state, at), events: result.events }
```

with:

```ts
  // A rejected action hands back the identical state object, and must keep
  // doing so — the clock only moves on a commit. It also emits nothing worth
  // counting, so the fold sits below this guard rather than above it.
  if (result.state === state) return result
  const stamped = stampTurnClock(result.state, at)
  return {
    state: { ...stamped, tally: foldTally(stamped.tally, result.events) },
    events: result.events,
  }
```

- [ ] **Step 6: Project it**

In `packages/engine/src/fake/project.ts`, add to the imports:

```ts
import { emptyTally, type PlayerTally } from '../tally'
```

Add this helper just above `export function project`:

```ts
// The results are for the results screen. `cherryPick` counts a pull whose
// second card is deliberately private (fake/discard.ts), so a live counter
// would leak mid-match exactly what visibleTo was written to hide. Keyed by
// seating so the map is complete and ordered however the table is seated, and
// copied so a viewer cannot reach back into GameState through it.
function tallyView(state: GameState): Record<PlayerId, PlayerTally> | null {
  if (!state.over) return null
  const out: Record<PlayerId, PlayerTally> = {}
  for (const id of state.seating) out[id] = { ...(state.tally[id] ?? emptyTally()) }
  return out
}
```

and add to `project`'s returned object, immediately before or after `over`:

```ts
    tally: tallyView(state),
```

- [ ] **Step 7: Add `tally` to `PlayerView`**

In `packages/engine/src/view.ts`, add the import:

```ts
import type { PlayerTally } from './tally'
```

and inside `interface PlayerView`, beside `over`:

```ts
  // Per-seat results, non-null exactly when `over` is — the two are driven by
  // one condition in project(), so a consumer that has one has the other.
  tally: Record<PlayerId, PlayerTally> | null
```

- [ ] **Step 8: Run the engine suite**

```bash
pnpm --filter @release/engine test
```

Expected: PASS, including the five new tests. Existing determinism tests
(`expect(a.state).toEqual(b.state)`) still hold — the fold is pure and ordered.

- [ ] **Step 9: Typecheck the workspace**

```bash
pnpm typecheck
```

Expected: clean. `PlayerView.tally` is new and required, so any frontend code building a
`PlayerView` by hand will fail here — fix those fixtures by adding `tally: null`.

- [ ] **Step 10: Commit**

```bash
git add packages/engine/src apps/frontend/src
git commit -m "feat(engine): the tally rides GameState, and reaches the projection only when the match is over (#19)"
```

---

## Task 3: Conformance — any engine must agree

**Files:**
- Modify: `packages/engine/src/conformance.ts`

**Interfaces:**
- Consumes: `PlayerView.tally`, `GameState.tally` from Task 2; the file's existing `drive`,
  `fuzzAction`, `configFor`, `atFor` helpers.
- Produces: nothing new — cases inside `describeEngine`.

- [ ] **Step 1: Write the failing cases**

In `packages/engine/src/conformance.ts`, add this `describe` block inside `describeEngine`'s
outer `describe`, after the `determinism` block:

```ts
    describe('tally', () => {
      it('seeds a counter for every seat, all at zero', () => {
        const engine = make()
        const state = engine.createGame(configFor(options, 4242))
        expect(Object.keys(state.tally).sort()).toEqual([...state.seating].sort())
        for (const id of state.seating) {
          expect(Object.values(state.tally[id]).every((n) => n === 0)).toBe(true)
        }
      })

      it('never lets a counter go backwards', () => {
        // The one invariant that holds for every metric under every rules
        // change: these are occurrence counts, so a reduction may add to them
        // and may leave them alone, but may never subtract.
        const engine = make()
        let state = engine.createGame(configFor(options, 4242))
        for (let n = 0; n < 400; n += 1) {
          const r = engine.reduce(state, fuzzAction(state, 5, n))
          for (const id of state.seating) {
            const before = state.tally[id]
            const after = r.state.tally[id]
            for (const key of Object.keys(before) as (keyof typeof before)[]) {
              expect(after[key]).toBeGreaterThanOrEqual(before[key])
            }
          }
          state = r.state
        }
      })

      it('counts every attack that was logged, and no others', () => {
        // The tally is a fold over the log, so the log is what it must agree
        // with. `attacked` is public and never redacted, which makes it the one
        // metric a conformance suite can recount from the outside.
        const engine = make()
        let state = engine.createGame(configFor(options, 4242))
        const thrown: Record<string, number> = {}
        for (let n = 0; n < 400; n += 1) {
          const r = engine.reduce(state, fuzzAction(state, 5, n))
          for (const e of r.events) {
            if (e.type === 'attacked') thrown[e.attacker] = (thrown[e.attacker] ?? 0) + 1
          }
          state = r.state
        }
        for (const id of state.seating) {
          expect(state.tally[id].attack).toBe(thrown[id] ?? 0)
        }
        // Otherwise the assertion above is vacuous: nobody ever attacked.
        expect(Object.keys(thrown).length).toBeGreaterThan(0)
      })

      it('shows the tally to a viewer only once the match is over', () => {
        const engine = make()
        let state = engine.createGame(configFor(options, 3))
        let sawOpen = false
        for (let n = 0; n < 2200; n += 1) {
          const view = engine.project(state, state.seating[0])
          if (state.over) {
            expect(view.tally).not.toBeNull()
            expect(Object.keys(view.tally ?? {}).sort()).toEqual([...state.seating].sort())
          } else {
            expect(view.tally).toBeNull()
            sawOpen = true
          }
          state = engine.reduce(state, fuzzAction(state, 3, n)).state
        }
        expect(sawOpen).toBe(true)
        // Seed 3 reaches gameOver around step 1821 (see 'ends exactly once'),
        // so the non-null half above is genuinely exercised.
        expect(state.over).not.toBeNull()
      })
    })
```

- [ ] **Step 2: Run the conformance suite**

```bash
pnpm --filter @release/engine test -- fake.test.ts
```

Expected: PASS. (`fake.test.ts` is what calls `describeEngine`.) If the fuzz seeds no longer reach
the states the comments claim, adjust the seed and update the comment to say which seed and why —
never delete the "otherwise this is vacuous" guards.

- [ ] **Step 3: Commit**

```bash
git add packages/engine/src/conformance.ts
git commit -m "test(engine): conformance pins the tally — monotonic, complete, and hidden until the end (#19)"
```

---

## Task 4: `WHEREABOUTS` on the wire

**Files:**
- Modify: `apps/frontend/src/network/types.ts`
- Modify: `apps/frontend/src/network/lobby/host.ts`
- Modify: `apps/frontend/src/network/useLobby.ts`
- Test: `apps/frontend/src/network/lobby/host.test.ts`
- Test: `apps/frontend/src/network/useLobby.test.ts`

**Interfaces:**
- Consumes: `LobbyState`, `applyPeerJoined` from `./lobby/state`.
- Produces:
  - `type Where = 'game' | 'stats' | 'lobby'` (exported from `~/network/types`, re-exported by
    `~/network`)
  - `PeerInfo.where: Where` — **required**, so the compiler enumerates every construction site
  - `Message` member `{ type: 'WHEREABOUTS'; payload: { where: Where } }`
  - `handleWhereabouts(state: LobbyState, fromId: string, where: Where): Result`
  - `UseLobby.setWhere(where: Where): void`

- [ ] **Step 1: Write the failing tests**

In `apps/frontend/src/network/lobby/host.test.ts`, append:

```ts
it('records where a peer went and tells the table', () => {
  const state = createLobbyState({
    selfId: 'host',
    hostId: 'host',
    maxPlayers: 4,
    peers: [
      { id: 'host', name: 'Ann', role: 'host', ready: true, where: 'lobby' },
      { id: 'g1', name: 'Bo', role: 'player', ready: false, where: 'lobby' },
    ],
  })

  const r = handleWhereabouts(state, 'g1', 'stats')

  expect(r.state.peers.g1.where).toBe('stats')
  expect(r.outgoing).toEqual([
    {
      to: 'broadcast',
      message: {
        type: 'PEER_JOINED',
        payload: { id: 'g1', name: 'Bo', role: 'player', ready: false, where: 'stats' },
      },
    },
  ])
})

it('says nothing when a peer re-announces where it already is', () => {
  // Every screen announces on mount, and React mounts more than once in
  // StrictMode. Without this guard a remount is a table-wide broadcast.
  const state = createLobbyState({
    selfId: 'host',
    hostId: 'host',
    maxPlayers: 4,
    peers: [{ id: 'g1', name: 'Bo', role: 'player', ready: false, where: 'stats' }],
  })

  const r = handleWhereabouts(state, 'g1', 'stats')

  expect(r.state).toBe(state)
  expect(r.outgoing).toEqual([])
})

it('ignores a whereabouts from someone not in the room', () => {
  const state = createLobbyState({
    selfId: 'host',
    hostId: 'host',
    maxPlayers: 4,
    peers: [{ id: 'g1', name: 'Bo', role: 'player', ready: false, where: 'lobby' }],
  })

  const r = handleWhereabouts(state, 'stranger', 'game')

  expect(r.state).toBe(state)
  expect(r.outgoing).toEqual([])
})

it('seats a joiner in the lobby, since that is the only place to join from', () => {
  const state = createLobbyState({
    selfId: 'host',
    hostId: 'host',
    maxPlayers: 4,
    peers: [{ id: 'host', name: 'Ann', role: 'host', ready: true, where: 'lobby' }],
  })

  const r = handleJoinRequest(state, 'g1', 'Bo')

  expect(r.state.peers.g1.where).toBe('lobby')
})
```

Add `handleWhereabouts` to the file's existing import from `./host`.

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @release/web test -- lobby/host.test.ts
```

Expected: FAIL — `handleWhereabouts` is not exported, plus type errors on `where`.

- [ ] **Step 3: Add the type and the message**

In `apps/frontend/src/network/types.ts`, above `PeerInfo`:

```ts
// Which screen a peer is on. There is no 'offline' member on purpose: nobody
// announces their own disconnection. A peer that has gone is simply absent from
// LobbyState.peers, and the results screen reads that absence.
export type Where = 'game' | 'stats' | 'lobby'
```

and add the field to `PeerInfo`:

```ts
export interface PeerInfo {
  id: string
  name: string
  role: Role
  ready: boolean
  where: Where
}
```

Required rather than optional: the field decides what the results table prints about a person, and
an optional one would let a construction site forget it and quietly print the wrong place.

In the `Message` union, beside `PLAYER_READY`:

```ts
  // A peer announcing which screen it is on, so the results table can say where
  // everyone went. Addressed to the host, which applies it and re-broadcasts the
  // updated PeerInfo — exactly the path PLAYER_READY takes.
  | { type: 'WHEREABOUTS'; payload: { where: Where } }
```

and grow `PEER_JOINED`'s payload:

```ts
  | { type: 'PEER_JOINED'; payload: { id: string; name: string; role: Role; ready: boolean; where: Where } }
```

- [ ] **Step 4: Implement `handleWhereabouts` and fix the construction sites**

In `apps/frontend/src/network/lobby/host.ts`, import `Where` from `../types`, then:

```ts
// The presence half of the roster, shaped exactly like handleReady: the host is
// the only authority for who is where, so a guest's announcement arrives here
// and leaves as the host's own broadcast.
export function handleWhereabouts(state: LobbyState, fromId: string, where: Where): Result {
  const existing = state.peers[fromId]
  if (!existing) return { state, outgoing: [] }
  // Every screen announces on mount, so a remount would otherwise cost the
  // whole table a broadcast that changed nothing.
  if (existing.where === where) return { state, outgoing: [] }
  const updated: PeerInfo = { ...existing, where }
  return {
    state: applyPeerJoined(state, updated),
    outgoing: [
      {
        to: 'broadcast',
        message: {
          type: 'PEER_JOINED',
          payload: {
            id: updated.id,
            name: updated.name,
            role: updated.role,
            ready: updated.ready,
            where: updated.where,
          },
        },
      },
    ],
  }
}
```

In the same file, `handleJoinRequest` builds a `PeerInfo` at line ~27 and a `PEER_JOINED` payload
at line ~48 — add `where: 'lobby'` to both. `handleReady`'s payload at line ~68 gains
`where: updated.where`.

- [ ] **Step 5: Run the host tests**

```bash
pnpm --filter @release/web test -- lobby/host.test.ts
```

Expected: PASS.

- [ ] **Step 6: Wire `setWhere` into `useLobby`**

In `apps/frontend/src/network/useLobby.ts`:

Import `handleWhereabouts` alongside the existing `handleReady` import, and `Where` from `./types`.

The two local `PeerInfo` constructions (line ~344 `role: 'host'`, line ~414 `role: 'guest'`) each
gain `where: 'lobby'`.

In `onMessage`'s host branch, beside the `PLAYER_READY` arm:

```ts
        } else if (msg.type === 'WHEREABOUTS') {
          const r = handleWhereabouts(current, msg.from, msg.payload.where)
          commit(r.state)
          dispatch(r.outgoing)
```

Add the callback beside `ready`:

```ts
  // Where this peer now is. The host applies its own move locally; a guest sends
  // it and learns the result from the broadcast that comes back — the same split
  // `ready` makes, for the same reason: only the host's roster is authoritative.
  const setWhere = useCallback(
    (where: Where) => {
      const t = transportRef.current
      const current = stateRef.current
      if (!t || !current) return
      if (isHostRef.current) {
        const r = handleWhereabouts(current, current.selfId, where)
        commit(r.state)
        dispatch(r.outgoing)
      } else {
        t.send(current.hostId, { type: 'WHEREABOUTS', payload: { where } })
      }
    },
    [commit, dispatch],
  )
```

Add `setWhere(where: Where): void` to the `UseLobby` interface (beside `ready(): void`), and
`setWhere` to the returned object.

Re-export `Where` from `apps/frontend/src/network/index.ts` alongside `PeerInfo`.

- [ ] **Step 7: Add the useLobby tests**

In `apps/frontend/src/network/useLobby.test.ts`, append:

```ts
it('a guest sends its whereabouts to the host', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await result.current.joinRoom('F96-NMT', 'Dimbo')
  })
  const hostId = result.current.state?.hostId ?? ''

  act(() => {
    result.current.setWhere('stats')
  })

  expect(sentTo(hostId)).toContainEqual({ type: 'WHEREABOUTS', payload: { where: 'stats' } })
})

it('a host applies its own whereabouts without sending anything to itself', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await result.current.createRoom('Dimbo', 6)
  })
  const selfId = result.current.state?.selfId ?? ''

  act(() => {
    result.current.setWhere('game')
  })

  expect(result.current.state?.peers[selfId].where).toBe('game')
  expect(sentAll()).not.toContainEqual(
    expect.objectContaining({ type: 'WHEREABOUTS' }),
  )
})
```

These follow the file's own pattern — `renderHook(() => useLobby())` then an awaited
`createRoom` / `joinRoom` inside `act` — and reuse its existing `sentTo` / `sentAll` helpers
(lines ~256-270). Do not add new setup helpers. Every existing `PeerInfo` literal in this file
needs `where: 'lobby'` added.

- [ ] **Step 8: Fix every other PeerInfo literal the compiler names**

```bash
pnpm typecheck
```

`where` is required, so TypeScript lists every site. Expect these files:
`apps/frontend/src/network/lobby/state.test.ts`,
`apps/frontend/src/pages/board/[gameId]/__tests__/board.test.tsx`,
`apps/frontend/src/pages/lobby/__tests__/lobby.test.tsx`,
`apps/frontend/src/pages/lobby/__tests__/inviteScreen.test.tsx`,
`apps/frontend/src/pages/__tests__/start.test.tsx`,
`apps/frontend/src/entities/game/seats.test.ts`.
Add `where: 'lobby'` to each — these are fixtures for peers sitting in a lobby.

- [ ] **Step 9: Full verification**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: all clean.

- [ ] **Step 10: Commit**

```bash
git add apps/frontend/src
git commit -m "feat(web): a peer says which screen it is on, and the host tells the table (#19)"
```

---

## Task 5: Every match gets its own id

Discovered while planning: `startGame` sets `const id = current.hostId`, so a rematch reuses the
id. Nothing downstream can tell match 2 from match 1 — the follower never re-fires, and
`useGame`'s "a new game must not inherit the last one's feed" reset cannot trigger.

**Files:**
- Modify: `apps/frontend/src/network/useLobby.ts`
- Test: `apps/frontend/src/network/useLobby.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `session.gameId` is `` `${hostId}-${n}` `` with `n` counting from 1 per session. Still
  an opaque string to every consumer; nothing parses it.

- [ ] **Step 1: Write the failing test**

In `apps/frontend/src/network/useLobby.test.ts`, append:

```ts
it('gives each match its own id, so a second one is distinguishable from the first', async () => {
  // hostWithGuest() rather than a bare createRoom: startGame needs a seated
  // table, and this is the file's own helper for one (line ~278).
  const { result } = await hostWithGuest()
  const hostId = result.current.state?.hostId ?? ''

  act(() => {
    result.current.startGame()
  })
  const first = result.current.gameId

  act(() => {
    result.current.startGame()
  })
  const second = result.current.gameId

  expect(first).toBe(`${hostId}-1`)
  expect(second).toBe(`${hostId}-2`)
  // The whole point: a consumer keying a reset on gameId — the follower, the
  // move-history feed, the deal intro — sees a rematch as a different game.
  expect(first).not.toBe(second)
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter @release/web test -- useLobby.test.ts
```

Expected: FAIL — both ids are `hostId`.

- [ ] **Step 3: Mint the id**

In `apps/frontend/src/network/useLobby.ts`, beside the other refs (~line 128):

```ts
  // Counts matches within one session. The room's identity is the host's peer
  // id and never changes, but a match's must: every reset downstream keys on
  // gameId — the follower's navigation, useGame's event feed, the deal intro —
  // and a rematch that reused the id would silently be taken for the same game.
  const matchSeqRef = useRef(0)
```

In `startGame`, replace `const id = current.hostId` with:

```ts
    matchSeqRef.current += 1
    const id = `${current.hostId}-${matchSeqRef.current}`
```

- [ ] **Step 4: Update the existing expectation**

`useLobby.test.ts` line ~179 (`host startGame broadcasts GAME_STARTING and records the game id`)
asserts `payload: { gameId: hostId }` and `result.current.gameId` is `hostId`. Both become
`` `${hostId}-1` ``. Line ~320 reads `result.current.gameId` and needs no change.

- [ ] **Step 5: Run the frontend suite**

```bash
pnpm --filter @release/web test
```

Expected: PASS. `useStartGame.test.ts` needs no change — it mocks the session directly and never
goes through `startGame`.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/network
git commit -m "fix(web): a rematch is its own match, with its own id (#19)"
```

---

## Task 6: The board becomes an index route

Today `_layout.tsx` **is** the board and `stats.tsx` renders inside its `<Outlet />`, below a table
that is `block-size: 100dvh` — so the results screen paints a full viewport below the fold.

**Files:**
- Rename: `apps/frontend/src/pages/board/[gameId]/_layout.tsx` → `index.tsx`
- Rename: `apps/frontend/src/pages/board/[gameId]/_layout.module.css` → `index.module.css`
- Modify: `apps/frontend/src/app/router.ts` (generouted output — regenerates on dev/build)

**Interfaces:**
- Consumes: nothing new.
- Produces: `/board/:gameId` renders the board; `/board/:gameId/stats` renders only the stats page.
  `Path` in `router.ts` gains `` `/board/:gameId` ``.

- [ ] **Step 1: Rename both files, preserving history**

```bash
git mv "apps/frontend/src/pages/board/[gameId]/_layout.tsx" "apps/frontend/src/pages/board/[gameId]/index.tsx"
git mv "apps/frontend/src/pages/board/[gameId]/_layout.module.css" "apps/frontend/src/pages/board/[gameId]/index.module.css"
```

- [ ] **Step 2: Drop the Outlet and fix the style import**

In the renamed `index.tsx`:
- change `import styles from './_layout.module.css'` to `import styles from './index.module.css'`
- remove `Outlet` from the `react-router` import
- delete the `<Outlet />` line from the JSX — the board no longer wraps anything

- [ ] **Step 3: Regenerate the router and check the route tree**

```bash
pnpm --filter @release/web build
```

Expected: build succeeds, and `apps/frontend/src/app/router.ts` now lists both
`` `/board/:gameId` `` and `` `/board/:gameId/stats` `` in `Path`, with `Params` carrying
`'/board/:gameId': { gameId: string }`. Commit the regenerated file.

- [ ] **Step 4: Run the board suites**

```bash
pnpm --filter @release/web test -- board
```

Expected: PASS. The suites import `../_Board` and the page module directly; update any import of
`../_layout` to `../index`.

- [ ] **Step 5: Full verification**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src
git commit -m "refactor(web): the board is a route, not a layout, so results can own the screen (#19)"
```

---

## Task 7: `toStatPlayers`

**Files:**
- Create: `apps/frontend/src/entities/game/stats/toStatPlayers.ts`
- Create: `apps/frontend/src/entities/game/stats/index.ts`
- Test: `apps/frontend/src/entities/game/stats/toStatPlayers.test.ts`

**Interfaces:**
- Consumes: `PlayerTally` (Task 1), `Seat`/`seatsFor` from `~/entities/game/seats`, `PeerInfo` and
  `Where` (Task 4), `StatPlayer` from `@release/ui`.
- Produces:

```ts
export function toStatPlayers(args: {
  tally: Record<PlayerId, PlayerTally>
  seats: Seat[]
  peers: Record<string, PeerInfo>
}): StatPlayer[]
```

  Rows are in seating order, `id` is the **peer** id, and a seat whose peer has left keeps its row
  with `location: 'offline'`.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/entities/game/stats/toStatPlayers.test.ts`:

```ts
import type { PlayerTally } from '@release/engine'
import type { PeerInfo } from '~/network'
import { toStatPlayers } from './toStatPlayers'

const tally = (over: Partial<PlayerTally> = {}): PlayerTally => ({
  attack: 0, defense: 0, ddos: 0, ai: 0, err503: 0, cherryPick: 0, attackedInto: 0, ...over,
})

const seats = [
  { playerId: 'p1', peerId: 'peer-a', name: 'Ann' },
  { playerId: 'p2', peerId: 'peer-b', name: 'Bo' },
]

const peers: Record<string, PeerInfo> = {
  'peer-a': { id: 'peer-a', name: 'Ann', role: 'host', ready: true, where: 'stats' },
  'peer-b': { id: 'peer-b', name: 'Bo', role: 'player', ready: true, where: 'lobby' },
}

it('rows are keyed by peer id, never by the engine's seat id', () => {
  // PlayerId and peer id are both `string`, which is exactly what hides a
  // mix-up. The screen resolves winnerId and selfId against peer ids, so a row
  // carrying 'p1' would silently match nobody.
  const rows = toStatPlayers({ tally: { p1: tally(), p2: tally() }, seats, peers })
  expect(rows.map((r) => r.id)).toEqual(['peer-a', 'peer-b'])
})

it('carries each seat's counters onto its row', () => {
  const rows = toStatPlayers({
    tally: { p1: tally({ attack: 5, ddos: 2, attackedInto: 4 }), p2: tally({ defense: 3 }) },
    seats,
    peers,
  })
  expect(rows[0]).toMatchObject({ attack: 5, ddos: 2, attackedInto: 4 })
  expect(rows[1]).toMatchObject({ defense: 3 })
})

it('reads each player's location from the roster', () => {
  const rows = toStatPlayers({ tally: { p1: tally(), p2: tally() }, seats, peers })
  expect(rows.map((r) => r.location)).toEqual(['stats', 'lobby'])
})

it('keeps the row of a player who left, and calls them offline', () => {
  // They played the match. Dropping the row would rewrite its history to
  // exclude someone who was there.
  const rows = toStatPlayers({
    tally: { p1: tally(), p2: tally({ attack: 9 }) },
    seats,
    peers: { 'peer-a': peers['peer-a'] },
  })
  expect(rows).toHaveLength(2)
  expect(rows[1]).toMatchObject({ id: 'peer-b', name: 'Bo', location: 'offline', attack: 9 })
})

it('names a departed player from the seat, since the roster no longer can', () => {
  const rows = toStatPlayers({ tally: { p1: tally(), p2: tally() }, seats, peers: {} })
  expect(rows.map((r) => r.name)).toEqual(['Ann', 'Bo'])
})

it('gives a seat with no counters a row of zeros rather than dropping it', () => {
  const rows = toStatPlayers({ tally: {}, seats, peers })
  expect(rows).toHaveLength(2)
  expect(rows[0]).toMatchObject({ attack: 0, defense: 0, ddos: 0, ai: 0, err503: 0, cherryPick: 0, attackedInto: 0 })
})

it('has no rows when nobody was seated', () => {
  expect(toStatPlayers({ tally: {}, seats: [], peers })).toEqual([])
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter @release/web test -- toStatPlayers
```

Expected: FAIL — cannot resolve `./toStatPlayers`.

- [ ] **Step 3: Write the mapper**

Create `apps/frontend/src/entities/game/stats/toStatPlayers.ts`:

```ts
import { emptyTally, type PlayerId, type PlayerTally } from '@release/engine'
import type { StatPlayer } from '@release/ui'
import type { Seat } from '~/entities/game/seats'
import type { PeerInfo } from '~/network'

// The results screen's rows. This module owns the one crossing that matters
// here: the engine names seats p1..pN and the roster is keyed by peer id, and
// both are `string`, so a swap addresses nobody and says nothing (the same trap
// the board's winner lookup carries a paragraph about). Every row leaves here
// wearing a PEER id, because that is what `winnerId` and `selfId` are compared
// against on the screen.
//
// Seats, not peers, are what the table is built from: a peer that has left the
// roster still played the match, so its row survives its connection.
export function toStatPlayers(args: {
  tally: Record<PlayerId, PlayerTally>
  seats: Seat[]
  peers: Record<string, PeerInfo>
}): StatPlayer[] {
  return args.seats.map((seat) => {
    const peer = args.peers[seat.peerId]
    const counts = args.tally[seat.playerId] ?? emptyTally()
    return {
      id: seat.peerId,
      // The roster's name is the live one; the seat's is what the match was
      // played under, and the only one left once a peer is gone.
      name: peer?.name ?? seat.name,
      // Absence IS the offline signal — nobody announces their own
      // disconnection, so `where` has no such member to read.
      location: peer?.where ?? 'offline',
      ...counts,
    }
  })
}
```

Create `apps/frontend/src/entities/game/stats/index.ts`:

```ts
export { toStatPlayers } from './toStatPlayers'
```

- [ ] **Step 4: Run the test**

```bash
pnpm --filter @release/web test -- toStatPlayers
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/entities/game/stats
git commit -m "feat(web): the results table's rows, resolved from seats rather than from whoever is still connected (#19)"
```

---

## Task 8: `onToLobby` on the Stats screen

**Files:**
- Modify: `apps/ui/src/screens/Stats/Stats.tsx`
- Test: `apps/ui/src/screens/Stats/Stats.test.tsx` (create)

**Interfaces:**
- Consumes: the screen's existing `StatsProps`.
- Produces: `StatsProps.onToLobby?: () => void`, invoked by the footer button. Optional, so
  `StatsStory` keeps working untouched.

- [ ] **Step 1: Write the failing test**

Create `apps/ui/src/screens/Stats/Stats.test.tsx`:

```tsx
import { fireEvent, render } from '@testing-library/react'
import { vi } from 'vitest'
import Stats, { type StatPlayer, type StatsCopy } from './Stats'

const copy: StatsCopy = {
  title: 'Match results',
  subtitle: 'Match over',
  winnerLabel: 'winner',
  winnerTag: 'winner',
  selfTag: 'you',
  colName: 'player',
  colLoc: 'location',
  colAttack: 'attack',
  colDefense: 'defense',
  toLobby: 'to lobby',
  location: { game: 'in game', stats: 'on stats', lobby: 'in lobby', offline: 'offline' },
  achievements: {
    ddos: { title: 'King of DDoS', unit: 'times played DDoS' },
    ai: { title: 'AI Addict', unit: 'AI cards from deck' },
    err503: { title: 'Lucky One', unit: 'Error 503s from deck' },
    cherryPick: { title: 'Treasure Hunter', unit: 'times pulled from discard' },
    attackedInto: { title: 'Bug Magnet', unit: 'attack cards taken' },
  },
}

const players: StatPlayer[] = [
  { id: 'a', name: 'Ann', location: 'stats', attack: 5, defense: 1, ddos: 3, attackedInto: 0, ai: 0, err503: 0, cherryPick: 0 },
  { id: 'b', name: 'Bo', location: 'lobby', attack: 1, defense: 4, ddos: 0, attackedInto: 2, ai: 0, err503: 0, cherryPick: 0 },
]

it('calls back when the lobby button is pressed', () => {
  const onToLobby = vi.fn()
  const { getByText } = render(
    <Stats winnerId="a" selfId="a" copy={copy} players={players} onToLobby={onToLobby} />,
  )

  fireEvent.click(getByText('to lobby'))

  expect(onToLobby).toHaveBeenCalledTimes(1)
})

it('renders the button with no handler, rather than refusing to render', () => {
  // The playground passes no handler; the screen must not require one.
  const { getByText } = render(<Stats winnerId="a" copy={copy} players={players} />)
  expect(getByText('to lobby')).toBeTruthy()
  fireEvent.click(getByText('to lobby'))
})

it('names the winner and marks the local player', () => {
  const { getByText, getAllByText } = render(
    <Stats winnerId="a" selfId="b" copy={copy} players={players} />,
  )
  expect(getByText('winner')).toBeTruthy()
  expect(getAllByText('you').length).toBeGreaterThan(0)
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter @release/ui test -- Stats.test.tsx
```

Expected: FAIL — `onToLobby` is not a known prop, and the click calls nothing.

- [ ] **Step 3: Add the prop**

In `apps/ui/src/screens/Stats/Stats.tsx`, add to `interface StatsProps` (beside `chat`):

```ts
  // Leaving the results. Optional: without it the button still renders and does
  // nothing, which is how the playground shows the screen.
  onToLobby?: () => void
```

Add `onToLobby` to the destructured props of `export default function Stats({ … })`, and change
the footer (line ~272):

```tsx
      <footer className={styles.foot}>
        <Button onClick={onToLobby}>{copy.toLobby}</Button>
      </footer>
```

- [ ] **Step 4: Run the test**

```bash
pnpm --filter @release/ui test -- Stats.test.tsx
```

Expected: PASS, 3 tests. If `Button` does not forward `onClick`, check
`apps/ui/src/primitives/Button/Button.tsx` and forward it there rather than working around it in
the screen.

- [ ] **Step 5: Verify the animation docs test still passes**

```bash
pnpm --filter @release/ui test
```

Expected: PASS, including `src/animations/docs.test.ts` (no preset was added, so nothing is owed
to `docs/animations/reference.md`).

- [ ] **Step 6: Commit**

```bash
git add apps/ui/src/screens/Stats
git commit -m "feat(ui): the results screen's lobby button leads somewhere (#19)"
```

---

## Task 9: The results page

**Files:**
- Modify: `apps/frontend/src/pages/board/[gameId]/stats.tsx`
- Create: `apps/frontend/src/pages/board/[gameId]/stats.module.css`
- Modify: `packages/translation/src/locales/en/common.json`
- Modify: `packages/translation/src/locales/ru/common.json`
- Modify: `apps/frontend/src/network/useLobby.ts` (`leaveGame`)
- Test: `apps/frontend/src/pages/board/[gameId]/__tests__/stats.test.tsx` (create)

**Interfaces:**
- Consumes: `toStatPlayers` (Task 7), `onToLobby` (Task 8), `PlayerView.tally` (Task 2),
  `seatsFor`/`seatOf` from `~/entities/game/seats`, `useGoToLobby` from `~/app/lib/lobbyNavigation`.
- Produces: `UseLobby.leaveGame(): void` — clears the local match so the follower does not bounce
  the peer straight back to the board. It deliberately leaves the keeper, link and last sync alone:
  `link.close()` is local-only (`session/link.ts`), but the match is over and another peer may
  still be reading its results, so there is nothing to tear down and something to break.

- [ ] **Step 1: Add the missing copy key**

In `packages/translation/src/locales/en/common.json`, inside `"stats"`, after `"winnerTag"`:

```json
    "selfTag": "you",
```

In `packages/translation/src/locales/ru/common.json`, the same position:

```json
    "selfTag": "вы",
```

The typed-key augmentation reads the **en** catalog, so en is what makes `t('stats.selfTag')`
compile and ru is what stops it silently falling back to English.

- [ ] **Step 2: Write the failing test**

Create `apps/frontend/src/pages/board/[gameId]/__tests__/stats.test.tsx`:

```tsx
import type { PlayerView } from '@release/engine'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import type { PeerInfo } from '~/network'
import StatsPage from '../stats'

const goToLobby = vi.fn()
const leaveGame = vi.fn()
const setWhere = vi.fn()

let view: PlayerView | null
let peers: Record<string, PeerInfo>
let selfId: string

vi.mock('@release/translation', () => ({
  useTranslation: () => ({
    // The screen is i18n-agnostic and takes copy as props, so echoing the key
    // is enough to assert which copy reached which slot.
    t: (k: string, opts?: { returnObjects?: boolean }) => (opts?.returnObjects ? {} : k),
    i18n: { resolvedLanguage: 'en', changeLanguage: () => Promise.resolve() },
  }),
}))
vi.mock('~/app/lib/lobbyNavigation', () => ({ useGoToLobby: () => goToLobby }))
vi.mock('~/app/providers/SessionProvider', () => ({
  useSession: () => ({ state: { selfId, peers, hostId: 'peer-a' }, roomCode: 'ROOM', leaveGame, setWhere }),
}))
vi.mock('~/features/play-game/useGame', () => ({ useGame: () => ({ view, events: [] }) }))

const zero = { attack: 0, defense: 0, ddos: 0, ai: 0, err503: 0, cherryPick: 0, attackedInto: 0 }

beforeEach(() => {
  goToLobby.mockClear()
  leaveGame.mockClear()
  setWhere.mockClear()
  selfId = 'peer-a'
  peers = {
    'peer-a': { id: 'peer-a', name: 'Ann', role: 'host', ready: true, where: 'stats' },
    'peer-b': { id: 'peer-b', name: 'Bo', role: 'player', ready: true, where: 'lobby' },
  }
  view = {
    over: { winner: 'p1', condition: 'release' },
    tally: { p1: { ...zero, attack: 5 }, p2: { ...zero, defense: 3 } },
  } as unknown as PlayerView
})

it('names the winner by resolving the engine seat back to a peer', () => {
  render(<StatsPage />)
  // seatsFor sorts by peer id, so p1 is peer-a.
  expect(screen.getAllByText('Ann').length).toBeGreaterThan(0)
})

it('shows every seat's counters', () => {
  render(<StatsPage />)
  expect(screen.getByText('5')).toBeTruthy()
  expect(screen.getByText('3')).toBeTruthy()
})

it('announces that this peer is on the results screen', () => {
  render(<StatsPage />)
  expect(setWhere).toHaveBeenCalledWith('stats')
})

it('leaves the match before navigating, so the follower does not bounce it back', async () => {
  render(<StatsPage />)
  await userEvent.click(screen.getByText('stats.toLobby'))
  expect(leaveGame).toHaveBeenCalledTimes(1)
  expect(goToLobby).toHaveBeenCalledWith('ROOM')
})

it('renders an empty result rather than crashing when there is no projection', () => {
  // A spectator holds no seat and is never projected to; a reload loses the
  // session entirely. Both land here.
  view = null
  render(<StatsPage />)
  expect(screen.getByTestId('stats-page')).toBeTruthy()
  expect(screen.queryByText('Ann')).toBeNull()
})
```

- [ ] **Step 3: Run it to verify it fails**

```bash
pnpm --filter @release/web test -- stats.test.tsx
```

Expected: FAIL — the page renders no players and calls nothing.

- [ ] **Step 4: Add `leaveGame` to `useLobby`**

In `apps/frontend/src/network/useLobby.ts`, beside `leaveSession`:

```ts
  // Leaving the match without leaving the room. Only the local match id is
  // cleared: it is what useFollowGameStart watches, so a peer walking back to
  // the lobby with it still set would be sent straight to the board again.
  //
  // The keeper, the link and the last sync stay. link.close() is local-only
  // (session/link.ts), but the match is already over and another peer may still
  // be reading its results — there is nothing here to reclaim and a live
  // results screen to break. startGame replaces all three on a rematch, and
  // leaveSession tears them down when the room itself is left.
  const leaveGame = useCallback(() => {
    gameIdRef.current = null
    setGameId(null)
  }, [])
```

Add `leaveGame(): void` to the `UseLobby` interface (beside `leaveSession`) and to the returned
object.

- [ ] **Step 5: Write the page**

Replace `apps/frontend/src/pages/board/[gameId]/stats.tsx` entirely:

```tsx
import { useTranslation } from '@release/translation'
import { Stats, type StatsCopy } from '@release/ui'
import { useEffect } from 'react'
import { useGoToLobby } from '~/app/lib/lobbyNavigation'
import { useSession } from '~/app/providers/SessionProvider'
import { seatsFor } from '~/entities/game/seats'
import { toStatPlayers } from '~/entities/game/stats'
import { useGame } from '~/features/play-game/useGame'
import styles from './stats.module.css'

export default function StatsPage() {
  const { t, i18n } = useTranslation()
  const session = useSession()
  const game = useGame()
  const goToLobby = useGoToLobby()

  // Tell the table where this peer went, so everyone else's results table can
  // say so. Announced once per mount; the host ignores a repeat of what it
  // already recorded (network/lobby/host.ts).
  const { setWhere } = session
  useEffect(() => {
    setWhere('stats')
  }, [setWhere])

  // Seats come from the roster exactly as the board builds them, so both screens
  // resolve the engine's p1..pN to the same peers.
  const peers = session.state?.peers ?? {}
  const seats = seatsFor(peers)
  // No tally means no finished match to report: a spectator is never projected
  // to, and a reload loses the session entirely. An empty table is honest —
  // rows of zeros would claim a match in which nobody did anything, and the
  // roster alone is enough to build those rows, so this guard is what stops it.
  const tally = game.view?.tally
  const players = tally ? toStatPlayers({ tally, seats, peers }) : []

  // The engine names the winning SEAT; the screen compares against peer ids.
  // The board carries a paragraph about this crossing for the same lookup, and
  // complains the same way when it misses — the miss is reachable (a winner can
  // be pruned from the roster on disconnect), and falling back to the playerId
  // would silently name nobody. The board is unmounted on this route, so the
  // complaint has to be made here too or it is made nowhere.
  const engineWinner = game.view?.over?.winner
  const winnerSeat = engineWinner ? seats.find((s) => s.playerId === engineWinner) : undefined
  if (engineWinner && !winnerSeat && import.meta.env.DEV) {
    console.error(
      `[stats] no seat for winner ${engineWinner}: the engine names seats p1..pN, the roster is keyed by peer id. Roster: ${seats.map((s) => `${s.playerId}=${s.peerId}`).join(', ') || '(empty)'}`,
    )
  }
  const winnerId = winnerSeat?.peerId ?? ''
  const selfId = session.state?.selfId ?? ''

  const copy: StatsCopy = {
    title: t('stats.title'),
    subtitle: t('stats.subtitle'),
    winnerLabel: t('stats.winnerLabel'),
    winnerTag: t('stats.winnerTag'),
    selfTag: t('stats.selfTag'),
    colName: t('stats.colName'),
    colLoc: t('stats.colLoc'),
    colAttack: t('stats.colAttack'),
    colDefense: t('stats.colDefense'),
    toLobby: t('stats.toLobby'),
    location: {
      game: t('stats.location.game'),
      stats: t('stats.location.stats'),
      lobby: t('stats.location.lobby'),
      offline: t('stats.location.offline'),
    },
    achievements: {
      ddos: { title: t('stats.achievements.ddos.title'), unit: t('stats.achievements.ddos.unit') },
      ai: { title: t('stats.achievements.ai.title'), unit: t('stats.achievements.ai.unit') },
      err503: {
        title: t('stats.achievements.err503.title'),
        unit: t('stats.achievements.err503.unit'),
      },
      cherryPick: {
        title: t('stats.achievements.cherryPick.title'),
        unit: t('stats.achievements.cherryPick.unit'),
      },
      attackedInto: {
        title: t('stats.achievements.attackedInto.title'),
        unit: t('stats.achievements.attackedInto.unit'),
      },
    },
  }

  return (
    <div className={styles.page} data-testid="stats-page">
      <Stats
        winnerId={winnerId}
        selfId={selfId}
        players={players}
        copy={copy}
        // The story's own pair. Winning lights the HUD; everyone else gets the
        // calm one, which is what you want on a screen you sit and read.
        bgTone={winnerId !== '' && winnerId === selfId ? 'positive' : 'neutral'}
        lang={i18n.resolvedLanguage === 'ru' ? 'ru' : 'en'}
        onLangChange={(lang) => {
          void i18n.changeLanguage(lang)
        }}
        onToLobby={() => {
          // Order matters: clearing the match first means the follower sees no
          // game to send this peer back to.
          session.leaveGame()
          if (session.roomCode) goToLobby(session.roomCode)
        }}
      />
    </div>
  )
}
```

- [ ] **Step 6: Give the page a definite height**

Create `apps/frontend/src/pages/board/[gameId]/stats.module.css`:

```css
/* The screen is `min-block-size: 100%`, which needs a parent with a definite
   height to resolve against — the app root only sets `min-block-size: 100vh`.
   Same reason the board's own wrapper carries this, and `dvh` for the same
   reason too: mobile browser chrome must not push content out of a viewport it
   cannot scroll back. */
.page {
  min-block-size: 100dvh;
}
```

- [ ] **Step 7: Run the page test**

```bash
pnpm --filter @release/web test -- stats.test.tsx
```

Expected: PASS, 5 tests.

- [ ] **Step 8: Full verification**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/src packages/translation
git commit -m "feat(web): the results screen shows the match that was actually played (#19)"
```

---

## Task 10: Follow a rematch from anywhere, and say where you are

The last two holes: `useFollowGameStart` lives only on the lobby page, so a peer reading results
misses the host's next match; and the board and lobby never announce their whereabouts, so the
results table's location column only ever knows about peers who reached the results screen.

**Files:**
- Create: `apps/frontend/src/app/FollowGameStart.tsx`
- Modify: `apps/frontend/src/pages/_app.tsx`
- Modify: `apps/frontend/src/pages/lobby/_LobbyView.tsx`
- Modify: `apps/frontend/src/pages/board/[gameId]/index.tsx`
- Test: `apps/frontend/src/features/start-game/useStartGame.test.ts`

**Interfaces:**
- Consumes: `useFollowGameStart` (unchanged), `setWhere` (Task 4), per-match `gameId` (Task 5).
- Produces: `<FollowGameStart />`, a render-null component. It must live **inside**
  `<SessionProvider>` — `App` is what provides the context, so `App`'s own body cannot consume it.

- [ ] **Step 1: Write the failing test**

In `apps/frontend/src/features/start-game/useStartGame.test.ts`, append:

```ts
it('carries a peer into the next match, not just the first', () => {
  // The hole this closes: a peer reading the results of match 1 when the host
  // starts match 2. Only reachable now that each match has its own id — a
  // rematch used to reuse the host's peer id, so this dep never changed.
  session = { gameId: 'host-peer-1-1', startGame }
  const { rerender } = renderHook(() => useFollowGameStart())
  expect(navigate).toHaveBeenCalledWith('/board/host-peer-1-1')

  session = { gameId: 'host-peer-1-2', startGame }
  rerender()

  expect(navigate).toHaveBeenCalledWith('/board/host-peer-1-2')
  expect(navigate).toHaveBeenCalledTimes(2)
})

it('stays put when the match is left rather than replaced', () => {
  session = { gameId: 'host-peer-1-1', startGame }
  const { rerender } = renderHook(() => useFollowGameStart())
  navigate.mockClear()

  session = { gameId: null, startGame }
  rerender()

  expect(navigate).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run it**

```bash
pnpm --filter @release/web test -- useStartGame
```

Expected: PASS already — `useFollowGameStart` needs no change, because its effect keys on `gameId`
and Task 5 made that value differ per match. If it fails, the hook is wrong, not the test.

- [ ] **Step 3: Create the follower component**

Create `apps/frontend/src/app/FollowGameStart.tsx`:

```tsx
import { useFollowGameStart } from '~/features/start-game/useStartGame'

// The navigation half of starting a game, mounted for the whole session rather
// than by the lobby alone. A peer reading the results of one match must be
// carried into the next, and the lobby is exactly the screen it is not on.
//
// Renders nothing, and lives inside <SessionProvider> because the hook consumes
// the session context that App itself provides.
export default function FollowGameStart() {
  useFollowGameStart()
  return null
}
```

- [ ] **Step 4: Mount it in the app shell**

In `apps/frontend/src/pages/_app.tsx`, import it and render it inside the provider:

```tsx
    <SessionProvider>
      <FollowGameStart />
      <div className={styles.root}>
```

- [ ] **Step 5: Remove the lobby's own call**

In `apps/frontend/src/pages/lobby/_LobbyView.tsx`, delete the `useFollowGameStart()` call
(line ~32) and its two-line comment, and drop it from the import on line 19 (keep `useStartGame`).

- [ ] **Step 6: Announce whereabouts from the board and the lobby**

In `apps/frontend/src/pages/board/[gameId]/index.tsx`, add near the other hooks:

```tsx
  // Where this peer is, for everyone else's results table.
  const { setWhere } = session
  useEffect(() => {
    setWhere('game')
  }, [setWhere])
```

(with `useEffect` added to the `react` import).

In `apps/frontend/src/pages/lobby/_LobbyView.tsx`, the same with `'lobby'`. Place it above the
`if (!state) return null` guard — a hook may not sit below an early return.

- [ ] **Step 7: Full verification**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: all clean. `lobby.test.tsx` and `board.test.tsx` mock the session — add `setWhere` to
those mocks if they fail on an undefined call.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src
git commit -m "feat(web): every screen says where it is, and a rematch collects you from any of them (#19)"
```

---

## Task 11: Record the open questions, and close the branch out

**Files:**
- Modify: `docs/specs/2026-08-20-stats-page-design.md` (mark the defaults as shipped)

- [ ] **Step 1: Verify the whole workspace**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Expected: all four clean. `pnpm build` is what proves generouted's real route tree, which the
Vitest suites cannot import.

- [ ] **Step 2: Check the screen against the playground by eye**

```bash
pnpm dev:playground
```

Open the `Stats` story, then compare against the running app's results screen. Per
[CLAUDE.md](../../CLAUDE.md#styling-rule) the story is the visual source of truth: any difference
is the page being wrong, not the story.

- [ ] **Step 3: Mark the shipped defaults in the design doc**

In the **Open questions** section of the design, note beside each of the three that it shipped
under its stated default and remains open for the designer. Do not delete them — they are the
record that these were chosen rather than derived.

- [ ] **Step 4: Commit and push**

```bash
git add docs/specs/2026-08-20-stats-page-design.md
git commit -m "docs(specs): the three metric defaults shipped as stated, and stay open (#19)"
git push -u origin feat/19-stats-page
```

- [ ] **Step 5: Open the PR**

```bash
gh pr create --base main --title "The stats page (#19)" --body "Closes #19. Design: docs/specs/2026-08-20-stats-page-design.md"
```

---

## Notes for the executor

- **Task order is dependency order.** 1→2→3 are engine-only; 4 and 5 are network-only; 6 is a
  rename; 7→8 feed 9; 10 needs 4, 5 and 6. Tasks 3, 4, 5 and 8 can be worked in parallel once 2 is
  in.
- **Three metric definitions are stated defaults, not derived facts** (design, "Open questions").
  If implementing reveals a fourth ambiguity, record it there and in the finding registry rather
  than picking quietly — see [CLAUDE.md](../../CLAUDE.md#animations-rule) for the house rule on
  holes.
- **Chat stays out.** The `chat` slot on `Stats` is left unset on purpose; it is a cross-screen
  feature with its own issue.
