# Final fix report — issue #104

## Scope and result

Completed all seven findings from `final-fix-brief.md` in one fix wave based on
`964d5c70bbf6ac5a114bd338f3a4b61cb164c1d1`. The wave keeps PR #126 behavior and every
adjudicated non-scope item unchanged. No dev server was started. The untracked implementation plan
remains unchanged and unstaged.

## Per-finding RED → GREEN evidence

### 1. Same-commit local/keeper handoff

Files:

- `apps/frontend/src/features/board-beats/handLimitBeat.tsx`
- `apps/frontend/src/pages/board/[gameId]/__tests__/boardHandLimit.test.tsx`

The new Board integration makes `onResolve` synchronously rerender the accepted state/events in the
same turn. It requires the standing local grid to be adopted, the discard exit to receive `d10` and
`d11`, and the grid eventually to release.

- RED command: `pnpm --filter @release/web exec vitest run
  "src/pages/board/[gameId]/__tests__/boardHandLimit.test.tsx" -t "hands off when onResolve
  synchronously advances to the accepted projection" --no-file-parallelism`
- RED result: 1 failed. The fallback build path raised `hl10` (`flights.raises` was `[["hl10"]]`)
  instead of adopting with no raise.
- Fix: preserve an early non-null handoff, then after `nextFrames()` resolve
  `earlyHeld ?? latest.current.handoff?.current` before choosing adopt/build.
- GREEN result: 1 passed, 18 skipped. No fallback raise, correct two exit items, and eventual grid
  removal were all observed.

### 2. Fan interaction during carry-back arrival

Files:

- `apps/ui/src/table/Hand/Hand.tsx`
- `apps/ui/src/table/Hand/Hand.test.tsx`
- `apps/frontend/src/pages/board/[gameId]/_Board.tsx`
- `apps/frontend/src/pages/board/[gameId]/__tests__/boardHandLimitBack.test.tsx`

Two levels of coverage pin the ownership rule: the UI kit must not initiate a drag while `carrying`,
and Board must keep a two-card fan in order when a reorder gesture is attempted while a returned
card is still in its placement arrival.

- RED commands:
  - `pnpm --filter @release/ui exec vitest run src/table/Hand/Hand.test.tsx
    --no-file-parallelism`
  - `pnpm --filter @release/web exec vitest run
    "src/pages/board/[gameId]/__tests__/boardHandLimitBack.test.tsx" -t "keeps the fan order inert
    while a placement arrival owns the returned card" --no-file-parallelism`
- RED results: the Hand test saw one slot lifted instead of two remaining; the Board test likewise
  lost the first visible fan card during the attempted reorder.
- Fix: `Hand` now makes drag mode conditional on `!carrying`; Board coherently withholds both
  `onPlay` and `onReorder` while the hand-limit carry owns the pointer.
- GREEN results: UI 1/1 passed; Board 1 passed, 6 skipped. The visible order remains protection,
  hotfix until the return commits, then becomes protection, hotfix, attack.

### 3. Unknown card in a malformed build plan

Files:

- `apps/frontend/src/features/board-beats/handLimitBeat.tsx`
- `apps/frontend/src/features/board-beats/handLimitBeat.test.tsx`

- RED command: `pnpm --filter @release/web exec vitest run
  src/features/board-beats/handLimitBeat.test.tsx -t "never raises or exits an unknown catalogue
  card from a malformed build plan" --no-file-parallelism`
- RED result: 1 failed. The malformed card was raised (`hl4`) alongside the valid `hl5` card.
- Fix: resolve `cardById` before an entry can join `flying`; store the proven card and original slot
  in that entry; remove the exit cast and later catalogue lookup.
- GREEN result: 1 passed, 10 skipped. Only `hl5` is raised/exited, with the original layer `1`.

### 4. Partial adopted measurement

Files:

- `apps/frontend/src/features/board-beats/handLimitBeat.tsx`
- `apps/frontend/src/features/board-beats/handLimitBeat.test.tsx`

- RED command: `pnpm --filter @release/web exec vitest run
  src/features/board-beats/handLimitBeat.test.tsx -t "falls through to the whole projection when
  one adopted cell cannot be measured" --no-file-parallelism`
- RED result: 1 failed. One measurable card was sent as a partial exit when the other cell returned
  no rect.
- Fix: measure the complete claimed set before constructing exit items. If any rect is missing,
  keep the whole standing grid for `GATHER_HOLD`, release it once as a unit, and let the accepted
  projection take over without any partial send.
- GREEN result: 1 passed, 11 skipped. No raise and no exit item occur; release happens once after
  the hold.

### 5. Locked grid still advertises pickup

Files:

- `apps/frontend/src/pages/board/[gameId]/_Board.tsx`
- `apps/frontend/src/pages/board/[gameId]/_Board.module.css`
- `apps/frontend/src/pages/board/[gameId]/__tests__/boardHandLimit.test.tsx`

- RED command: `pnpm --filter @release/web exec vitest run
  "src/pages/board/[gameId]/__tests__/boardHandLimit.test.tsx" -t "stops advertising a grid card
  as grabbable once the choice is dispatched" --no-file-parallelism`
- RED result: 1 failed. Even the enabled card had no stable state marker (`data-grabbable` was
  `null`), so styling could not distinguish enabled from locked.
- Fix: enabled cells expose `data-grabbable="true"` and a mouse-down handler; dispatched cells
  expose neither. Pointer events, grab cursor, hover lift, and reduced-motion transition rules are
  scoped to the enabled marker.
- GREEN result: 1 passed, 19 skipped. The first placed card advertises enabled state; both filled
  cells lose it on dispatch.

### 6. Reset-safe runner continuations

Files:

- `apps/frontend/src/features/board-beats/handLimitBeat.tsx`
- `apps/frontend/src/features/board-beats/handLimitBeat.test.tsx`

The regression resets an adopted run during `GATHER_HOLD` and requires that the old match never
later releases the grid or calls the discard exit.

- RED command: `pnpm --filter @release/web exec vitest run
  src/features/board-beats/handLimitBeat.test.tsx --no-file-parallelism`
- RED result: 12 passed, 1 failed. The stale continuation called `handoff.release()` once.
- Fix: each run captures a generation; reset increments it before retaining the existing exit/flyer
  cleanup. The run checks staleness after every await and immediately before release/send work,
  including the missing-geometry fallback and each build movement.
- GREEN result: 13/13 passed. Reset during hold produces no release and no send; the existing
  visual-cleanup test still proves both carrier systems are reset.

### 7. Design corrections

File:

- `docs/specs/2026-08-28-board-hand-limit-design.md`

This is prose rather than runtime behavior, so no executable test was appropriate.

- Before: the document stated `w / CARD_RATIO` and described an adopted exit using `node`.
- After: it states `w * CARD_RATIO`; the handoff is sampled into measured, axis-aligned viewport
  `from` rectangles, and both adopted and built exits use those rectangles without retaining or
  passing a live DOM node.
- Check: `rg -n "w \* CARD_RATIO|axis-aligned.*from|useDiscardExit.*from"
  docs/specs/2026-08-28-board-hand-limit-design.md` found the corrected statements at lines 122,
  175, 214, and 223.

## Final verification

Passed on the final worktree:

- Focused beat: `pnpm --filter @release/web exec vitest run
  src/features/board-beats/handLimitBeat.test.tsx --no-file-parallelism` — 1 file, 13 tests.
- Focused Board: `pnpm --filter @release/web exec vitest run
  "src/pages/board/[gameId]/__tests__/boardHandLimit.test.tsx"
  "src/pages/board/[gameId]/__tests__/boardHandLimitBack.test.tsx" --no-file-parallelism` — 2
  files, 27 tests.
- Focused Hand: `pnpm --filter @release/ui exec vitest run src/table/Hand/Hand.test.tsx
  --no-file-parallelism` — 1 file, 1 test.
- Board regressions: `pnpm --filter @release/web exec vitest run
  "src/pages/board/[gameId]/__tests__" --no-file-parallelism` — 21 files, 210 tests.
- Full frontend: `pnpm --filter @release/web exec vitest run --no-file-parallelism` — 74 files,
  714 tests.
- Non-web: `pnpm --filter '!@release/web' -r test` — peerserver 2 files / 6 tests, engine 28 files
  / 342 tests, UI 21 files / 141 tests, playground 1 file / 3 tests; translation has no tests and
  exits successfully with `--passWithNoTests`.
- `pnpm typecheck` — all seven participating workspace projects passed.
- `pnpm lint` — Biome and every participating Stylelint check passed.
- `git diff --check` — passed.

## Review decisions and concerns

- The one-missing-of-many adopted geometry outcome is deliberately all-card: the grid remains
  legible for its normal hold and then yields wholesale to already-authoritative projection state.
- Malformed build entries are skipped individually without compacting later slot/layer geometry.
- Reset may occur after the run has published its temporary shadow; queue/match reset owns restoring
  projection state. The generation guard prevents every later animation handoff from the stale run.
- The first Board-regression attempt had one unrelated fixed-real-time failure in
  `boardIntro.test.tsx` (0 callbacks at its 9-second boundary; the other 209 tests passed). That test
  passed immediately in isolation, and the complete Board group then passed 210/210 on rerun.
- The first non-web attempt was sandbox-blocked only by peerserver `listen EPERM 0.0.0.0`; the
  identical command passed with approved ephemeral local-port permission.
- Vite prints existing esbuild-option deprecation warnings, and the full frontend suite prints its
  existing jsdom `HTMLMediaElement.play()` notice. Neither produced a failing test.
- PR #126 behavior, `data-grid-card={held.uid}`, issue #19 match identity, keyboard/deadline debt,
  and the duplicated backlog block were not changed.
- No blocking concern remains.
