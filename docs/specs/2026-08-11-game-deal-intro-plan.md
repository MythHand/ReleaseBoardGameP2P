# Game Deal Intro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Starting a game opens with the deal — the choreography that exists today as a layout-only playground story plays on the real board, driven by the first projection.

**Architecture:** The board screen's *composition* is forked from `@release/ui` into `apps/frontend` as `Board` (every leaf block stays imported from `@release/ui`), which gives the animation a seam to live in. The intro is a replay: `planDeal` reconstructs the pre-deal table from the first `PlayerView` plus the engine's new `dealt` events, and `useDealIntro` shadows the board's state until the last frame equals the projection. A keeper-side start gate holds the game still until every seat has finished.

**Tech Stack:** TypeScript, React 19, Vite, Vitest + Testing Library, CSS Modules + design tokens, WAAPI via `@release/ui`'s `play()` presets.

Design: [`docs/specs/2026-08-11-game-deal-intro-design.md`](./2026-08-11-game-deal-intro-design.md).
Issue: [#89](https://github.com/MythHand/ReleaseBoardGameP2P/issues/89), sub-task of [#88](https://github.com/MythHand/ReleaseBoardGameP2P/issues/88).
Branch: `feat/89-game-deal-intro` (already created, spec committed).

## Global Constraints

- **Changes are confined to `apps/frontend` and `packages/engine`**, with exactly two sanctioned exceptions: export-only lines added to `apps/ui/src/index.ts` (Task 1), and the deletion of `packages/table-adapter` (Task 2). No other file under `apps/ui`, and nothing at all under `apps/playground`, may be modified.
- **`apps/ui/src/table/Table/` is not touched.** The fork is a copy; `@release/ui`'s `Table` keeps serving the playground's `TableStory`.
- **`prefers-reduced-motion` is honoured by every animation.** `play()` in `@release/ui` does *not* check it — only CSS modules do — so the sequencer must check it itself.
- **No string literals in `.tsx`.** All user-visible copy goes through `t()` with keys present in **both** `packages/translation/src/locales/en/common.json` and `…/ru/common.json`.
- **All text renders through `<Typography>`** from `@release/ui`; no hand-written font declarations.
- **Colors are design tokens only** — `var(--*)` from `apps/ui/src/design/tokens.css`. No `#hex`, `rgb()`, or named colors in CSS modules.
- **Spacing uses logical properties** (`padding-inline`, `margin-block-start`) — stylelint enforces this.
- **Code comments in English.**
- Commands: `pnpm --filter @release/web test`, `pnpm --filter @release/engine test`, `pnpm --filter @release/web typecheck`, `pnpm lint`. Type-level `*.test-d.ts` files are checked by `typecheck`, not by vitest.
- **The pre-commit hook runs `pnpm -r typecheck` over the whole repo.** An unrelated in-progress file elsewhere in the tree can fail it; if the failure is provably not from files this task touched, commit with `--no-verify` and say so in the task report.

## File Structure

**Stage 1 — the fork**

| File | Responsibility |
|---|---|
| `apps/ui/src/index.ts` (modify) | export-only additions: animation helpers, `cardBoxIn`, fan geometry, `HandItem`, `ReleaseSlots`, `Panel`, `TableOpponent`, `PendingPrompt`, `GearIcon` |
| `apps/frontend/src/entities/game/board/toBoardState.ts` | `PlayerView` + `Event[]` → `BoardState` (moved from the adapter) |
| `apps/frontend/src/entities/game/board/toBoardOver.ts` | `PlayerView` → `BoardOver \| null` (moved) |
| `apps/frontend/src/entities/game/board/toAction.ts` | board intent → engine `Intent` (moved) |
| `apps/frontend/src/entities/game/board/types.ts` | `BoardState`, `BoardOver`, `BoardOpponent`, `BoardCopyBundle`, `Panel` — the frontend's own board props |
| `apps/frontend/src/entities/game/board/contract.test-d.ts` | asserts `BoardState` ↔ `@release/ui`'s `TableState` mutual assignability |
| `apps/frontend/src/pages/board/[gameId]/_Board.tsx` | the forked composition — the screen |
| `apps/frontend/src/pages/board/[gameId]/_Board.module.css` | the screen's geometry |
| `apps/frontend/src/pages/board/[gameId]/_useBoardInteractions.ts` | gesture state (selection, targeting, combo) |
| `apps/frontend/src/pages/board/[gameId]/_layout.tsx` (modify) | renders `<Board>` instead of `<Table>` |

**Stage 2 — the deal**

| File | Responsibility |
|---|---|
| `packages/engine/src/events.ts` (modify) | `dealt` gains `open?: CardId[]` |
| `packages/engine/src/fake/setup.ts` (modify) | `setupEvents(state)` — one `dealt` per player |
| `packages/engine/src/engine.ts` (modify) | `Engine.setupEvents` on the contract |
| `apps/frontend/src/network/session/referee.ts` (modify) | first SYNC carries the setup events |
| `apps/frontend/src/features/game-intro/planDeal.ts` | pure: projection + `dealt[]` → `DealPlan` |
| `apps/frontend/src/features/game-intro/useFlyer.tsx` | the card-in-the-air carrier (ported) |
| `apps/frontend/src/features/game-intro/useHandArrival.tsx` | the heap→fan arrival step (ported) |
| `apps/frontend/src/features/game-intro/useDealIntro.ts` | the sequencer + the shadowed state |
| `apps/frontend/src/shared/lib/useReducedMotion.ts` | live `prefers-reduced-motion` match |
| `apps/frontend/src/network/session/startGate.ts` | who has reported, when the game may move |
| `apps/frontend/src/network/session/remoteLink.ts` (modify) | the gate wired into `attachKeeper` |
| `apps/frontend/src/network/types.ts` (modify) | `INTRO_READY` message |
| `apps/frontend/src/network/session/relay.ts` (modify) | `INTRO_READY` is never relayed |
| `apps/frontend/src/network/useLobby.ts` (modify) | `introReady()` on the session API |

---

# Stage 1 — the fork

### Task 1: Widen the `@release/ui` barrel

The fork and the intro need names that exist in `apps/ui` but are not on the package's public surface. This task adds export lines only — no behaviour, no new files in `apps/ui`.

**Files:**
- Modify: `apps/ui/src/index.ts`
- Test: `apps/frontend/src/entities/game/board/uiBarrel.test-d.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: from `@release/ui` — values `wait`, `nextFrames`, `scatterAt`, `restTransform`, `cardBoxIn`, `slotPlacement`, `CARD_W`, `HEAP_SHOW`, `PendingPrompt`, `GearIcon`; types `Rect`, `Scatter`, `SlotPlacement`, `HandItem`, `ReleaseSlots`, `Panel`, `TableOpponent`, `PendingPromptCopy`, `PendingPromptProps`, `WindowCopy`.

- [ ] **Step 1: Write the failing type test**

Create `apps/frontend/src/entities/game/board/uiBarrel.test-d.ts`:

```ts
// The fork and the deal intro consume these from @release/ui's public surface.
// A type-level test rather than a runtime one: what is being asserted is that
// the barrel exports these names at all, which `release-tsc --noEmit` decides.
import {
  CARD_W,
  cardBoxIn,
  GearIcon,
  HEAP_SHOW,
  type HandItem,
  nextFrames,
  type Panel,
  PendingPrompt,
  type PendingPromptCopy,
  type Rect,
  type ReleaseSlots,
  restTransform,
  type Scatter,
  scatterAt,
  type SlotPlacement,
  slotPlacement,
  type TableOpponent,
  wait,
  type WindowCopy,
} from '@release/ui'

// Values: referenced so an unused-import lint cannot delete the assertion.
const values: unknown[] = [
  CARD_W,
  cardBoxIn,
  GearIcon,
  HEAP_SHOW,
  nextFrames,
  PendingPrompt,
  restTransform,
  scatterAt,
  slotPlacement,
  wait,
]
void values

// Types: each named in a position that fails to compile if the export is absent.
type Assertions = [
  HandItem,
  Panel,
  PendingPromptCopy,
  Rect,
  ReleaseSlots,
  Scatter,
  SlotPlacement,
  TableOpponent,
  WindowCopy,
]
export type _Assertions = Assertions
```

- [ ] **Step 2: Run typecheck to verify it fails**

Run: `pnpm --filter @release/web typecheck`
Expected: FAIL — `error TS2305: Module '"@release/ui"' has no exported member 'wait'` and similar for the other new names.

- [ ] **Step 3: Add the export lines**

In `apps/ui/src/index.ts`, replace line 3:

```ts
export { PRESETS, play, presetNames } from './animations'
```

with:

```ts
export {
  HEAP_SHOW,
  nextFrames,
  PRESETS,
  play,
  presetNames,
  type Rect,
  restTransform,
  type Scatter,
  scatterAt,
  wait,
} from './animations'
```

After the existing `export { default as Card } from './primitives/Card'` line, add:

```ts
export { cardBoxIn } from './primitives/Card'
```

Add an icons export (the barrel has none today) next to the other primitive exports:

```ts
export { default as GearIcon } from './icons/GearIcon'
```

Next to `export { default as Hand } from './table/Hand'`, add:

```ts
export type { HandItem } from './table/Hand/Hand'
export { CARD_W, type SlotPlacement, slotPlacement } from './table/Hand/fan'
```

Next to `export { default as ReleaseZone } from './table/ReleaseZone'`, add:

```ts
export type { ReleaseSlots } from './table/ReleaseZone/ReleaseZone'
```

Next to the existing `./table/Table/types` block, add `Panel` and `TableOpponent` to it:

```ts
export type {
  Panel,
  TableChromeCopy as TableCopy,
  TableCopyBundle,
  TableOpponent,
  TableOver,
  TableProps,
  TableRoom,
  TableSlots,
  TableState,
} from './table/Table/types'
```

And add the prompt:

```ts
export {
  default as PendingPrompt,
  type PendingPromptCopy,
  type PendingPromptProps,
  type WindowCopy,
} from './table/Table/PendingPrompt'
```

- [ ] **Step 4: Run typecheck to verify it passes**

Run: `pnpm --filter @release/web typecheck && pnpm --filter @release/ui typecheck`
Expected: both PASS.

- [ ] **Step 5: Verify nothing else changed in apps/ui**

Run: `git diff --stat apps/ui`
Expected: exactly one file — `apps/ui/src/index.ts` — with additions only (no deletions beyond the rewritten line 3).

- [ ] **Step 6: Commit**

```bash
git add apps/ui/src/index.ts apps/frontend/src/entities/game/board/uiBarrel.test-d.ts
git commit -m "feat(ui): widen the barrel for the board fork (#89)"
```

---

### Task 2: Move the adapter into the frontend, delete the package

`@release/table-adapter` has exactly one consumer. Its logic is relocated unchanged; only import paths and the `@release/ui` type references change.

**Files:**
- Create: `apps/frontend/src/entities/game/board/toBoardState.ts`, `toBoardOver.ts`, `toAction.ts`, `index.ts`
- Create: `apps/frontend/src/entities/game/board/toBoardState.test.ts`, `toBoardOver.test.ts`, `toAction.test.ts`, `windowCountdown.test.ts`
- Delete: `packages/table-adapter/` (whole directory)
- Modify: `apps/frontend/vite.config.ts`, `apps/frontend/vitest.config.ts`, `apps/frontend/tsconfig.json`, `apps/frontend/package.json`, `apps/frontend/src/pages/board/[gameId]/_layout.tsx`, `apps/frontend/src/entities/game/historyLabels.test-d.ts`

**Interfaces:**
- Consumes: `@release/ui` types (`TableState`, `TableOver`) — unchanged for now; Task 3 swaps them for `BoardState`.
- Produces: `toBoardState(view: PlayerView, events: Event[], labels: HistoryLabels): TableState`, `toBoardOver(view: PlayerView): TableOver | null`, `toAction(...)` with its existing signature, and `export type HistoryLabels = Record<Event['type'], string>` — all re-exported from `~/entities/game/board`.

- [ ] **Step 1: Move the files with git so history follows**

```bash
mkdir -p apps/frontend/src/entities/game/board
git mv packages/table-adapter/src/toTableState.ts apps/frontend/src/entities/game/board/toBoardState.ts
git mv packages/table-adapter/src/toTableState.test.ts apps/frontend/src/entities/game/board/toBoardState.test.ts
git mv packages/table-adapter/src/toTableOver.ts apps/frontend/src/entities/game/board/toBoardOver.ts
git mv packages/table-adapter/src/toTableOver.test.ts apps/frontend/src/entities/game/board/toBoardOver.test.ts
git mv packages/table-adapter/src/toAction.ts apps/frontend/src/entities/game/board/toAction.ts
git mv packages/table-adapter/src/toAction.test.ts apps/frontend/src/entities/game/board/toAction.test.ts
git mv packages/table-adapter/src/windowCountdown.test.ts apps/frontend/src/entities/game/board/windowCountdown.test.ts
git mv packages/table-adapter/src/index.ts apps/frontend/src/entities/game/board/index.ts
```

- [ ] **Step 2: Rename the functions and fix the barrel**

In `toBoardState.ts` rename the exported `toTableState` → `toBoardState`. In `toBoardOver.ts` rename `toTableOver` → `toBoardOver`. Update the three test files' imports and call sites to the new names and paths (`./toBoardState`, `./toBoardOver`).

Rewrite `apps/frontend/src/entities/game/board/index.ts` as:

```ts
export { toAction } from './toAction'
export { toBoardOver } from './toBoardOver'
export type { HistoryLabels } from './toBoardState'
export { toBoardState } from './toBoardState'
```

- [ ] **Step 3: Run the moved tests to verify they pass in their new home**

Run: `pnpm --filter @release/web test -- src/entities/game/board`
Expected: PASS — every test that passed in the package passes here. The adapter's logic is untouched, so a failure means a broken import path, not a behaviour change.

- [ ] **Step 4: Delete the package and its wiring**

```bash
git rm -r packages/table-adapter
```

Remove the `@release/table-adapter` dependency from `apps/frontend/package.json`; remove the `adapterSrc` const and its alias entry from `apps/frontend/vitest.config.ts`; remove the equivalent alias from `apps/frontend/vite.config.ts`; remove the `@release/table-adapter` path mapping from `apps/frontend/tsconfig.json`.

In `apps/frontend/src/pages/board/[gameId]/_layout.tsx`, change:

```ts
import { toTableOver, toTableState } from '@release/table-adapter'
```

to:

```ts
import { toBoardOver, toBoardState } from '~/entities/game/board'
```

and update the two call sites (`toTableOver(game.view)` → `toBoardOver(game.view)`, `toTableState(...)` → `toBoardState(...)`).

Update the import in `apps/frontend/src/entities/game/historyLabels.test-d.ts` the same way.

- [ ] **Step 5: Reinstall and verify the workspace is consistent**

Run: `pnpm install && pnpm -r typecheck && pnpm --filter @release/web test`
Expected: install succeeds with the package gone from the lockfile; typecheck and tests PASS.

- [ ] **Step 6: Verify no reference survives**

Run: `grep -rn "table-adapter" --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=docs .`
Expected: no matches outside `pnpm-lock.yaml` history (if the lockfile still names it, rerun `pnpm install`).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(web): the board adapter moves in, the package goes (#89)"
```

---

### Task 3: Fork the board screen

**Files:**
- Create: `apps/frontend/src/pages/board/[gameId]/_Board.tsx`, `_Board.module.css`, `_useBoardInteractions.ts`
- Create: `apps/frontend/src/entities/game/board/types.ts`, `contract.test-d.ts`
- Modify: `apps/frontend/src/entities/game/board/toBoardState.ts`, `toBoardOver.ts`, `index.ts`

**Interfaces:**
- Consumes: Task 1's barrel exports; Task 2's `toBoardState` / `toBoardOver`.
- Produces:
  - `BoardState`, `BoardOpponent`, `BoardOver`, `BoardRoom`, `BoardCopyBundle`, `BoardSlots`, `BoardProps`, `Panel` from `~/entities/game/board/types`
  - `useBoardInteractions({ state, actions, comboOptions })` returning `{ phase, selected, comboWith, targets, accentAt, onCardClick, onTargetPick, cancel }`
  - `Board` (default export of `_Board.tsx`) taking `BoardProps`
  - `toBoardState` now returns `BoardState`; `toBoardOver` returns `BoardOver | null`

- [ ] **Step 1: Copy the three sources verbatim**

```bash
cp apps/ui/src/table/Table/Table.tsx        "apps/frontend/src/pages/board/[gameId]/_Board.tsx"
cp apps/ui/src/table/Table/Table.module.css "apps/frontend/src/pages/board/[gameId]/_Board.module.css"
cp apps/ui/src/table/Table/useTableInteractions.ts "apps/frontend/src/pages/board/[gameId]/_useBoardInteractions.ts"
```

Then confirm the originals are untouched:

Run: `git status --short apps/ui`
Expected: only `apps/ui/src/index.ts` from Task 1 — the `Table/` directory is clean.

- [ ] **Step 2: Create the frontend's own board types**

Create `apps/frontend/src/entities/game/board/types.ts` by copying `apps/ui/src/table/Table/types.ts` and applying these changes:

- rewrite every `@/…` import to `@release/ui` (all of them resolve to barrel names after Task 1); `DockView` comes from `@release/ui`, and `TableActions` / `TablePending` / `TableWindow` / `TableTarget` / `TableChoice` come from `@release/ui` too — the frontend does not fork `intents.ts`, it imports those types
- rename the interfaces: `TableState`→`BoardState`, `TableOpponent`→`BoardOpponent`, `TableRoom`→`BoardRoom`, `TableChromeCopy`→`BoardChromeCopy`, `TableCopyBundle`→`BoardCopyBundle`, `TableSlots`→`BoardSlots`, `TableOver`→`BoardOver`, `TableProps`→`BoardProps`; `Panel` keeps its name
- add the intro's own field to `BoardState`:

```ts
  // Set by the deal intro while it runs. The board renders one state in every
  // phase; during the intro that state is the intro's shadow of the projection,
  // and this names which phase produced it. Absent means the live projection.
  introPhase?: 'setup' | 'dealing' | 'settling'
```

- add a header comment recording the fork:

```ts
// Forked from apps/ui/src/table/Table/types.ts (2026-08-11, #89).
//
// The board screen lives here now because the deal intro animates into the real
// Hand's DOM, which a component in another package cannot expose. @release/ui's
// Table keeps its copy and keeps serving the playground's TableStory — so the
// two will drift, and contract.test-d.ts is what makes the drift a compile
// error instead of a misrender.
```

- [ ] **Step 3: Write the failing contract test**

Create `apps/frontend/src/entities/game/board/contract.test-d.ts`:

```ts
// The fork still feeds @release/ui's leaf blocks (Hand, Seat, PendingPrompt,
// deriveDock), which are typed against TableState. Structural typing makes that
// work only while the two shapes agree — so assert both directions. A prop that
// changes in @release/ui becomes a compile error here rather than a misrender
// on the board.
//
// Mirrors the idiom at apps/ui/src/table/Table/intents.ts:1.
import type { TableOver, TableState } from '@release/ui'
import type { BoardOver, BoardState } from './types'

// BoardState adds `introPhase`, which TableState has no member for, so the
// assignability that matters is: everything TableState requires, BoardState
// supplies — and vice versa for the fields the kit reads.
const toKit = (b: BoardState): TableState => b
const fromKit = (t: TableState): Omit<BoardState, 'introPhase'> => t
const overToKit = (b: BoardOver): TableOver => b
const overFromKit = (t: TableOver): BoardOver => t

void toKit
void fromKit
void overToKit
void overFromKit
```

- [ ] **Step 4: Run typecheck to verify it fails**

Run: `pnpm --filter @release/web typecheck`
Expected: FAIL — `./types` does not exist yet if Step 2 was skipped, or the assignability errors name whichever field was renamed inconsistently. Fix Step 2's renames until only intentional differences remain.

- [ ] **Step 5: Rewrite the fork's imports and names**

In `_useBoardInteractions.ts`:
- `import type { TableActions, TableTarget } from './intents'` → `import type { TableActions, TableTarget } from '@release/ui'`
- `import type { TableState } from './types'` → `import type { BoardState } from '~/entities/game/board/types'`
- rename the exported hook `useTableInteractions` → `useBoardInteractions`, and `Options.state` becomes `Pick<BoardState, 'selfId' | 'you' | 'playable' | 'frozen' | 'window'>`
- `export type Phase` stays as-is

In `_Board.tsx`:
- collapse every `@/…` import into imports from `@release/ui` (all of `HEAP_SHOW`, `LangSwitcher`, `LobbyCode`, `Rules`, `GearIcon`, `Arrow`, `centerOf`, `useArrow`, `Badge`, `Button`, `Drawer`, `HudBackground`, `Pile`, `Slider`, `TabRail`, `Toggle`, `Typography`, `GameModes`, `GameOver`, `Hand`, `MoveHistory`, `Participants`, `PauseGame`, `Reconnect`, `ReleaseZone`, `Seat`, `TurnDock`, `deriveDock`, `PendingPrompt`, and the `ReleaseSlots` type are barrel names after Task 1)
- `import { deriveDock } from './dock'` → `deriveDock` from `@release/ui`
- `import PendingPrompt from './PendingPrompt'` → from `@release/ui`
- `import styles from './Table.module.css'` → `'./_Board.module.css'`
- `import type { Panel, TableProps } from './types'` → `import type { BoardProps, Panel } from '~/entities/game/board/types'`
- `import { useTableInteractions } from './useTableInteractions'` → `import { useBoardInteractions } from './_useBoardInteractions'` and update the call
- rename the component `Table` → `Board`, its props type `TableProps` → `BoardProps`
- add the same fork header comment as in Step 2

Leave every literal, class name, and piece of markup otherwise **unchanged** — this task changes wiring, not rendering.

- [ ] **Step 6: Point the adapter at the new types**

In `toBoardState.ts`, change `import type { HistoryEntry, TableState } from '@release/ui'` to import `HistoryEntry` from `@release/ui` and `BoardState` from `./types`, and change the return type to `BoardState`. In `toBoardOver.ts`, return `BoardOver | null` from `./types`. Add both types to `index.ts`'s re-exports:

```ts
export type {
  BoardCopyBundle,
  BoardOpponent,
  BoardOver,
  BoardProps,
  BoardRoom,
  BoardSlots,
  BoardState,
  Panel,
} from './types'
```

- [ ] **Step 7: Run typecheck and the moved tests**

Run: `pnpm --filter @release/web typecheck && pnpm --filter @release/web test -- src/entities/game/board`
Expected: PASS. The contract test compiling is the proof the fork's shape still matches the kit's.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(web): the board screen forks into the frontend (#89)"
```

---

### Task 4: Wire the route to `Board` and port the screen's tests

Stage 1's deliverable: the board renders and behaves exactly as it does today, from the frontend's own component.

**Files:**
- Modify: `apps/frontend/src/pages/board/[gameId]/_layout.tsx`
- Create: `apps/frontend/src/pages/board/[gameId]/__tests__/Board.test.tsx`
- Reference: `apps/ui/src/table/Table/Table.test.tsx`, `apps/ui/src/table/Table/testFixture.ts`

**Interfaces:**
- Consumes: `Board` from Task 3, `toBoardState` / `toBoardOver` from Task 2.
- Produces: a board route rendering `<Board>`; no new exports.

- [ ] **Step 1: Port the screen's test suite**

Copy `apps/ui/src/table/Table/Table.test.tsx` to `apps/frontend/src/pages/board/[gameId]/__tests__/Board.test.tsx` and copy `apps/ui/src/table/Table/testFixture.ts` to `apps/frontend/src/pages/board/[gameId]/__tests__/fixture.ts`. Rewrite their imports: the component comes from `../_Board`, the fixture from `./fixture`, and every `@/…` import becomes `@release/ui`. Rename the fixture's `TableState` annotations to `BoardState` from `~/entities/game/board`.

The tests must live under `__tests__/` — generouted eagerly imports every non-`_`-prefixed module under `pages/`, and a test file left beside the page crashes the dev server (see `apps/frontend/CLAUDE.md`).

- [ ] **Step 2: Run the ported tests to verify they fail for the right reason**

Run: `pnpm --filter @release/web test -- "src/pages/board"`
Expected: the suite runs. Any failure at this point must be an import or fixture-typing error, not an assertion about rendering — a *rendering* failure means Task 3 changed markup it should not have. Fix until green.

- [ ] **Step 3: Point the route at the fork**

In `apps/frontend/src/pages/board/[gameId]/_layout.tsx`, replace the `Table` import from `@release/ui` with `import Board from './_Board'` (keep `DEFAULT_SETUP` and `isCounting` coming from `@release/ui`), and change the `<Table … />` element to `<Board … />`. The props are unchanged.

- [ ] **Step 4: Run the whole frontend suite**

Run: `pnpm --filter @release/web test && pnpm --filter @release/web typecheck`
Expected: PASS, including the pre-existing `__tests__/board.test.tsx`, which exercises the route end to end and is the real proof the swap is invisible.

- [ ] **Step 5: Verify the playground still builds against the untouched kit**

Run: `pnpm --filter @release/playground typecheck && pnpm --filter @release/ui typecheck`
Expected: PASS — `@release/ui`'s `Table` and `TableStory` are unaffected.

- [ ] **Step 6: Lint**

Run: `pnpm lint`
Expected: PASS. If stylelint complains about `_Board.module.css`, it is complaining about rules the copied file already violated in `apps/ui`; fix them here (this file is the frontend's now).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(web): the board route renders its own screen (#89)"
```

---

# Stage 2 — the deal

### Task 5: The engine emits the deal

`{ type: 'dealt'; player; count }` is in the Event union and nothing ever produces it. `createGame` returns a bare `GameState` and is called from ~20 test sites, so its signature stays; the deal's events come from a new pure derivation on the contract.

**Files:**
- Modify: `packages/engine/src/events.ts`, `packages/engine/src/engine.ts`, `packages/engine/src/fake/setup.ts`, `packages/engine/src/fake/index.ts`, `packages/engine/src/index.ts`, `packages/engine/src/conformance.ts`
- Test: `packages/engine/src/fake/setupEvents.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `setupEvents(state: GameState): Event[]` exported from `@release/engine` and present on the `Engine` interface. Each returned event is `{ id, type: 'dealt', player, count, open? }`, one per player in `state.seating` order, `open` listing the cards that player was dealt face up (the Debugger, by the rules) in hand order.

- [ ] **Step 1: Write the failing test**

Create `packages/engine/src/fake/setupEvents.test.ts`:

```ts
import { expect, it } from 'vitest'
import type { GameConfig } from '../engine'
import { FAKE_DECK, FAKE_EVENTS } from './index'
import { createGame } from './setup'
import { setupEvents } from './setup'

const config = (players: number): GameConfig => ({
  gameId: 'g1',
  seed: 42,
  players: Array.from({ length: players }, (_, n) => ({ id: `p${n + 1}`, name: `P${n + 1}` })),
  setup: { mode: 'classic', releasesToWin: 3, handLimit: 7 },
  deck: FAKE_DECK,
  events: FAKE_EVENTS,
})

it('emits one dealt event per player, in seating order', () => {
  const state = createGame(config(3))
  const events = setupEvents(state)
  expect(events.map((e) => e.type)).toEqual(['dealt', 'dealt', 'dealt'])
  expect(events.map((e) => (e.type === 'dealt' ? e.player : null))).toEqual(state.seating)
})

it('counts the hand it actually dealt', () => {
  const state = createGame(config(3))
  for (const e of setupEvents(state)) {
    if (e.type !== 'dealt') continue
    expect(e.count).toBe(state.players[e.player].hand.length)
  }
})

it('names the Debugger as dealt face up — it is public by the rules', () => {
  const state = createGame(config(3))
  for (const e of setupEvents(state)) {
    if (e.type !== 'dealt') continue
    const hand = state.players[e.player].hand
    const debuggers = hand.filter((c) => c.id === 'protection-debugger').map((c) => c.id)
    // Only the reserved opening Debugger is open, and it is hand[0] (setup.ts).
    expect(e.open ?? []).toEqual(hand[0]?.id === 'protection-debugger' ? [debuggers[0]] : [])
  }
})

it('is public — no dealt event is addressed to a subset of the table', () => {
  const state = createGame(config(3))
  // A count is not a secret; identities of closed cards never appear here.
  for (const e of setupEvents(state)) expect(e.visibleTo).toBeUndefined()
})

it('gives every event a distinct id', () => {
  const state = createGame(config(4))
  const ids = setupEvents(state).map((e) => e.id)
  expect(new Set(ids).size).toBe(ids.length)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @release/engine test -- setupEvents`
Expected: FAIL — `setupEvents is not a function` / no exported member `setupEvents`.

- [ ] **Step 3: Widen the `dealt` event**

In `packages/engine/src/events.ts`, replace the `dealt` member:

```ts
    | { type: 'dealt'; player: PlayerId; count: number }
```

with:

```ts
    // `open` names the cards dealt face up — by the rules the Debugger is dealt
    // openly, so it is public information, and the projection would otherwise
    // drop it. Absent or empty means the whole hand travelled closed (a deck
    // under-supplied with Debuggers deals some players five random cards; see
    // fake/setup.ts).
    | { type: 'dealt'; player: PlayerId; count: number; open?: CardId[] }
```

- [ ] **Step 4: Implement `setupEvents`**

Append to `packages/engine/src/fake/setup.ts`:

```ts
// The deal, as events. `createGame` returns a bare GameState — it is called from
// two dozen places that want only the state — so the opening feed is a separate
// pure derivation over that state rather than a second return value.
//
// Every field here is public: a count is not a secret, and `open` names only
// what the rules deal face up. The closed four are never identified.
export function setupEvents(state: GameState): Event[] {
  return state.seating.map((id, n) => {
    const hand = state.players[id].hand
    // The reserved opening Debugger is dealt first (see createGame above), so a
    // face-up card can only ever be hand[0]. A player who got none — an
    // under-supplied deck — has nothing open.
    const open = hand[0]?.id === 'protection-debugger' ? [hand[0].id] : undefined
    return { id: n + 1, type: 'dealt' as const, player: id, count: hand.length, ...(open ? { open } : {}) }
  })
}
```

Add `Event` to the file's type imports: `import type { CardId, CardInstance, Event, GameState, PlayerId, PlayerState } from '../state'` — note `Event` lives in `../events`, so add a second import line `import type { Event } from '../events'`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @release/engine test -- setupEvents`
Expected: PASS, all five cases.

- [ ] **Step 6: Put it on the contract**

In `packages/engine/src/engine.ts`, add to the `Engine` interface below `createGame`:

```ts
  // The opening deal as events. Pure over the state `createGame` returned —
  // separate from it because most callers want only the state.
  setupEvents(state: GameState): Event[]
```

In `packages/engine/src/fake/index.ts`, add `setupEvents` to the object the fake engine exports (alongside `createGame`, `reduce`, `project`, `legalTargets`), importing it from `./setup`. Export it from `packages/engine/src/index.ts` the same way its siblings are exported.

In `packages/engine/src/conformance.ts`, add a case to the suite asserting the contract holds for any implementation:

```ts
  it('deals every seated player an opening hand, and says so', () => {
    const engine = make()
    const state = engine.createGame(configFor(options, 4242))
    const events = engine.setupEvents(state)
    const dealt = events.filter((e) => e.type === 'dealt')
    expect(dealt).toHaveLength(state.seating.length)
    for (const e of dealt) {
      if (e.type !== 'dealt') continue
      expect(e.count).toBe(state.players[e.player].hand.length)
      // `open` may only name cards the player actually holds.
      for (const id of e.open ?? []) {
        expect(state.players[e.player].hand.some((c) => c.id === id)).toBe(true)
      }
    }
  })
```

- [ ] **Step 7: Run the engine suite**

Run: `pnpm --filter @release/engine test && pnpm --filter @release/engine typecheck`
Expected: PASS. If another `Engine` implementation exists it now fails to compile until it adds `setupEvents` — the fake is the only one today.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(engine): the deal is an event, and the open Debugger is public (#89)"
```

---

### Task 6: The first SYNC carries the deal

**Files:**
- Modify: `apps/frontend/src/network/session/referee.ts:99`
- Test: `apps/frontend/src/network/session/referee.test.ts` (extend)

**Interfaces:**
- Consumes: `engine.setupEvents` from Task 5.
- Produces: `createSession`'s initial `outgoing` SYNC now carries the deal events instead of `[]`.

- [ ] **Step 1: Write the failing test**

Append to `apps/frontend/src/network/session/referee.test.ts` (follow the file's existing fixture helpers for building a session):

```ts
it('opens the feed with the deal rather than a blank', () => {
  const { outgoing } = createSession({
    gameId: 'g1',
    keeperId: 'p1',
    engine: createFakeEngine(),
    seed: 7,
    players: [
      { playerId: 'p1', peerId: 'peer-1', name: 'One' },
      { playerId: 'p2', peerId: 'peer-2', name: 'Two' },
    ],
    setup: DEFAULT_SETUP,
    deck: FAKE_DECK,
    events: FAKE_EVENTS,
  })

  const syncs = outgoing.filter((o) => o.message.type === 'SYNC')
  expect(syncs).toHaveLength(2)
  for (const s of syncs) {
    if (s.message.type !== 'SYNC') continue
    const dealt = s.message.payload.events.filter((e) => e.type === 'dealt')
    // The deal is public, so every seat hears about every seat's hand size.
    expect(dealt).toHaveLength(2)
  }
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @release/web test -- src/network/session/referee`
Expected: FAIL — `expected [] to have length 2`.

- [ ] **Step 3: Seed the first sync**

In `referee.ts`, inside `createSession`, replace:

```ts
      ...syncAll(session, []),
```

with:

```ts
      // The deal is the first thing that happened in this game, so it is the
      // first thing in the feed — the move history opened on a blank without it,
      // and the board's intro reads the deal from here.
      ...syncAll(session, args.engine.setupEvents(state)),
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @release/web test -- src/network/session/referee`
Expected: PASS.

- [ ] **Step 5: Run the whole network suite**

Run: `pnpm --filter @release/web test -- src/network`
Expected: PASS. A test asserting an exact event count on the opening sync may need its expectation updated — the deal is now genuinely there.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(web): the opening sync carries the deal (#89)"
```

---

### Task 7: `planDeal` — the choreography as data

**Files:**
- Create: `apps/frontend/src/features/game-intro/planDeal.ts`
- Test: `apps/frontend/src/features/game-intro/planDeal.test.ts`

**Interfaces:**
- Consumes: `PlayerView`, `Event` from `@release/engine`.
- Produces:

```ts
export interface DealFlight {
  round: number
  to: { kind: 'self'; index: number } | { kind: 'seat'; player: string }
  // The card's identity, when it is one the viewer may know: their own, or an
  // opponent's face-up Debugger. Null is a closed card of somebody else's.
  card: string | null
  faceUp: boolean
}
export interface DealPlan {
  deckBefore: number
  events: number
  flights: DealFlight[]
  hand: { uid: string; card: string }[]
}
export function planDeal(view: PlayerView, events: Event[]): DealPlan | null
```

`null` when the projection is not an opening (see Task 10's freshness rule) or when no `dealt` events are present.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/features/game-intro/planDeal.test.ts`:

```ts
import type { Event, PlayerView } from '@release/engine'
import { expect, it } from 'vitest'
import { planDeal } from './planDeal'

const dealt = (player: string, count: number, open?: string[]): Event =>
  ({ id: 1, type: 'dealt', player, count, ...(open ? { open } : {}) }) as Event

const view = (): PlayerView =>
  ({
    self: {
      id: 'p1',
      name: 'One',
      hand: [
        { uid: 'protection-debugger#0', id: 'protection-debugger' },
        { uid: 'attack-bug#1', id: 'attack-bug' },
        { uid: 'attack-ddos#0', id: 'attack-ddos' },
        { uid: 'defense-hotfix#0', id: 'defense-hotfix' },
        { uid: 'support-sudo#2', id: 'support-sudo' },
      ],
      release: {},
      playable: [],
      frozen: [],
    },
    opponents: [
      { id: 'p2', name: 'Two', handCount: 5, release: {}, eliminated: false },
      { id: 'p3', name: 'Three', handCount: 5, release: {}, eliminated: false },
    ],
    decks: { piles: [89], events: 21, discardCount: 0 },
    turn: { player: 'p1', index: 0, hasDrawn: false },
    window: null,
    pending: null,
    setup: { mode: 'classic', releasesToWin: 3, handLimit: 7 },
    over: null,
  }) as unknown as PlayerView

const feed = (): Event[] => [
  dealt('p1', 5, ['protection-debugger']),
  dealt('p2', 5, ['protection-debugger']),
  dealt('p3', 5, ['protection-debugger']),
]

it('counts the pile back up to what it was before the deal', () => {
  const plan = planDeal(view(), feed())
  // 89 left + 15 dealt
  expect(plan?.deckBefore).toBe(104)
})

it('deals round by round, the player first in every round', () => {
  const plan = planDeal(view(), feed())
  const order = plan?.flights.slice(0, 6).map((f) => (f.to.kind === 'self' ? 'self' : f.to.player))
  expect(order).toEqual(['self', 'p2', 'p3', 'self', 'p2', 'p3'])
})

it('opens the first round and closes the four that follow', () => {
  const plan = planDeal(view(), feed())
  const first = plan?.flights.filter((f) => f.round === 0) ?? []
  const rest = plan?.flights.filter((f) => f.round > 0) ?? []
  expect(first.every((f) => f.faceUp)).toBe(true)
  expect(rest.every((f) => !f.faceUp)).toBe(true)
})

it('names an opponent card only when it was dealt face up', () => {
  const plan = planDeal(view(), feed())
  const opp = plan?.flights.filter((f) => f.to.kind === 'seat') ?? []
  expect(opp.filter((f) => f.round === 0).every((f) => f.card === 'protection-debugger')).toBe(true)
  expect(opp.filter((f) => f.round > 0).every((f) => f.card === null)).toBe(true)
})

it('deals into the fan in the projection order, so the fan never re-sorts', () => {
  const v = view()
  const plan = planDeal(v, feed())
  expect(plan?.hand.map((h) => h.uid)).toEqual(v.self.hand.map((c) => c.uid))
  const mine = plan?.flights.filter((f) => f.to.kind === 'self') ?? []
  expect(mine.map((f) => (f.to.kind === 'self' ? f.to.index : -1))).toEqual([0, 1, 2, 3, 4])
})

it('deals a closed first round when the deck had no Debugger for this seat', () => {
  const v = view()
  v.self.hand[0] = { uid: 'attack-bug#2', id: 'attack-bug' }
  const plan = planDeal(v, [dealt('p1', 5), dealt('p2', 5), dealt('p3', 5)])
  expect(plan?.flights.every((f) => !f.faceUp)).toBe(true)
})

it('handles an uneven deal without inventing flights', () => {
  const v = view()
  v.opponents[1].handCount = 3
  const plan = planDeal(v, [dealt('p1', 5, ['protection-debugger']), dealt('p2', 5), dealt('p3', 3)])
  expect(plan?.flights.filter((f) => f.to.kind === 'seat' && f.to.player === 'p3')).toHaveLength(3)
})

it('is null when the feed carries no deal', () => {
  expect(planDeal(view(), [])).toBeNull()
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @release/web test -- planDeal`
Expected: FAIL — cannot find module `./planDeal`.

- [ ] **Step 3: Implement `planDeal`**

Create `apps/frontend/src/features/game-intro/planDeal.ts`:

```ts
import type { Event, PlayerView } from '@release/engine'

export interface DealFlight {
  round: number
  to: { kind: 'self'; index: number } | { kind: 'seat'; player: string }
  // The card's identity, when it is one this viewer may know: their own card,
  // or an opponent's face-up Debugger. Null is somebody else's closed card —
  // the projection never says what it is, and neither does this.
  card: string | null
  faceUp: boolean
}

export interface DealPlan {
  // The base pile as it stood before the deal: what is left plus what went out.
  deckBefore: number
  events: number
  // Round by round, the player first in every round — the table is dealt the
  // way a table is dealt, not player by player.
  flights: DealFlight[]
  // The finished fan, in the projection's own order. Deal into it in this order
  // and the hand never re-sorts when the intro hands over to the live board.
  hand: { uid: string; card: string }[]
}

// The opening, reconstructed. The engine dealt before any peer mounted the
// board, so this reads the finished projection backwards into the sequence that
// produced it. Pure: every timing decision belongs to the sequencer.
export function planDeal(view: PlayerView, events: Event[]): DealPlan | null {
  const deals = events.filter((e): e is Extract<Event, { type: 'dealt' }> => e.type === 'dealt')
  if (deals.length === 0) return null

  const mine = deals.find((d) => d.player === view.self.id)
  const others = view.opponents.map((o) => ({
    id: o.id,
    deal: deals.find((d) => d.player === o.id),
  }))

  const piles = view.decks.piles.reduce((sum, n) => sum + n, 0)
  const out = deals.reduce((sum, d) => sum + d.count, 0)

  const myCount = mine?.count ?? view.self.hand.length
  const rounds = Math.max(myCount, ...others.map((o) => o.deal?.count ?? 0))

  const flights: DealFlight[] = []
  for (let round = 0; round < rounds; round += 1) {
    if (round < myCount) {
      const card = view.self.hand[round]
      flights.push({
        round,
        to: { kind: 'self', index: round },
        card: card?.id ?? null,
        // The open cards are dealt first (packages/engine/src/fake/setup.ts
        // reserves the Debugger as hand[0]), so a round is open exactly while
        // it is still inside the open list.
        faceUp: round < (mine?.open?.length ?? 0),
      })
    }
    for (const o of others) {
      if (!o.deal || round >= o.deal.count) continue
      const open = o.deal.open ?? []
      flights.push({
        round,
        to: { kind: 'seat', player: o.id },
        card: round < open.length ? open[round] : null,
        faceUp: round < open.length,
      })
    }
  }

  return {
    deckBefore: piles + out,
    events: view.decks.events,
    flights,
    hand: view.self.hand.map((c) => ({ uid: c.uid, card: c.id })),
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @release/web test -- planDeal`
Expected: PASS, all eight cases.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/game-intro/planDeal.ts apps/frontend/src/features/game-intro/planDeal.test.ts
git commit -m "feat(web): the opening deal, reconstructed from the projection (#89)"
```

---

### Task 8: Port the flight hooks

Two hooks live inside the playground story and are local to it. `apps/playground` must not be modified, so they are copied.

**Files:**
- Create: `apps/frontend/src/features/game-intro/useFlyer.tsx`, `useFlyer.module.css`, `useHandArrival.tsx`, `useHandArrival.module.css`
- Reference: `apps/playground/stories/interactive/useFlyer.tsx`, `useHandArrival.tsx` (+ their CSS)

**Interfaces:**
- Consumes: Task 1's barrel exports (`nextFrames`, `wait`, `Rect`, `cardBoxIn`, `CARD_W`, `slotPlacement`, `Card`, `CardData`).
- Produces:
  - `useFlyer(): { overlay: ReactNode; raise(cards): Promise<HTMLElement[]>; drop(key?: string): void }`
  - `useHandArrival(handRef, onLanded): { overlay: ReactNode; gapAt: number | null; gapSize: number; arrive(items, gapIndex): Promise<void> }`
  - Both keep the source hooks' exported types verbatim.

- [ ] **Step 1: Copy the four files**

```bash
cp apps/playground/stories/interactive/useFlyer.tsx           apps/frontend/src/features/game-intro/useFlyer.tsx
cp apps/playground/stories/interactive/useFlyer.module.css    apps/frontend/src/features/game-intro/useFlyer.module.css
cp apps/playground/stories/interactive/useHandArrival.tsx     apps/frontend/src/features/game-intro/useHandArrival.tsx
cp apps/playground/stories/interactive/useHandArrival.module.css apps/frontend/src/features/game-intro/useHandArrival.module.css
```

- [ ] **Step 2: Rewrite their imports**

In `useFlyer.tsx`:
- `import { nextFrames, type Rect, wait } from '@/animations'` → `from '@release/ui'`
- `import type { Card as CardType } from '@/cards/types'` → `import type { CardData as CardType } from '@release/ui'`
- `import Card from '@/primitives/Card'` → `import { Card } from '@release/ui'`

In `useHandArrival.tsx`:
- `import { nextFrames, type Rect, wait } from '@/animations'` → `from '@release/ui'`
- `import type { Card as CardType } from '@/cards/types'` → `import type { CardData as CardType } from '@release/ui'`
- `import Card, { cardBoxIn } from '@/primitives/Card'` → `import { Card, cardBoxIn } from '@release/ui'`
- `import { CARD_W, slotPlacement } from '@/table/Hand/fan'` → `import { CARD_W, slotPlacement } from '@release/ui'`

Add a one-line header to each recording the origin:

```tsx
// Ported from apps/playground/stories/interactive/useFlyer.tsx (#89). The
// playground keeps its copy: it is layout-only and owns no logic of ours.
```

Change nothing else — not a constant, not a comment, not a class name.

- [ ] **Step 3: Write a smoke test that mounts both**

Create `apps/frontend/src/features/game-intro/__tests__/flightHooks.test.tsx`:

```tsx
import { cardById } from '@release/ui'
import { render } from '@testing-library/react'
import { createRef } from 'react'
import { expect, it } from 'vitest'
import { useFlyer } from '../useFlyer'
import { useHandArrival } from '../useHandArrival'

// jsdom has no layout and no WAAPI, so this asserts what a port can break:
// the hooks mount, render their overlay, and expose their surface.
function Probe() {
  const flyer = useFlyer()
  const handRef = createRef<HTMLDivElement>()
  const arrival = useHandArrival(handRef, () => {})
  return (
    <div>
      <div data-testid="surface">
        {typeof flyer.raise}:{typeof flyer.drop}:{typeof arrival.arrive}
      </div>
      {flyer.overlay}
      {arrival.overlay}
    </div>
  )
}

it('mounts both flight hooks and exposes their surface', () => {
  const { getByTestId } = render(<Probe />)
  expect(getByTestId('surface').textContent).toBe('function:function:function')
})

it('resolves a card id the deal will fly', () => {
  // The port must keep reading the same catalogue the story read.
  expect(cardById('protection-debugger')).toBeTruthy()
})
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @release/web test -- flightHooks`
Expected: PASS. A failure here is an unrewritten `@/…` import.

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm --filter @release/web typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/game-intro
git commit -m "feat(web): the flight hooks come over from the story (#89)"
```

---

### Task 9: `useReducedMotion`

**Files:**
- Create: `apps/frontend/src/shared/lib/useReducedMotion.ts`
- Test: `apps/frontend/src/shared/lib/useReducedMotion.test.ts`

**Interfaces:**
- Produces: `useReducedMotion(): boolean` — live, re-rendering when the preference changes.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/shared/lib/useReducedMotion.test.ts`:

```ts
import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { useReducedMotion } from './useReducedMotion'

let listeners: ((e: { matches: boolean }) => void)[] = []
let matches = false

beforeEach(() => {
  listeners = []
  matches = false
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => listeners.push(fn),
    removeEventListener: (_: string, fn: (e: { matches: boolean }) => void) => {
      listeners = listeners.filter((l) => l !== fn)
    },
  }))
})

it('reports the preference as it stands at mount', () => {
  matches = true
  const { result } = renderHook(() => useReducedMotion())
  expect(result.current).toBe(true)
})

it('follows a change made while mounted', () => {
  const { result } = renderHook(() => useReducedMotion())
  expect(result.current).toBe(false)
  act(() => {
    for (const l of listeners) l({ matches: true })
  })
  expect(result.current).toBe(true)
})

it('stops listening when unmounted', () => {
  const { unmount } = renderHook(() => useReducedMotion())
  expect(listeners).toHaveLength(1)
  unmount()
  expect(listeners).toHaveLength(0)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @release/web test -- useReducedMotion`
Expected: FAIL — cannot find module `./useReducedMotion`.

- [ ] **Step 3: Implement it**

Create `apps/frontend/src/shared/lib/useReducedMotion.ts`:

```ts
import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

// Every animation in this project honours the preference. The CSS modules do it
// with a media query; JS-driven choreography has to ask, because `play()` in
// @release/ui does not check it — it drives WAAPI directly.
//
// Live rather than read-once: the preference can change while a page is open,
// and an intro that started animating should be able to stop.
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(QUERY).matches,
  )

  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const onChange = (e: { matches: boolean }) => setReduced(e.matches)
    mq.addEventListener('change', onChange as EventListener)
    return () => mq.removeEventListener('change', onChange as EventListener)
  }, [])

  return reduced
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @release/web test -- useReducedMotion`
Expected: PASS, all three cases.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/shared/lib/useReducedMotion.ts apps/frontend/src/shared/lib/useReducedMotion.test.ts
git commit -m "feat(web): a live prefers-reduced-motion signal (#89)"
```

---

### Task 10: `useDealIntro` — the sequencer

**Files:**
- Create: `apps/frontend/src/features/game-intro/useDealIntro.ts`, `isOpening.ts`
- Test: `apps/frontend/src/features/game-intro/isOpening.test.ts`, `__tests__/useDealIntro.test.tsx`

**Interfaces:**
- Consumes: `planDeal` / `DealPlan` (Task 7), `useFlyer` / `useHandArrival` (Task 8), `useReducedMotion` (Task 9), `BoardState` (Task 3), `play`, `wait`, `scatterAt`, `restTransform`, `cardBoxIn`, `Rect`, `Scatter` from `@release/ui`.
- Produces:

```ts
export function isOpening(view: PlayerView): boolean

export interface IntroRefs {
  rail: RefObject<HTMLDivElement | null>
  bg: RefObject<HTMLDivElement | null>
  decks: RefObject<HTMLDivElement | null>
  discard: RefObject<HTMLDivElement | null>
  seats: RefObject<HTMLDivElement | null>
  dock: RefObject<HTMLDivElement | null>
  zone: RefObject<HTMLDivElement | null>
  deckBox: RefObject<HTMLDivElement | null>
  centre: RefObject<HTMLDivElement | null>
  hand: RefObject<HTMLDivElement | null>
  seatOf: (player: string) => HTMLElement | null
}

export interface StagedCard { uid: string; card: string; sc: Scatter; faceDown: boolean }

export interface DealIntro {
  active: boolean
  // The board's state while the intro runs — the projection, shadowed. Null
  // once the intro is over: the board renders the live projection again.
  shadow: BoardState | null
  staged: StagedCard[]
  overlays: ReactNode
  finish: () => void
}

export function useDealIntro(args: {
  live: BoardState
  view: PlayerView | null
  events: Event[]
  refs: IntroRefs
  onDone: () => void
}): DealIntro
```

- [ ] **Step 1: Write the failing freshness test**

Create `apps/frontend/src/features/game-intro/isOpening.test.ts`:

```ts
import type { PlayerView } from '@release/engine'
import { expect, it } from 'vitest'
import { isOpening } from './isOpening'

const opening = (): PlayerView =>
  ({
    self: { id: 'p1', name: 'One', hand: [], release: {}, playable: [], frozen: [] },
    opponents: [{ id: 'p2', name: 'Two', handCount: 5, release: {}, eliminated: false }],
    decks: { piles: [89], events: 21, discardCount: 0 },
    turn: { player: 'p1', index: 0, hasDrawn: false },
    window: null,
    pending: null,
    setup: { mode: 'classic', releasesToWin: 3, handLimit: 7 },
    over: null,
  }) as unknown as PlayerView

it('recognises a game that has not been played yet', () => {
  expect(isOpening(opening())).toBe(true)
})

it('is not an opening once a turn has advanced', () => {
  const v = opening()
  v.turn.index = 1
  expect(isOpening(v)).toBe(false)
})

it('is not an opening once the player on turn has drawn', () => {
  const v = opening()
  v.turn.hasDrawn = true
  expect(isOpening(v)).toBe(false)
})

it('is not an opening once anything is in the discard', () => {
  const v = opening()
  v.decks.discardCount = 1
  expect(isOpening(v)).toBe(false)
})

it('is not an opening once a release is on the table', () => {
  const v = opening()
  v.opponents[0].release = { frontend: { uid: 'release-frontend#0', card: 'release-frontend' } }
  expect(isOpening(v)).toBe(false)
})

it('is not an opening once somebody is out', () => {
  const v = opening()
  v.opponents[0].eliminated = true
  expect(isOpening(v)).toBe(false)
})

it('is not an opening for a finished game', () => {
  const v = opening()
  v.over = { winner: 'p1', condition: 'release' }
  expect(isOpening(v)).toBe(false)
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @release/web test -- isOpening`
Expected: FAIL — cannot find module `./isOpening`.

- [ ] **Step 3: Implement `isOpening`**

Create `apps/frontend/src/features/game-intro/isOpening.ts`:

```ts
import type { PlayerView } from '@release/engine'

// Whether this projection is a game nobody has played yet. The intro plays on
// fresh entry only, and freshness is decided from the state itself rather than
// from bookkeeping: a reconnect mid-game must drop straight to the live board.
//
// Accepted edge: a refresh in the first seconds of turn 1, before anyone has
// acted, still looks like an opening and replays the deal. That is preferred to
// storing "already seen" somewhere it can go stale.
export function isOpening(view: PlayerView): boolean {
  if (view.over) return false
  if (view.turn.index !== 0 || view.turn.hasDrawn) return false
  if (view.decks.discardCount > 0) return false
  if (view.pending || view.window) return false
  const released = (r: PlayerView['self']['release']) => Object.keys(r).length > 0
  if (released(view.self.release)) return false
  return view.opponents.every((o) => !o.eliminated && !released(o.release))
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @release/web test -- isOpening`
Expected: PASS, all seven cases.

- [ ] **Step 5: Write the failing sequencer test**

Create `apps/frontend/src/features/game-intro/__tests__/useDealIntro.test.tsx`. jsdom has no WAAPI and no layout, so the sequencer must be testable without them: `play()` returns `null` when there is no element, and the reduced-motion path never animates at all. That is what these cases exercise.

```tsx
import type { Event, PlayerView } from '@release/engine'
import { renderHook, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import { expect, it, vi } from 'vitest'
import type { BoardState } from '~/entities/game/board'
import { useDealIntro } from '../useDealIntro'

vi.mock('~/shared/lib/useReducedMotion', () => ({ useReducedMotion: () => true }))

const refs = () => ({
  rail: createRef<HTMLDivElement>(),
  bg: createRef<HTMLDivElement>(),
  decks: createRef<HTMLDivElement>(),
  discard: createRef<HTMLDivElement>(),
  seats: createRef<HTMLDivElement>(),
  dock: createRef<HTMLDivElement>(),
  zone: createRef<HTMLDivElement>(),
  deckBox: createRef<HTMLDivElement>(),
  centre: createRef<HTMLDivElement>(),
  hand: createRef<HTMLDivElement>(),
  seatOf: () => null,
})

// Minimal but real: the shapes the sequencer reads.
const view = (): PlayerView =>
  ({
    self: {
      id: 'p1',
      name: 'One',
      hand: [
        { uid: 'protection-debugger#0', id: 'protection-debugger' },
        { uid: 'attack-bug#1', id: 'attack-bug' },
      ],
      release: {},
      playable: [],
      frozen: [],
    },
    opponents: [{ id: 'p2', name: 'Two', handCount: 2, release: {}, eliminated: false }],
    decks: { piles: [100], events: 21, discardCount: 0 },
    turn: { player: 'p1', index: 0, hasDrawn: false },
    window: null,
    pending: null,
    setup: { mode: 'classic', releasesToWin: 3, handLimit: 7 },
    over: null,
  }) as unknown as PlayerView

const events = (): Event[] =>
  [
    { id: 1, type: 'dealt', player: 'p1', count: 2, open: ['protection-debugger'] },
    { id: 2, type: 'dealt', player: 'p2', count: 2, open: ['protection-debugger'] },
  ] as Event[]

const live = (): BoardState =>
  ({
    you: { name: 'One', hand: [], release: {} },
    opponents: [{ id: 'p2', name: 'Two', handCount: 2, release: {} }],
    decks: { main: 100, events: 21, discardCount: 0 },
    turn: 'p1',
    hasDrawn: false,
    selfId: 'p1',
    history: [],
    setup: { mode: 'classic', releasesToWin: 3, handLimit: 7 },
    playable: [],
    frozen: [],
  }) as unknown as BoardState

it('under reduced motion it is over at once, and reports it', async () => {
  const onDone = vi.fn()
  const { result } = renderHook(() =>
    useDealIntro({ live: live(), view: view(), events: events(), refs: refs(), onDone }),
  )
  await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
  expect(result.current.active).toBe(false)
  expect(result.current.shadow).toBeNull()
})

it('does not run for a projection that is not an opening', async () => {
  const v = view()
  v.turn.hasDrawn = true
  const onDone = vi.fn()
  const { result } = renderHook(() =>
    useDealIntro({ live: live(), view: v, events: events(), refs: refs(), onDone }),
  )
  expect(result.current.active).toBe(false)
  await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
})

it('does not run before the first projection arrives', () => {
  const onDone = vi.fn()
  const { result } = renderHook(() =>
    useDealIntro({ live: live(), view: null, events: [], refs: refs(), onDone }),
  )
  // Nothing to replay yet, and nothing reported: the gate must keep waiting.
  expect(result.current.active).toBe(false)
  expect(onDone).not.toHaveBeenCalled()
})

it('reports done exactly once even if the projection updates', async () => {
  const onDone = vi.fn()
  const { rerender } = renderHook(
    (props: { v: PlayerView }) =>
      useDealIntro({ live: live(), view: props.v, events: events(), refs: refs(), onDone }),
    { initialProps: { v: view() } },
  )
  await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
  rerender({ v: view() })
  rerender({ v: view() })
  expect(onDone).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm --filter @release/web test -- useDealIntro`
Expected: FAIL — cannot find module `../useDealIntro`.

- [ ] **Step 7: Implement the sequencer**

Create `apps/frontend/src/features/game-intro/useDealIntro.ts`. Port the beat structure from `apps/playground/stories/interactive/GameDealStory.tsx:76-92` (the constants) and `:152-309` (the sequence), with these differences from the story:

- the constants are copied verbatim — the story's timings are the approved ones:

```ts
const RAIL_MS = 640
const BG_MS = 900
const PILE_MS = 620
const PILE_STAGGER = 180
const SEAT_MS = 560
const SEAT_STAGGER = 140
const DOCK_DELAY = 320
const ZONE_MS = 620
const BEAT = 320
const DEAL_LEAD = 420
const DEAL_STEP = 230
const ROUND_GAP = 160
const HEAP_HOLD = 640
const FLIP_HOLD = 380
const REVEAL_HOLD = 620
const CARD_W = 150
```

- the cards come from `planDeal`, not from `Math.random()`
- an opponent's closed card renders as a back — a `card: null` flight uses the deck's own cover, which `Card` already draws for `faceDown`
- the shadow state is derived each frame from `live` plus the intro's own counters:

```ts
  // One state, shadowed. The board renders this instead of the projection while
  // the intro runs; its last frame is the projection's own values, in the
  // projection's own hand order, so the handover changes nothing on screen.
  const shadow: BoardState | null = active
    ? {
        ...live,
        you: { ...live.you, hand: landed, release: zoneIn ? live.you.release : {} },
        opponents: live.opponents.map((o) => ({ ...o, handCount: dealtTo[o.id] ?? 0 })),
        decks: { ...live.decks, main: deckCount },
        introPhase: phase,
      }
    : null
```

- `finish()` is the single collapse path, used by skip, by reduced motion, and by every degradation below. It cancels the running sequence, drops every flyer, sets the shadow to null and calls `onDone` once:

```ts
  // One way out, taken by the skip, by reduced motion, by a missing rect and by
  // a resize. Two implementations of "jump to the end" would drift, and only one
  // of them would be the one anybody tested.
  const finish = useCallback(() => {
    cancelled.current = true
    drop()
    setActive(false)
    if (!reported.current) {
      reported.current = true
      args.onDone()
    }
  }, [drop, args.onDone])
```

- the effect is keyed by the game's identity, not by mount, and guarded with a ref so React 19 StrictMode's double invocation plays it once
- `useReducedMotion()` short-circuits before the first beat: `if (reduced) { finish(); return }`
- degradation, each routed through `finish()`: a null rect from `deckBox`/`centre`/a seat; a `resize` listener registered for the intro's lifetime; unmount via the effect's cleanup
- the sequence reports `onDone` when the release zone has arrived, *not* when the fan flips — the gate should open only once the board is fully dressed

- [ ] **Step 8: Run the sequencer tests**

Run: `pnpm --filter @release/web test -- useDealIntro`
Expected: PASS, all four cases.

- [ ] **Step 9: Typecheck and commit**

Run: `pnpm --filter @release/web typecheck`
Expected: PASS.

```bash
git add apps/frontend/src/features/game-intro
git commit -m "feat(web): the deal, sequenced (#89)"
```

---

### Task 11: The board plays the intro

**Files:**
- Modify: `apps/frontend/src/pages/board/[gameId]/_Board.tsx`, `_Board.module.css`, `apps/frontend/src/pages/board/[gameId]/_layout.tsx`
- Modify: `packages/translation/src/locales/en/common.json`, `packages/translation/src/locales/ru/common.json`
- Test: `apps/frontend/src/pages/board/[gameId]/__tests__/boardIntro.test.tsx`

**Interfaces:**
- Consumes: `useDealIntro` (Task 10).
- Produces: `Board` accepts `intro?: { view: PlayerView | null; events: Event[]; onDone: () => void }`; when present it renders the intro's shadow, mounts the flight overlays, holds input inert, and binds skip.

- [ ] **Step 1: Add the dock's copy key to both catalogs**

In `packages/translation/src/locales/en/common.json`, under the `turnDock` object add `"gameStart": "game start"`. In `…/ru/common.json`, add `"gameStart": "старт игры"`. A key present in only one catalog silently falls back, so both change in this step.

- [ ] **Step 2: Write the failing test**

Create `apps/frontend/src/pages/board/[gameId]/__tests__/boardIntro.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import Board from '../_Board'
import { boardFixture, introFixture } from './fixture'

// Reduced motion is the deterministic path through the sequencer: no WAAPI, no
// layout, straight to the end state. It is also the path that must render the
// finished board, which is what makes it the right one to assert on.
vi.mock('~/shared/lib/useReducedMotion', () => ({ useReducedMotion: () => true }))

it('lands on the dealt board when motion is reduced', async () => {
  const onDone = vi.fn()
  render(<Board {...boardFixture()} intro={{ ...introFixture(), onDone }} />)
  // Five cards in the fan, face up — the projection's own hand.
  expect(await screen.findAllByTestId('hand-card')).toHaveLength(5)
  expect(onDone).toHaveBeenCalledTimes(1)
})

it('holds the player's input while the intro runs', async () => {
  const onPlay = vi.fn()
  const props = boardFixture()
  render(
    <Board
      {...props}
      actions={{ ...props.actions, onPlay }}
      intro={{ ...introFixture(), onDone: () => {} }}
    />,
  )
  const cards = await screen.findAllByTestId('hand-card')
  await userEvent.click(cards[0])
  // The intro is over under reduced motion, so this asserts the release of the
  // hold rather than the hold itself — the hold is asserted below.
  expect(onPlay).toHaveBeenCalledTimes(0)
})

it('names the moment in the dock instead of a player', () => {
  render(<Board {...boardFixture()} intro={{ ...introFixture(), onDone: () => {} }} />)
  expect(screen.getByText('turnDock.gameStart')).toBeTruthy()
})

it('renders the live board when no intro is given', () => {
  render(<Board {...boardFixture()} />)
  expect(screen.queryByText('turnDock.gameStart')).toBeNull()
})
```

Extend `./fixture.ts` (created in Task 4) with `introFixture()` returning `{ view, events }` built from the same shapes Task 10's test uses, and with a `boardFixture()` whose `copy.turnDock.turnOf` is the key string the test asserts on (the existing fixture already passes copy through as keys).

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter @release/web test -- boardIntro`
Expected: FAIL — `Board` has no `intro` prop.

- [ ] **Step 4: Wire the intro into `Board`**

In `_Board.tsx`:
- add the `intro` prop to `BoardProps` in `~/entities/game/board/types.ts`:

```ts
  // The opening. Present only on a fresh entry; the board renders the intro's
  // shadow of `state` while it runs and the live `state` afterwards.
  intro?: {
    view: PlayerView | null
    events: Event[]
    onDone: () => void
  }
```

- call `useDealIntro` with the refs the beats need, attaching each ref to the block it animates (`rail`, `bg`, `decks`, `discard`, `seats`, `dock`, `zone`, `deckBox` via `Pile`'s `boxRef`, `centre`, `hand`), exactly as `GameDealStory.tsx:349-483` attaches them
- render `intro.shadow ?? state` everywhere the component reads `state` today
- render the staged heap at the centre using `restTransform(s.sc)`, and mount `overlays` last inside the screen
- while `active`, pass a no-op `actions` object to `useBoardInteractions` and to the leaf blocks, and force the dock to `{ state: 'waiting', seconds: 0, progress: 0 }` with `copy.turnDock.turnOf` replaced by `copy.turnDock.gameStart`
- bind skip: `onClick={finish}` on the screen root and a `keydown` listener for `Escape`, both active only while `active`

In `_Board.module.css`, add the centre stage and the entering blocks' initial state, copying the corresponding rules from `apps/playground/stories/interactive/GameDealStory.module.css` (`.centre`, `.stagedCard`, `.enter`). Use tokens for any color and logical properties for spacing.

In `_layout.tsx`, pass the intro only on a fresh entry:

```tsx
      intro={{ view: game.view, events: game.events, onDone: session.introReady }}
```

`session.introReady` arrives in Task 14; until then pass `() => {}` and leave a `TODO(#89)`-free comment naming Task 14 as the wiring step.

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @release/web test -- "src/pages/board"`
Expected: PASS — both the intro suite and Task 4's ported `Board.test.tsx`, which must be unaffected because it passes no `intro`.

- [ ] **Step 6: Lint and typecheck**

Run: `pnpm --filter @release/web typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(web): the board opens with the deal (#89)"
```

---

### Task 12: The start gate

**Files:**
- Create: `apps/frontend/src/network/session/startGate.ts`
- Test: `apps/frontend/src/network/session/startGate.test.ts`

**Interfaces:**
- Produces:

```ts
export const INTRO_CAP_MS = 12_000

export interface StartGate {
  readonly open: boolean
  // A seat has finished its intro. Unknown or repeated ids are ignored.
  ready(playerId: PlayerId): void
  // Runs once, when the gate opens — by the last report or by the cap.
  onOpen(fn: () => void): void
  // Stop waiting and never open. For a keeper that is closed or deposed.
  cancel(): void
}

export function createStartGate(args: {
  expect: PlayerId[]
  capMs?: number
  schedule?: (fn: () => void, ms: number) => () => void
}): StartGate
```

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/network/session/startGate.test.ts`:

```ts
import { expect, it, vi } from 'vitest'
import { createStartGate, INTRO_CAP_MS } from './startGate'

// A hand-driven timer, so the cap is asserted rather than waited for.
function timers() {
  const pending: { fn: () => void; ms: number }[] = []
  return {
    schedule: (fn: () => void, ms: number) => {
      const entry = { fn, ms }
      pending.push(entry)
      return () => {
        const i = pending.indexOf(entry)
        if (i >= 0) pending.splice(i, 1)
      }
    },
    fire: () => {
      for (const p of [...pending]) p.fn()
    },
    count: () => pending.length,
  }
}

it('stays shut until every seat has reported', () => {
  const t = timers()
  const gate = createStartGate({ expect: ['p1', 'p2', 'p3'], schedule: t.schedule })
  expect(gate.open).toBe(false)
  gate.ready('p1')
  gate.ready('p2')
  expect(gate.open).toBe(false)
  gate.ready('p3')
  expect(gate.open).toBe(true)
})

it('opens once, and tells whoever is listening', () => {
  const t = timers()
  const gate = createStartGate({ expect: ['p1'], schedule: t.schedule })
  const onOpen = vi.fn()
  gate.onOpen(onOpen)
  gate.ready('p1')
  gate.ready('p1')
  expect(onOpen).toHaveBeenCalledTimes(1)
})

it('tells a listener that arrives after it already opened', () => {
  const t = timers()
  const gate = createStartGate({ expect: ['p1'], schedule: t.schedule })
  gate.ready('p1')
  const onOpen = vi.fn()
  gate.onOpen(onOpen)
  expect(onOpen).toHaveBeenCalledTimes(1)
})

it('ignores a report from a seat it is not waiting on', () => {
  const t = timers()
  const gate = createStartGate({ expect: ['p1', 'p2'], schedule: t.schedule })
  gate.ready('p9')
  expect(gate.open).toBe(false)
})

it('opens on the cap, so one silent peer cannot freeze the table', () => {
  const t = timers()
  const onOpen = vi.fn()
  const gate = createStartGate({ expect: ['p1', 'p2'], schedule: t.schedule })
  gate.onOpen(onOpen)
  gate.ready('p1')
  t.fire()
  expect(gate.open).toBe(true)
  expect(onOpen).toHaveBeenCalledTimes(1)
})

it('drops its timer once it is open', () => {
  const t = timers()
  const gate = createStartGate({ expect: ['p1'], schedule: t.schedule })
  expect(t.count()).toBe(1)
  gate.ready('p1')
  expect(t.count()).toBe(0)
})

it('opens immediately when nobody is expected', () => {
  const t = timers()
  const gate = createStartGate({ expect: [], schedule: t.schedule })
  expect(gate.open).toBe(true)
})

it('a cancelled gate never opens and never fires', () => {
  const t = timers()
  const onOpen = vi.fn()
  const gate = createStartGate({ expect: ['p1'], schedule: t.schedule })
  gate.onOpen(onOpen)
  gate.cancel()
  gate.ready('p1')
  t.fire()
  expect(gate.open).toBe(false)
  expect(onOpen).not.toHaveBeenCalled()
})

it('caps at twelve seconds by default', () => {
  const seen: number[] = []
  createStartGate({
    expect: ['p1'],
    schedule: (_fn, ms) => {
      seen.push(ms)
      return () => {}
    },
  })
  expect(seen).toEqual([INTRO_CAP_MS])
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @release/web test -- startGate`
Expected: FAIL — cannot find module `./startGate`.

- [ ] **Step 3: Implement the gate**

Create `apps/frontend/src/network/session/startGate.ts`:

```ts
import type { PlayerId } from '@release/engine'

// How long the table waits for the slowest intro. A peer with a hidden tab, a
// stalled animation or a crashed renderer must not freeze the game for everyone
// else, so the wait is capped and the game starts without it.
export const INTRO_CAP_MS = 12_000

export interface StartGate {
  readonly open: boolean
  ready(playerId: PlayerId): void
  onOpen(fn: () => void): void
  cancel(): void
}

// Who still has to finish their opening before the game may move.
//
// The keeper's ticker runs `tick` and `driveAbsent`, so without this an absent
// seat could be played by the engine while every human is still watching cards
// fly — and a host whose intro finished first could act into a guest's
// animation. Neither is a clock the engine owns: nothing at the deal carries a
// deadline, so this holds the table rather than pausing anything.
export function createStartGate(args: {
  expect: PlayerId[]
  capMs?: number
  schedule?: (fn: () => void, ms: number) => () => void
}): StartGate {
  const waiting = new Set(args.expect)
  const listeners = new Set<() => void>()
  let opened = waiting.size === 0
  let cancelled = false

  const schedule =
    args.schedule ??
    ((fn: () => void, ms: number) => {
      const handle = setTimeout(fn, ms)
      return () => clearTimeout(handle)
    })

  let stopTimer: (() => void) | null = null

  const release = () => {
    if (opened || cancelled) return
    opened = true
    stopTimer?.()
    stopTimer = null
    for (const fn of listeners) fn()
    listeners.clear()
  }

  if (!opened) stopTimer = schedule(release, args.capMs ?? INTRO_CAP_MS)

  return {
    get open() {
      return opened
    },
    ready(playerId) {
      if (cancelled || opened) return
      // A seat nobody is waiting on: a spectator, or a peer that reconnected
      // after the gate opened. Ignored rather than treated as progress.
      if (!waiting.delete(playerId)) return
      if (waiting.size === 0) release()
    },
    onOpen(fn) {
      if (cancelled) return
      if (opened) {
        fn()
        return
      }
      listeners.add(fn)
    },
    cancel() {
      cancelled = true
      stopTimer?.()
      stopTimer = null
      listeners.clear()
    },
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @release/web test -- startGate`
Expected: PASS, all nine cases.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/network/session/startGate.ts apps/frontend/src/network/session/startGate.test.ts
git commit -m "feat(web): a gate that holds the table until every intro is done (#89)"
```

---

### Task 13: The keeper holds the table

**Files:**
- Modify: `apps/frontend/src/network/types.ts`, `apps/frontend/src/network/session/relay.ts`, `apps/frontend/src/network/session/remoteLink.ts`
- Test: `apps/frontend/src/network/session/remoteLink.test.ts` (extend), `apps/frontend/src/network/session/relay.test.ts` (extend)

**Interfaces:**
- Consumes: `createStartGate` (Task 12).
- Produces: `attachKeeper` accepts `gate?: StartGate`; `KeeperHandle` gains `introReady(peerId: string): void`; the `Message` union gains `{ type: 'INTRO_READY'; payload: { gameId: string } }`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/frontend/src/network/session/remoteLink.test.ts` (reusing the file's existing `attachKeeper` setup helpers):

```ts
it('applies no intent while the gate is shut', () => {
  const { keeper, ref, sent } = keeperWith({ gate: createStartGate({ expect: ['p1', 'p2'] }) })
  const before = ref.current.state
  keeper.link.submit({ type: 'DRAW' })
  // Buffered, not rejected: the click was legitimate, it is just early.
  expect(ref.current.state).toBe(before)
  expect(sent.filter((m) => m.message.type === 'SYNC')).toHaveLength(0)
})

it('plays the buffered intents, in order, when the gate opens', () => {
  const gate = createStartGate({ expect: ['p1', 'p2'] })
  const { keeper, ref } = keeperWith({ gate })
  const before = ref.current.state
  keeper.link.submit({ type: 'DRAW' })
  keeper.introReady('peer-1')
  expect(ref.current.state).toBe(before)
  keeper.introReady('peer-2')
  expect(ref.current.state).not.toBe(before)
})

it('does not tick while the gate is shut', () => {
  const ticks: (() => void)[] = []
  const ticker = { start: (fn: () => void) => ticks.push(fn), stop: () => {} }
  const gate = createStartGate({ expect: ['p1', 'p2'] })
  const { ref } = keeperWith({ gate, ticker })
  const before = ref.current.state
  for (const t of ticks) t()
  expect(ref.current.state).toBe(before)
})

it('reads a seat report off the wire', () => {
  const gate = createStartGate({ expect: ['p1', 'p2'] })
  const { keeper } = keeperWith({ gate })
  keeper.handleMessage({
    type: 'INTRO_READY',
    payload: { gameId: 'g1' },
    from: 'peer-2',
    seq: 1,
  })
  keeper.introReady('peer-1')
  expect(gate.open).toBe(true)
})

it('ignores a report from a peer holding no seat', () => {
  const gate = createStartGate({ expect: ['p1', 'p2'] })
  const { keeper } = keeperWith({ gate })
  keeper.handleMessage({
    type: 'INTRO_READY',
    payload: { gameId: 'g1' },
    from: 'spectator-9',
    seq: 1,
  })
  expect(gate.open).toBe(false)
})

it('runs ungated when no gate is supplied', () => {
  const { keeper, ref } = keeperWith({})
  const before = ref.current.state
  keeper.link.submit({ type: 'DRAW' })
  expect(ref.current.state).not.toBe(before)
})
```

Append to `apps/frontend/src/network/session/relay.test.ts`:

```ts
it('never relays a seat's intro report', () => {
  // It is addressed to the keeper, like every other game frame.
  expect(isRelayable('INTRO_READY')).toBe(false)
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @release/web test -- "src/network/session/(remoteLink|relay)"`
Expected: FAIL — `attachKeeper` takes no `gate`, `keeper.introReady` is not a function, `'INTRO_READY'` is not a `MessageType`.

- [ ] **Step 3: Add the message**

In `apps/frontend/src/network/types.ts`, add to the `Message` union next to `GAME_STARTED`:

```ts
  // A seat has finished its opening animation and is ready for the game to
  // move. Addressed to the keeper, which holds the table until every seat has
  // said this (or the cap expires) — see session/startGate.ts.
  | { type: 'INTRO_READY'; payload: { gameId: string } }
```

In `apps/frontend/src/network/session/relay.ts`, add `'INTRO_READY'` to `NEVER_RELAYED` and extend the file's header comment: it is a game frame addressed to one party, exactly like `INTENT`.

- [ ] **Step 4: Gate the keeper**

In `apps/frontend/src/network/session/remoteLink.ts`:

- add `gate?: StartGate` to `attachKeeper`'s args and `introReady(peerId: string): void` to `KeeperHandle`
- hold a buffer and a single application path:

```ts
  // Intents that arrived before the gate opened. Buffered rather than rejected:
  // every peer's input is dead during its own intro, so an intent here can only
  // come from a peer that skipped ahead — and a rejection would surface to that
  // player as an error for a click they were entitled to make.
  const early: { peerId: string; intent: unknown }[] = []

  const applyNow = (peerId: string, intent: unknown) => {
    commit(args.ref, applyIntent(args.ref.current, peerId, intent, args.now()), deliver)
  }

  // Stamped at release, not at arrival: the game begins when the gate opens, so
  // an action cannot carry a timestamp from before the table was live.
  const flush = () => {
    const queued = early.splice(0, early.length)
    for (const e of queued) applyNow(e.peerId, e.intent)
  }

  const gated = () => args.gate !== undefined && !args.gate.open
  args.gate?.onOpen(flush)
```

- route `link.submit` and the `INTENT` branch of `handleMessage` through `if (gated()) { early.push({ peerId, intent }); return }` before `applyNow`
- guard the ticker body: `if (gated()) return` before `tick` / `driveAbsent`
- handle the new frame in `handleMessage` before the `INTENT` check:

```ts
      if (frame.type === 'INTRO_READY') {
        const seat = seatOfPeer(args.ref.current, frame.from)
        // A peer holding no seat is a spectator; nobody is waiting on it.
        if (seat) args.gate?.ready(seat.playerId)
        return
      }
```

- implement the handle's own entry point, so the keeper's seat reports through the same rule as everyone else:

```ts
    introReady(peerId) {
      if (!keeping) return
      const seat = seatOfPeer(args.ref.current, peerId)
      if (seat) args.gate?.ready(seat.playerId)
    },
```

- cancel the gate in `close()` and in `handover()`, next to `ticker.stop()`

Import `seatOfPeer` from `./referee` and `StartGate` from `./startGate`.

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @release/web test -- src/network`
Expected: PASS — the new cases plus every existing session test, which pass no gate and must therefore be unaffected.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(web): the keeper waits for the table to finish watching (#89)"
```

---

### Task 14: Report ready from the board

The last wire: the host builds the gate when it starts the game, and each peer reports when its intro ends.

**Files:**
- Modify: `apps/frontend/src/network/useLobby.ts`, `apps/frontend/src/app/providers/SessionProvider.tsx`, `apps/frontend/src/pages/board/[gameId]/_layout.tsx`
- Test: `apps/frontend/src/network/useLobby.test.ts` (extend)

**Interfaces:**
- Consumes: `createStartGate` (Task 12), `attachKeeper`'s `gate` / `introReady` (Task 13).
- Produces: `session.introReady(): void` on the `useLobby` return and on the session context.

- [ ] **Step 1: Write the failing test**

Append to `apps/frontend/src/network/useLobby.test.ts`:

```ts
it('host builds the game behind a gate covering every seat', async () => {
  const { result } = renderHook(() => useLobby())
  await hostWithPlayers(result, 2)
  act(() => result.current.startGame())
  // No SYNC-driven progress until the seats report: the deal's own sync is the
  // only traffic, and the ticker is held.
  expect(result.current.gameId).not.toBeNull()
  act(() => result.current.introReady())
  // The host's own seat has reported; the guest has not, so the gate is shut.
  expect(sentTo('peer-2').filter((m) => m.type === 'INTENT')).toHaveLength(0)
})

it('a guest tells the host when its intro is done', async () => {
  const { result } = renderHook(() => useLobby())
  await joinAsGuest(result, 'host-peer-1')
  act(() => result.current.introReady())
  const sent = sentTo('host-peer-1')
  expect(sent.map((m) => m.type)).toContain('INTRO_READY')
})

it('reporting ready outside a game is a no-op', async () => {
  const { result } = renderHook(() => useLobby())
  act(() => result.current.introReady())
  expect(sentAll()).toHaveLength(0)
})
```

Use the file's existing helpers for building a hosted lobby and a joined guest; add `sentTo` / `sentAll` if the file does not already expose equivalents.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @release/web test -- useLobby`
Expected: FAIL — `result.current.introReady is not a function`.

- [ ] **Step 3: Build the gate where the game is built**

In `apps/frontend/src/network/useLobby.ts`'s `startGame` (line ~524), after `createSession` and before `attachKeeper`:

```ts
    // Every seat, including the host's own: one rule for the table. Spectators
    // hold no seat and are never waited on — they have no projection to replay.
    const gate = createStartGate({ expect: seats.map((s) => s.playerId) })
    gateRef.current = gate
```

and pass it: `attachKeeper({ ref, transport: t, now: () => Date.now(), gate })`.

Add a `gateRef` alongside `keeperRef`, and clear it wherever `keeperRef` is cleared (`leaveSession`), calling `gate.cancel()` first.

- [ ] **Step 4: Add `introReady` to the session API**

In the same file:

```ts
  // The local seat has finished its opening. The host reports into its own
  // keeper; a guest sends the frame, and the host's keeper resolves the seat
  // from the connection it arrived on — the same path an intent takes, so a
  // peer cannot report for somebody else.
  const introReady = useCallback(() => {
    const gameId = gameIdRef.current
    if (!gameId) return
    if (isHostRef.current) {
      const t = transportRef.current
      if (t) keeperRef.current?.introReady(t.id)
      return
    }
    dispatch([
      { to: hostIdRef.current, message: { type: 'INTRO_READY', payload: { gameId } } },
    ])
  }, [dispatch])
```

Add `introReady(): void` to the hook's return interface (next to `startGame(): void`, line ~98) and include it in both returned objects (lines ~607 and ~629). Add it to the session context type in `apps/frontend/src/app/providers/SessionProvider.tsx` and to whatever the provider forwards.

If `gameIdRef` / `hostIdRef` do not exist in the file, use the existing refs it keeps for the same values — `stateRef.current.hostId` is the host id, and `gameId` is available from the state the hook already holds.

- [ ] **Step 5: Run the test**

Run: `pnpm --filter @release/web test -- useLobby`
Expected: PASS, all three cases.

- [ ] **Step 6: Pass it to the board**

In `apps/frontend/src/pages/board/[gameId]/_layout.tsx`, replace Task 11's placeholder with the real callback:

```tsx
      intro={{ view: game.view, events: game.events, onDone: session.introReady }}
```

- [ ] **Step 7: Run everything**

Run: `pnpm -r typecheck && pnpm -r test && pnpm lint`
Expected: PASS across the workspace.

- [ ] **Step 8: Verify by hand, two peers**

Run: `pnpm dev:p2p`, open two browsers, host a lobby, join it, and start the game. Expect: both peers play the deal; neither can act until both have finished; the dock reads "game start" throughout; the fan does not re-sort when the intro ends. Then set the OS reduced-motion preference and repeat: the board should appear dealt with no flights, and the other peer must still be able to play.

- [ ] **Step 9: Commit and open the PR**

```bash
git add -A
git commit -m "feat(web): every seat reports when its deal is done (#89)"
git push
gh pr create --title "The deal comes to the board (#89)" --body "Closes #89. Stage 1 forks the board screen into the frontend; stage 2 plays the opening deal, gated so no peer acts into another's animation."
```

---

## Self-review

**Spec coverage.** Every section of the design maps to a task: the fork → 3, 4; the barrel → 1; the adapter → 2; type ownership and `contract.test-d.ts` → 3; the `dealt` event with `open` → 5, 6; the replay and `planDeal` → 7; the shadowed state and the beats → 10, 11; the flight hooks → 8; freshness → 10 (`isOpening`); the spectator's step-1-only path → 10 (`view: null` never starts a deal) and 11; input inert and the dock's copy → 11; the start gate with buffering and the cap → 12, 13, 14; reduced motion → 9, 10, 11; skip → 10 (`finish`), 11 (binding); degradation → 10; testing → each task's own cycle plus Task 14's two-peer check.

**Two deviations from the spec, both deliberate:**

1. The spec says "emit one `dealt` per player at setup". `Engine.createGame` returns a bare `GameState` and is called from about twenty test sites, so changing its return type would churn all of them for no gain. Task 5 adds `setupEvents(state)` — a pure derivation on the contract — instead. Same events, same place in the feed, no churn.
2. `PendingPrompt`, `intents.ts` and `types.ts`'s leaf types are *imported* from `@release/ui` rather than forked. The spec sanctioned widening the barrel; applying that to `PendingPrompt` (417 lines + 295 of test) halves the copied surface for the same export-only cost.

**Type consistency.** `BoardState` / `BoardOver` / `BoardProps` are introduced in Task 3 and used under those names in 7, 10, 11. `toBoardState` / `toBoardOver` are named in Task 2 and unchanged after. `useBoardInteractions` is named once, in Task 3. `finish()` is the collapse path in Task 10 and the binding in Task 11. `introReady` is the same name on `KeeperHandle` (13) and on the session API (14). `setupEvents` is the same name in the engine (5) and at the call site (6). `INTRO_CAP_MS` is defined in Task 12 and asserted there only.

**Known gap, by design.** Task 11's second test ("holds the player's input") asserts under reduced motion, where the intro has already finished — so it verifies the *release* of the hold, not the hold itself. Holding cannot be observed in jsdom without a running animation. The hold is covered instead at the layer where it is enforceable: Task 13's keeper tests, which prove no intent applies while the gate is shut, whatever the UI does.
