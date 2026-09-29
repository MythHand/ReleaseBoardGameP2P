# Shared Keyboard Bindings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement #119's shared keyboard ownership and priority, including global Space jumps in the lobby runner and regression coverage.

**Architecture:** A registry per browser window owns one capture listener. A React hook maintains named layers with current callbacks and stable activation order. Modal proves the barrier/focus contract first; existing consumers then register their commands, preserving local element handling.

**Tech Stack:** TypeScript, React 19, Vitest/jsdom, Testing Library, pnpm 9.15.0, Node 24; existing CSS Modules and tokens.

**Spec:** [Approved keyboard design](./2026-09-29-keyboard-bindings-design.md). Read it and the root/app `CLAUDE.md` files before execution.

## Global Constraints

- Work from `main` at `47a41b85` on `feat/119-keyboard-bindings`; do not import changes from PR #211/#212.
- "No new dependency or required root provider is added."
- "Bindings match `KeyboardEvent.key`; Space is the literal space character."
- "Named priorities are `screen`, `panel` and `modal`, in increasing order."
- "Repeat is disabled by default"; Tab and the runner's existing ArrowUp behavior explicitly allow repeats.
- "No engine, networking, card rules, staging persistence or card-flight behavior is changed here."
- "Local element activation and navigation remain local."
- "Add an explicit `globalKeys` opt-in on BugRunner" at both lobby mounts; standalone examples stay focused-only.
- Use existing visual tokens and i18n conventions; update both English and Russian runner labels.
- Frontend page tests belong under `__tests__/`; do not edit generated `app/router.ts`.
- Run commands from the repository root with Node 24. On this host: `export PATH=/Users/andreykonnov/.nvm/versions/node/v24.13.0/bin:$PATH`.
- Preserve existing hooks. A sandbox PeerServer port-binding failure requires a permitted rerun, not a product-code workaround.

## Review Focus

- Escape held through a modal's exit must not dismiss the next layer; test repeated events both during exit and after removal in Tasks 1/3.
- Focus on the background runner while a modal is open must not bypass the barrier through the runner's local handler; test outside versus inside targets in Tasks 1/6.
- Stale callbacks, same-priority sibling rerenders and StrictMode cleanup must not reorder ownership or retain listeners; test all three in Task 2.
- Editable descendants, shadow event paths and elements from another window must not be misclassified through global-realm `instanceof`; test in Task 1.
- A controlled drawer can remain open until its parent updates; Escape must report close once per press and leave staged cards intact, including a cancel method that currently declines an in-flight gesture; test in Tasks 4/5.

---

## File structure and dependency order

| Files | Responsibility |
|---|---|
| `apps/ui/src/keyboard/registry.ts`, `registry.test.ts` | Window registry, matching, barriers, ordering, subscription and inspection |
| `apps/ui/src/keyboard/useKeyboardLayer.ts`, `useKeyboardLayer.test.tsx`, `index.ts` | React lifecycle and public keyboard entry |
| `apps/ui/src/index.ts` | Kit exports |
| `apps/ui/src/primitives/Modal/Modal.tsx`, `Modal.module.css`, `Modal.test.tsx` | Modal keys, stack order and focus lifecycle |
| `apps/ui/src/blocks/VideoPlayer/VideoPlayer.tsx`, `VideoPlayer.test.tsx` | Video dismissal |
| `apps/ui/src/table/Table/Table.tsx`, `Table.test.tsx` | Selection and drawer ownership |
| `apps/playground/stories/CardParallaxStory/CardParallaxStory.tsx` | Showcase arrow-key migration |
| `apps/frontend/src/pages/board/[gameId]/_useBoardKeyboard.ts`, `_Board.tsx`, `__tests__/boardKeyboard.test.tsx` | Small Board arbitration hook and real Board integration |
| `apps/ui/src/blocks/BugRunner/BugRunner.tsx`, `BugRunner.test.tsx` | Global opt-in and actual runner keyboard behavior |
| `apps/ui/src/screens/Lobby/Lobby.tsx`, `apps/frontend/src/pages/lobby/_LobbyView.tsx` | Enable global keys in both lobbies |
| `packages/translation/src/locales/{en,ru}/common.json` | Runner control labels |

Execute Tasks 1–3 in order. Tasks 4–6 consume the same API and are reviewed separately; default execution remains sequential to avoid integration churn. Do not restructure the rest of Board or the game simulation.

### Task 1: Registry and event arbitration

**Files:** Create `apps/ui/src/keyboard/registry.ts` and `registry.test.ts`.

**Interfaces:** Produce the following types/functions for Task 2 and Modal. The explicit values are implementation choices for the spec's ordering; they are not CSS z-index values.

```ts
export const KEYBOARD_PRIORITY = { screen: 100, panel: 200, modal: 300 } as const
export type KeyResult = 'handled' | 'pass'
export type KeyFocus = 'non-interactive' | 'any' | ((event: KeyboardEvent) => boolean)
export interface KeyBinding {
  key: string
  run: (event: KeyboardEvent) => KeyResult
  enabled?: boolean // default true
  focus?: KeyFocus // default non-interactive
  repeat?: boolean // default false
  modifiers?: 'none' | 'shift' // default none; shift permits either Shift state
}
export interface KeyboardLayerOptions {
  name: string
  active: boolean
  priority: number
  bindings: readonly KeyBinding[]
  blockBelow?: boolean
  root?: () => HTMLElement | null
}
export interface KeyboardLayerState {
  isTopOfPriority: boolean
  stackIndex: number // compact oldest-to-newest peer rank; -1 when inactive
}
export interface KeyboardLayerHandle {
  mount(options: KeyboardLayerOptions): () => void
  update(options: KeyboardLayerOptions): void
  subscribe(listener: () => void): () => void
  getSnapshot(): KeyboardLayerState
}
export interface KeyboardLayerInfo {
  name: string
  keys: readonly string[]
  priority: number
  activationOrder: number
  blockBelow: boolean
}
export interface KeyboardRegistry {
  createLayer(): KeyboardLayerHandle
  inspect(): readonly KeyboardLayerInfo[]
  topRoot(priority: number): HTMLElement | null
}
export function getKeyboardRegistry(owner: Window): KeyboardRegistry
export function isKeyboardControl(event: KeyboardEvent): boolean
```

- [ ] **Step 1: Write failing registry tests.** Use actual cancelable/bubbling `KeyboardEvent`s against DOM targets and callback spies. The assertions below name the required independent cases; setup creates the described layers through the interfaces above.

```ts
// modal outranks panel and screen regardless of mount order
expect(calls).toEqual(['modal']); expect(event.defaultPrevented).toBe(true)
// explicit pass from panel, then screen handles
expect(calls).toEqual(['panel', 'screen'])
// modal removes itself and handles: the current press still stops there
expect(calls).toEqual(['modal'])
// repeated matching Escape: no action, no fallback
expect(calls).toEqual([]); expect(event.defaultPrevented).toBe(true)
// editable child/shadow path/foreign-window input: leave input alone
expect(calls).toEqual([]); expect(event.defaultPrevented).toBe(false)
// modal barrier + Space inside dialog: native/local input survives
expect(backgroundJump).not.toHaveBeenCalled(); expect(event.defaultPrevented).toBe(false)
// same key outside dialog: prevent native/local background activation
expect(backgroundJump).not.toHaveBeenCalled(); expect(event.defaultPrevented).toBe(true)
```

Also pin one native capture listener while multiple layers are active, removal after the last cleanup, inactive/disabled skips, same-priority last activation, callback updates preserving order, Tab/Shift+Tab policy, forbidden modifiers, `isComposing`, legacy `keyCode === 229`, already-prevented events, separate windows, immutable event-dispatch membership and callback-free inspection data. Each test closes its handles/iframe and restores spies.

- [ ] **Step 2: Run red.** `pnpm --filter @release/ui exec vitest run src/keyboard/registry.test.ts` must fail because the registry is absent, then retain failing behavioral assertions as functionality is built.
- [ ] **Step 3: Implement the registry contract.** Use a lazy `WeakMap<Window, KeyboardRegistry>`. Keep handles stable: physical effect detach/remount retains that handle's activation order; an actual `active: false -> true` transition gives it a new order. Snapshot dispatch entries before callbacks. Check barrier membership using the root and event path; suppress a blocked shortcut outside the modal before focus filtering could let a local runner consume it. Inside the modal, stop registry traversal without cancelling ordinary input. Avoid global-realm element checks and `window` access at import time. Cache snapshot objects until rank changes.
- [ ] **Step 4: Run green.** The command from Step 2 passes; `pnpm --filter @release/ui typecheck` passes. Verify no callbacks or input values appear in `inspect()`.
- [ ] **Step 5: Commit.** Stage only the two task files; `git commit -m 'feat: add prioritized keyboard registry (#119)'`.

### Task 2: React lifecycle hook and exports

**Files:** Create `apps/ui/src/keyboard/useKeyboardLayer.ts`, `useKeyboardLayer.test.tsx`, `index.ts`; modify `apps/ui/src/index.ts`.

**Interfaces:** Consume Task 1. Produce `useKeyboardLayer(options: KeyboardLayerOptions, owner?: Window): KeyboardLayerState`; default to the current window when it exists. Export hook, option/binding/result/state types, priorities and `isKeyboardControl` through the keyboard entry and kit barrel. Registry access remains available from its leaf module for Modal and diagnostics.

- [ ] **Step 1: Write failing hook tests.** Use Testing Library `renderHook` and sibling components, including a `<StrictMode>` wrapper. After rerendering A while B is the newer active sibling, assert `calls === ['B']`; after replacing B's callback, assert `calls === ['B-new']`; after disabling/re-enabling A, assert `calls === ['A']`. Assert exactly one callback per physical key in StrictMode, compact ranks `0,1 -> 0`, no listener after final unmount, and a stable `getSnapshot()` reference for unchanged stack metadata. Unbound keys must still reach a local React `onKeyDown`.
- [ ] **Step 2: Run red.** `pnpm --filter @release/ui exec vitest run src/keyboard/useKeyboardLayer.test.tsx` fails for the missing hook.
- [ ] **Step 3: Implement the hook and exports.** Retain one handle per mount/window, update options in layout effects so handlers see committed values, and subscribe with `useSyncExternalStore`. Supply a stable inactive server snapshot without reading browser globals during module import. Cleanup detaches the handle; ordinary callback updates do not remount it. The hook must not introduce render-time registration side effects.
- [ ] **Step 4: Run green.** `pnpm --filter @release/ui exec vitest run src/keyboard` and `pnpm --filter @release/ui typecheck` both pass.
- [ ] **Step 5: Commit.** Stage the hook, its test and both export files; `git commit -m 'feat: expose stable keyboard layers to React (#119)'`.

### Task 3: Modal proves ownership, focus and barriers

**Files:** Modify `apps/ui/src/primitives/Modal/Modal.tsx`, `Modal.module.css`, `Modal.test.tsx`.

**Interfaces:** Consume the hook at `KEYBOARD_PRIORITY.modal`, `active: mounted`, `blockBelow: true`, `root: () => dialogRef.current`. Use `getKeyboardRegistry(window).topRoot(KEYBOARD_PRIORITY.modal)` for permitted focus restoration after removal. Public Modal props stay unchanged.

- [ ] **Step 1: Add failing integration tests around real Modal instances and a lower registered screen action.** Assert:

```ts
// Escape in dialog and after moving focus to the backdrop
expect(topClose).toHaveBeenCalledTimes(1); expect(screenCancel).not.toHaveBeenCalled()
// first modal rerenders while second is open
expect(firstClose).not.toHaveBeenCalled(); expect(secondClose).toHaveBeenCalledTimes(1)
// exit is 380ms: neither repeat nor a fresh press cascades during exit
expect(screenCancel).not.toHaveBeenCalled()
// Shift+Tab and Tab wrap, including when focus was outside
expect(document.activeElement).toBe(expectedFocusable)
// remove the captured trigger, or close a lower modal while another remains
expect(remainingDialog.contains(document.activeElement)).toBe(true)
```

Include reopening an older sibling above a newer one (computed stack rank follows the active owner), an all-disabled/no-tabbable dialog fallback, ordinary Space/button and text input inside the dialog, and held Escape after the upper modal has fully unmounted. Keep existing focus/ARIA tests.

- [ ] **Step 2: Run red.** `pnpm --filter @release/ui exec vitest run src/primitives/Modal/Modal.test.tsx` must reproduce multiple dismissal/background handling or missing stack behavior before migration.
- [ ] **Step 3: Replace Modal's native listener.** Escape uses `focus: 'any'` and invokes close only when `open`; Tab uses `focus: 'any'`, `repeat: true`, `modifiers: 'shift'`. Keep its manual focus cycle, including dialog fallback. Only `isTopOfPriority` may move/trap focus. Set a CSS custom property for the compact stack index and derive overlay z-index from `var(--z-modal)`; keep the existing 380ms mount lifetime/visual timing. Restore focus after registry removal, not inside the timer before React commits removal. Do not let lower-modal effects override current top-modal focus.
- [ ] **Step 4: Run green.** Run the Modal and keyboard suites together, then UI typecheck and stylelint. Check no direct Modal `window.addEventListener('keydown', ...)` remains.
- [ ] **Step 5: Commit.** Stage the three Modal files; `git commit -m 'fix: give the top modal exclusive keyboard ownership (#119)'`.

### Task 4: Migrate kit screen commands and the showcase

**Files:** Modify `apps/ui/src/blocks/VideoPlayer/VideoPlayer.tsx`, `apps/ui/src/table/Table/Table.tsx`, `Table.test.tsx`, `apps/ui/src/blocks/Chat/Chat.test.tsx`, `apps/playground/stories/CardParallaxStory/CardParallaxStory.tsx`; create `apps/ui/src/blocks/VideoPlayer/VideoPlayer.test.tsx`.

**Interfaces:** Consume `useKeyboardLayer`. Table exposes no new props: panel close still calls `onPanelChange(null)` and only updates `ownPanel` when uncontrolled. Drawer is not modified. Video uses its existing close action.

- [ ] **Step 1: Write failing tests.** Table: create a real target selection, open its history drawer, press Escape, assert drawer closes while the arrow/selection stays; press again and assert selection clears without `onPlay`. In controlled mode assert `onPanelChange` receives `null` once, the drawer remains until parent rerender, and no selection cancels. Video: open it, open a Modal above it, press Escape and assert only Modal closes; after Modal exit, another Escape closes video. In the existing Chat multiline regression, assert `onSend` has zero calls immediately after Shift+Enter and exactly one call after Enter. Keep the existing sent-text assertion.
- [ ] **Step 2: Run red.** `pnpm --filter @release/ui exec vitest run src/table/Table/Table.test.tsx src/blocks/VideoPlayer/VideoPlayer.test.tsx src/blocks/Chat/Chat.test.tsx` fails at the new precedence/drawer assertions.
- [ ] **Step 3: Migrate consumers.** Table registers screen Escape for selection and panel Escape while `panel !== null`; both opt into controls. Video registers panel Escape while open. CardParallaxStory registers screen ArrowUp/ArrowDown with repeats enabled; a custom focus predicate permits its own card-rail controls while preserving editable/other control input. Retain the existing route calculation and limit behavior. Remove only the replaced global listeners; preserve local Menu/Card/Seat/ReleaseZone/Chat logic.
- [ ] **Step 4: Run green and verify navigation.** Run Step 2, UI and playground typechecks. In the existing local CardParallax showcase, check both arrows on page/own rail, boundary cards, an editable technical control, and navigation away/back without duplicate actions. Record this as browser verification, not an automated test.
- [ ] **Step 5: Commit.** Stage only Task 4 files; `git commit -m 'refactor: route kit screen keys through shared layers (#119)'`.

### Task 5: Board Escape has one explicit decision path

**Files:** Create `apps/frontend/src/pages/board/[gameId]/_useBoardKeyboard.ts` and `__tests__/boardKeyboard.test.tsx`; modify `_Board.tsx`.

**Interfaces:** Consume the shared hook. Produce the following small page-local hook, keeping the arbitration independently testable without mocking the keyboard layer:

```ts
interface BoardKeyAction { active: boolean; run: () => void }
interface BoardKeyboardOptions {
  panel: BoardKeyAction
  defense: BoardKeyAction
  staged: BoardKeyAction
  opening: BoardKeyAction
}
export function useBoardKeyboard(options: BoardKeyboardOptions): void
```

- [ ] **Step 1: Write failing hook and real-Board tests.** `renderHook` supplies all actions active: first Escape calls only panel; after panel deactivates, only defence; then staged; then opening. Assert an active cancellation whose `run` intentionally does nothing still prevents opening skip. Real Board tests use `makeBoardProps` and actual pull gestures from `boardStaging.test.tsx`: drawer close preserves the staged card; the next Escape returns it. Test controlled `onPanelChange`, staged defence, dispatched guards and Escape with a focused chat field. Reuse `introFixture` for opening-only skip and retain all existing staging/defence suites.
- [ ] **Step 2: Run red.** `pnpm --filter @release/web exec vitest run 'src/pages/board/[gameId]/__tests__/boardKeyboard.test.tsx'` fails for missing arbitration or wrong precedence.
- [ ] **Step 3: Implement the hook and wire Board.** Register one panel Escape and one screen Escape. Screen action order is defence, staged play/cost, opening; once an active action is chosen, return `handled` regardless of its internal no-op guard. Compute `active` in Board from the exact conditions of the three replaced effects (including `answering`, dispatched phase and cost options). Keep `toggle`/controlled closing semantics; remove the three old global effects without changing staging or intro modules.
- [ ] **Step 4: Run green.** Run `pnpm --filter @release/web exec vitest run 'src/pages/board/[gameId]/__tests__/boardKeyboard.test.tsx' 'src/pages/board/[gameId]/__tests__/boardStaging.test.tsx' 'src/pages/board/[gameId]/__tests__/boardDefense.test.tsx' 'src/pages/board/[gameId]/__tests__/boardIntro.test.tsx'` and frontend typecheck; all pass. The hook-only overlap test proves the priority race, while Board integration tests prove the wiring.
- [ ] **Step 5: Commit.** Stage the three Task 5 files; `git commit -m 'fix: arbitrate Board Escape actions by active layer (#119)'`.

### Task 6: Lobby Space and real runner regressions

**Files:** Modify `apps/ui/src/blocks/BugRunner/BugRunner.tsx`, `apps/ui/src/screens/Lobby/Lobby.tsx`, `apps/frontend/src/pages/lobby/_LobbyView.tsx`, `packages/translation/src/locales/en/common.json`, `packages/translation/src/locales/ru/common.json`; create `apps/ui/src/blocks/BugRunner/BugRunner.test.tsx`.

**Interfaces:** Add `globalKeys?: boolean` to `BugRunnerProps`, default false. The global layer uses screen priority with Space (repeat false) and ArrowUp (repeat true), both calling the existing `act`. Pointer and simulation interfaces remain unchanged.

- [ ] **Step 1: Write failing component tests.** Render the real runner with controlled RAF/performance time, deterministic obstacle randomness and a canvas context spy; retain the real `game.ts` functions. Observe the bug's drawn vertical position and visible score rather than merely counting an action callback. Prove:

```ts
// global Space starts and lifts the bug after advancing a frame
expect(scoreNode).not.toBeNull(); expect(bugTopAfter).toBeLessThan(bugTopBefore)
// return to ground, then a repeated Space cannot jump; fresh Space can
expect(topAfterRepeat).toBe(groundTop); expect(topAfterFreshPress).toBeLessThan(groundTop)
// accepted global Space cancels scroll
expect(spaceEvent.defaultPrevented).toBe(true)
// textbox/editable child/button, modifiers, IME and open Modal do not start it
expect(scoreNode).toBeNull()
// two focused-only previews: focus first and press Space
expect(firstScoreNode).not.toBeNull(); expect(secondScoreNode).toBeNull()
```

Also drive a real collision and assert restart fails before the existing 400ms guard and succeeds afterward, focused/global dispatch does not combine into two actions, Pointer/Enter still work, ArrowUp keeps its repeat policy, modal input receives Space, and forced focus on the background runner cannot bypass the modal barrier. Restore RAF, timers, canvas and geometry mocks after each test.

- [ ] **Step 2: Run red.** `pnpm --filter @release/ui exec vitest run src/blocks/BugRunner/BugRunner.test.tsx src/blocks/BugRunner/game.test.ts` fails on missing global Space/opt-in behavior.
- [ ] **Step 3: Implement input wiring.** Replace the runner's native ArrowUp listener with the layer. The local Space handler must also ignore repeat/modifiers/composition, including legacy IME; keep native/control filtering on the global path so the focused runner acts only locally. Enable `globalKeys` at both lobby mounts. Preserve `game.ts` unchanged. Set the locale label to `Mini-game: click or press Space / ↑ to jump` and `Мини-игра: нажмите мышью, Space или ↑, чтобы прыгнуть`.
- [ ] **Step 4: Run green.** Run Step 2, the UI Modal/Chat tests and both frontend/UI typechecks. Browser-check the actual lobby + chat: Space starts/jumps without canvas focus, typed spaces remain text, opening Rules blocks the runner, closing Rules restores global input.
- [ ] **Step 5: Commit.** Stage only Task 6 files; `git commit -m 'fix: enable lobby Space jumps through shared keyboard bindings (#119)'`.

## Final verification and draft PR

- [ ] Run the full `pnpm test`, `pnpm lint`, `pnpm typecheck` and `pnpm build` on the final tree. Record exact results and any baseline/environment limitation. Do not reuse PR #212's previous counts for this implementation.
- [ ] Search with `rg -n 'addEventListener.*key(down|up)' apps packages --glob '!*.test.*'`. Expected: all migrated window `keydown` bindings are owned by the registry; investigate any other match rather than mechanically removing local handlers.
- [ ] Complete browser evidence on local Modal/nested Modal, lobby/chat/runner, Table/Board drawer-selection and CardParallax flows. Check ordinary button/keyboard activation and no unexpected page scroll. Use existing playground areas and debug scenarios; do not add a new demo subsystem.
- [ ] Request a whole-branch review against `origin/main` after tests pass; resolve concrete findings and rerun affected checks. For native execution, this is the independent review gate; subagent execution additionally reviews each task.
- [ ] Confirm clean status, intended commits and the current remote `main` base. Name the repository/branch before pushing. Publish `feat/119-keyboard-bindings` as a new draft PR targeting `main`, with `Closes #119`, actual scope and verification. Attach the created PR to this task. Do not push to the old animation branch or reopen PR #212.

## Execution handoff

The written spec is approved; this plan is pending review and execution selection.
Recommend **native execution** in this session: six tasks share a small evolving
registry interface and the crucial Modal contract, so keeping implementation
context together avoids repeated interface handoffs. Finish with an independent
whole-branch review. Subagent-driven execution is available if the user prefers
a fresh implementer/reviewer gate for every task despite the extra context cost.
