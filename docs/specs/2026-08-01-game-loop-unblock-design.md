# Unblocking the game loop — Design

Three defects make the merged result of [#64](https://github.com/MythHand/ReleaseBoardGameP2P/pull/64) + [#65](https://github.com/MythHand/ReleaseBoardGameP2P/pull/65) unplayable past the first card. This closes them. Evidence and the wider survey: [`2026-08-01-game-screen-gap-audit.md`](./2026-08-01-game-screen-gap-audit.md).

**Goal:** a game started from the lobby can be played to a winner — cards played, pendings answered, attacks defended, a result shown.

Branch: `game-logic-git-operations`, cut from `game-page-wiring`. A merge train is acceptable, so this does not wait on #64 or #65 merging.

## What is broken

All three are tasks the plans specify and [#65](https://github.com/MythHand/ReleaseBoardGameP2P/pull/65) reports as landed. They did not land.

1. **No pending prompt renders.** `Table.tsx:349` gates the prompt on `copy.pending` and `:340` gates the window's unpass on `copy.window`; neither key exists in either catalog. Playing a Release opens a `discardForRelease` pending that can never be answered, and `reduce.ts:35` then rejects every subsequent action with `a decision is pending`. An attacked player likewise cannot defend.
2. **No game can visibly end.** `toTableState` drops `PlayerView.over`; the page passes neither `over` nor `onOverContinue`.
3. **The countdown is frozen.** `Table.tsx:122` holds `useRef(0)` as a placeholder for a clock the consumer was supposed to supply, and `TableProps` has no `now`.

## Changes

### 1. Pending and window copy

Add a `pending` block to both catalogs matching `PendingPromptCopy` (`PendingPrompt.tsx:17`) — `confirm`, `decline`, and a `{ prompt, action }` pair for each of the seven pending kinds — and a `window` block matching `WindowCopy` (`:38`), a single `unpass`. Bind both from the board page's `copy` prop.

**`pending` and `window` become required on `TableCopyBundle`.** They are optional today, which is exactly why the page compiled while the prompt silently never rendered — the omission was invisible to the typechecker and to every test. Making them required deletes the kit's fallback branch and turns the same mistake into a typecheck failure. The playground supplies literals through its own fixtures and is unaffected.

### 2. The game-over path

`toTableState` maps `PlayerView.over` to `TableOver` — a rename, `winner` → `winnerId`, `condition` passed through. The page passes `over` and an `onOverContinue` that navigates to `/board/:gameId/stats`, already a child route of the board layout's `Outlet`.

`Stats` renders an empty result table until [#19](https://github.com/MythHand/ReleaseBoardGameP2P/issues/19) computes per-player statistics — the engine produces none today. Landing on a real, empty route is chosen over dismissing the overlay to nothing: the route is the designed flow, and its `toLobby` action already works.

### 3. The clock

`TableProps` gains `now?: number`. `Table.tsx`'s `nowRef` is deleted and `deriveDock` reads the prop.

The board page supplies it from a hook that runs an interval **only while something is counting down** — a reaction window is open, or a pending carries a deadline. When nothing is, the interval is stopped and the hook returns its last sampled value, which no consumer reads: `deriveDock` uses `now` only for deadline arithmetic, and with no deadline there is none to do. Unconditional ticking would re-render the whole table several times a second for the entire game to animate a ring that is usually not on screen.

The playground's story supplies `Date.now()` the same way.

**Rejected:** a prop-gated `useEffect` inside `Table`. Less wiring at both call sites, but it puts a timer in `@release/ui`, which the plan's global constraints forbid so the kit stays renderable in a test without fake timers.

## Testing

Every new test is verified by mutation — break the code the test names, confirm it goes red, restore. The defects being fixed here are precisely the kind that ship green: `PendingPrompt` carries 160 lines of passing tests and has never rendered in the application.

The tests that would have caught each defect, and so are the ones to write:

1. A board-page test that plays a Release and asserts the prompt appears — at the page level, against the real catalogs, not with fixture literals. The existing prompt tests pass because they inject their own copy.
2. A board-page test that a projection carrying `over` renders the winner.
3. An adapter test for the `over` mapping, and a dock test that a supplied `now` moves the sweep.

## Definition of done

A two-peer browser game reaches a winner: both peers dealt, a Release played and its discard cost paid, an attack thrown and defended inside a visibly counting window, and the game-over overlay shown to both seats. This is the acceptance gate both prior plans set and neither met.

`pnpm typecheck && pnpm lint && pnpm test` green.

## Not here

The rest of the audit — the invisible Code Review protection, silent rejected actions, the unbound drawer, the sudo attack that cannot enter a reaction window, session lifecycle ([#58](https://github.com/MythHand/ReleaseBoardGameP2P/issues/58)), animations ([#23](https://github.com/MythHand/ReleaseBoardGameP2P/issues/23)), and [#61](https://github.com/MythHand/ReleaseBoardGameP2P/issues/61)'s card effects.

Task 12 of [`2026-07-31-table-interaction-plan.md`](./2026-07-31-table-interaction-plan.md) — the solo-playable `TableStory` — stays open. It was milestone 2's acceptance gate and these three defects are the class it existed to catch, but it is a playground affordance and the game does not wait on it.
