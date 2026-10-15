# Bot Board Pacing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every player readable bot actions, full decision time after presentation, and the same relative seating circle.

**Architecture:** The keeper issues presentation revisions and waits for connected human seats to acknowledge committed board presentation. New decision clocks await that presentation; bot actions additionally obey a two-second minimum. Shared Board animation queues remain the presentation authority.

**Tech Stack:** TypeScript, React 19, Vitest, PeerJS/WebRTC, pnpm 9, Node >=24, existing UI/animation modules.

**Spec:** [Approved design](./2026-10-15-bot-board-pacing-design.md). Read the spec and the applicable CLAUDE.md files before execution.

## Global Constraints

- There are at least 2,000 ms between successive bot actions.
- Each presentation wait expires 12,000 ms after the host sends that state.
- Disconnect removes a player from that wait immediately. Spectators never block progress.
- A newly established decision clock starts with its full existing duration after presentation acknowledgement or the presentation cap.
- A player whose own presentation is complete may act before the collective wait ends.
- Rejected intents, retransmissions, and duplicate acknowledgements do not reset the cap or bot interval.
- Keep the 250 ms ticker; gate unattended actions separately.
- Preserve private event filtering, rejection handling, sequential shadows, stable IDs, and existing shared animation modules.
- Keep #225 target policy, #228 clock-offset correction, and #143 hidden-tab recovery outside this change.
- Use CSS Modules/design tokens, Typography, English source comments, and both translation catalogs. No new dependencies.
- Branch: `fix/226-bot-board-pacing`. Do not change unrelated dirty files or publish without stating repository, branch, and action.

## Review Focus

- A stale ACK from a former connection or keeper must not release the current wait (Tasks 2, 3, 6).
- A SYNC that arrives before React folds events must not be acknowledged as already presented (Tasks 3, 4).
- A prompt awaiting input must not wait for that input before its clock starts (Tasks 1, 4).
- An early accepted human action must invalidate the old clock activation without resetting unrelated active windows (Tasks 1, 3).
- Reload during waiting or active timing must not grant repeated presentation caps or fresh decision allowances (Task 6).

## File and interface map

New modules:
- `packages/engine/src/fake/presentationClock.ts`: pure helpers for identifying newly established clocks, holding them, and activating held clocks.
- `apps/frontend/src/network/session/presentationGate.ts`: pure presentation identity/wait/pacing state machine; no React or transport.
- `apps/frontend/src/features/board-beats/usePresentationAck.ts`: committed Board completion reporting; no engine mutation.

Existing owners:
- Engine `state.ts`, `view.ts`, `fake/reduce.ts`, `fake/window.ts`, `fake/project.ts`, `fake/index.ts`: timing phases, expiry guards, projection, exports.
- Session `referee.ts`, `link.ts`, `remoteLink.ts`: publish revisions, drive clocks/bots, accept acknowledgements.
- Network `types.ts`, `envelope.ts`, `useLobby.ts`, `session/syncSnapshot.ts`: wire shape, routing, accumulated metadata, lifecycle.
- `features/play-game/useGame.ts`, `entities/game/board/{types,toBoardState}.ts`, Board page and `_Board.tsx`: carry metadata, render timing phase, report presentation.
- UI `table/Table/{types,dock}.ts`: shared waiting-clock representation and dock derivation; maintain `contract.test-d.ts` compatibility.
- `shared/lib/persistence.ts`: serialize runtime timing alongside keeper state.
- Engine `fake/project.ts`: rotate the original seating circle for seated viewers.
- Animation backlog and Interaction audit: record approved decisions and verified status.

Paths in tasks below are repository-relative. New test fixtures belong inside the named test file unless reused by at least two suites. Every task follows red/green verification and ends with a focused commit.

### Task 1: Explicit presentation phase for decision clocks

**Files:** Create `packages/engine/src/fake/presentationClock.ts` and `.test.ts`; modify `packages/engine/src/{state,view}.ts`, `fake/{reduce,window,project,index}.ts`; extend `fake/{turnClock,window}.test.ts` and the pending clock tests in `handAttacks.test.ts`.

**Interfaces:** Export from `@release/engine/fake`:
`deferNewClocks(before: GameState, after: GameState): GameState`,
`activatePresentedClocks(state: GameState, at: number): GameState`.
Add optional `awaitingPresentation?: true` beside clock fields in engine state and projected timing objects. Existing numeric fields encode the original allowance while held; every expiry/countdown consumer must explicitly respect the phase. Absence of the flag retains legacy/headless engine behavior.

- [ ] **Step 1: Write clock tests.** Build real reducer states using existing turn/window/pending fixtures. Assert `deferNewClocks` marks a newly stamped turn, reaction window, and timed pending; leaves an unchanged active window's timestamps and phase intact; preserves the rejected action's object identity. For each held clock, assert activation at 5,000 sets `openedAt === 5000`, `deadline === 5000 + originalDuration`, clears the flag, emits no gameplay event, and is idempotent on the second call. Assert early legal ATTACK/RESOLVE is accepted while held, held WINDOW_EXPIRED/turn expiry is refused, and a resolved decision is never recreated by activation. Cover defend, requestCard, stealCard, and Sudo's timed pending as applicable to existing state variants.
- [ ] **Step 2: Run red.** `pnpm --filter @release/engine exec vitest run src/fake/presentationClock.test.ts`. Expect missing helper/phase assertions to fail.
- [ ] **Step 3: Implement the helpers and phase guards.** Identify clocks by decision identity plus their existing timestamp renewal, not by object allocation alone. Carry held status through the same decision, clear it on replacement, and compare duration as `deadline - openedAt`. Audit `rg -n '\.deadline' packages/engine/src` for expiry and projection readers; preserve existing turn/window/pending suspension rules. An unchanged held clock remains held for the successor presentation; an unchanged active clock remains active. Add the flag to public timing projection, including pending projections. No network knowledge enters the engine.
- [ ] **Step 4: Run green.** `pnpm --filter @release/engine test` and `pnpm --filter @release/engine typecheck`; expect all pass, including unchanged headless engine tests.
- [ ] **Step 5: Commit only Task 1 files.** Message: `feat: add presentation phase to decision clocks (#226)`.

### Task 2: Pure presentation gate and bot pacing

**Files:** Create `apps/frontend/src/network/session/presentationGate.ts` and `.test.ts`.

**Interfaces:** Define and export serializable types:
`PresentationId = { gameId: string; incarnation: string; revision: number }`;
`PresentationWait = { id: PresentationId; issuedAt: number; deadline: number; waitingPeers: string[] }`;
`PresentationRuntime = { incarnation: string; revision: number; wait: PresentationWait | null; botNotBefore: number }`.
Export `BOT_ACTION_MS = 2000`, `PRESENTATION_CAP_MS = 12000` and pure functions:
`beginPresentation(runtime, gameId, peers: string[], now: number): PresentationRuntime`,
`ackPresentation(runtime, peerId: string, id: PresentationId): PresentationRuntime`,
`dropPresentationPeer(runtime, peerId: string): PresentationRuntime`,
`presentationReady(runtime, now: number): boolean`,
`botReady(runtime, now: number): boolean`.
The `runtime` parameters use `PresentationRuntime`; omitted return types above are boolean only for the last two. Beginning a presentation increments revision, replaces the wait, and sets `botNotBefore = now + 2000`. Clock-only activation does not call it.

- [ ] **Step 1: Write boundary tests.** With a publication at 1,000 and peers `host,guest`, assert bot readiness is false at 2,999 even after both ACKs and true at 3,000; with guest pending it remains false at 3,000 and becomes true at 13,000. Assert a completed three-second animation permits immediate progress without another two seconds. Test empty peer set, disconnect, duplicate ACK, wrong match/incarnation, old/future revision, replacement connection, and supersession. ACK must only remove an exact expected connection and identity; it must not mutate issued/deadline/bot timing.
- [ ] **Step 2: Run red.** `pnpm --filter @release/web exec vitest run src/network/session/presentationGate.test.ts`; expect missing module assertions to fail.
- [ ] **Step 3: Implement the pure functions.** No timers or side effects; caller supplies keeper time. Keep completed wait identity until the caller releases clocks, so it can acknowledge and activate exactly once. Generate keeper incarnation at the runtime boundary, never inside these pure functions.
- [ ] **Step 4: Run green.** Repeat the focused command; expect all assertions pass.
- [ ] **Step 5: Commit Task 2 files.** Message: `feat: add bounded presentation gate and bot pacing (#226)`.

### Task 3: Integrate session scheduling and wire acknowledgement

**Files:** Modify `network/session/{referee,link,remoteLink,syncSnapshot}.ts`, `network/{types,envelope,useLobby}.ts`, `features/play-game/useGame.ts`; extend matching session tests, `network/{envelope,useLobby}.test.ts`, and `features/play-game/useGame.test.tsx`. Create `network/session/presentationFlow.test.ts` for the multi-client controlled-clock scenario and `network/session/syncSnapshot.test.ts` for metadata accumulation.

**Interfaces:** Add `presentation?: PresentationId` to `Sync` and wire SYNC, and `presentationReady(id: PresentationId): void` to `GameLink`. Add `PRESENTATION_READY` with payload `{ presentation: PresentationId }`; resolve sender from the connection. Add `presentation: PresentationRuntime` to Session and `presentation?: PresentationId` to Game. Accumulation retains the latest authoritative identity when incoming clock/rejection-only frames omit it. Clock-only publications retain the presentation ID and contain no new gameplay events.

- [ ] **Step 1: Write integration tests.** Use real `createSession`, `attachKeeper`, memory transport, manual ticker, and two connected humans plus two bots. Assert host ACK alone does not allow a bot past an unacknowledged guest; both ACKs plus 2,000 ms do. Assert 12,000 ms cap, disconnect, and excluded spectators. Assert a new human turn/window projects waiting, then gains its full allowance after guest ACK; rejected intents preserve the wait; an early accepted human answer supersedes it. Assert private events and rejection-only SYNC do not leak or replace identity. Accumulate two SYNCs before a subscriber mounts and assert both event batches and only the latest presentation identity survive. Cover local-link pacing using the same scheduler.
- [ ] **Step 2: Run red.** `pnpm --filter @release/web exec vitest run src/network/session/presentationFlow.test.ts src/network/session/syncSnapshot.test.ts src/features/play-game/useGame.test.tsx`; expect the missing metadata/ACK/pacing behavior to fail.
- [ ] **Step 3: Integrate the scheduler.** Initialize runtime on session creation. Before each state-changing fanout, defer newly established clocks and create the wait using connected non-bot seats, before synchronous self-delivery. Separate deadline ticking from gated `driveUnattended`; update `advanceSession` so no bot action bypasses the gate following a timeout in that same tick. Activate held clocks once on presentation release, without creating a revision or resetting pacing. Ensure every accepted state transition, including automatic deadlines, follows this path. Guard session deadline handling with the phase. Route ACKs through keeper/remote/local links; validate payload and connection at runtime. On intro release create the first ordinary presentation and thinking interval, with no cyclic dependency on ordinary ACKs. Keep synthetic local addresses internal.
- [ ] **Step 4: Run green.** `pnpm --filter @release/web exec vitest run src/network/session src/network/useLobby.test.ts src/network/envelope.test.ts src/features/play-game/useGame.test.tsx`. Update old 250 ms bot expectations to assert semantics rather than retaining obsolete tick counts; do not bypass production gating just to preserve old fixtures. Follow with `pnpm typecheck`.
- [ ] **Step 5: Commit Task 3 files.** Message: `feat: synchronize bot progress with player presentation (#226)`.

### Task 4: Report committed board completion and show waiting clocks

**Files:** Create `features/board-beats/usePresentationAck.ts` and `.test.tsx`; modify `features/board-beats/{useBeats,index}.ts`, `entities/game/board/{types,toBoardState}.ts`, `pages/board/[gameId]/{index.tsx,_Board.tsx}`; modify UI `table/Table/{types,dock}.ts` and tests, translation `en/common.json` and `ru/common.json` if a waiting label is missing. Add Board tests under `pages/board/[gameId]/__tests__/presentation.test.tsx` and extend existing reaction-window/beat tests. Read `apps/ui/CLAUDE.md` before shared UI edits.

**Interfaces:** Expose `settled: boolean` on Beats: true only after all relevant incoming events have been incorporated, no queued/running beat remains, and live state has been committed. Do not derive this solely from `running`. Export `usePresentationAck({ presentation?: PresentationId; settled: boolean; onReady: (id: PresentationId) => void }): void`. Add optional presentation/onPresented fields to Board playback props. Carry `awaitingPresentation` on matching Board/UI timing shapes; preserve the structural contract test.

- [ ] **Step 1: Write Board tests.** Controlled animation promises hold a bot discard while two SYNCs arrive. Assert no ACK before the latest batch is incorporated or before the live board is committed; then assert one ACK for the latest revision, with Seat and TurnDock agreeing on the current player. Assert an arriving unqueued batch is unsettled even when `running` is false. Test reduced motion, no-animation state, resync, StrictMode repeat effects, and rematch. Assert an interactive card prompt can be settled while awaiting a user choice. Assert pending timing renders waiting and `isCounting` is false; clock-only activation enables the existing countdown without replay or another ACK cycle. Extend mouseup tests for a window opening/closing during a gesture, checking the live state rather than stale visible shadow.
- [ ] **Step 2: Run red.** `pnpm --filter @release/web exec vitest run src/features/board-beats/usePresentationAck.test.tsx 'src/pages/board/[gameId]/__tests__/presentation.test.tsx'`; expect no/mis-timed completion and waiting-clock assertions to fail.
- [ ] **Step 3: Implement completion and UI.** Share the queue's actual pending/settled facts with the hook, report after React commits the presented state, and deduplicate by full presentation identity. The hook has no network mutation beyond `onReady`; the page calls `gameLink.presentationReady`. Cancel pending reports on unmount/rematch. Do not hold completion for prompts, decorative idle effects, or the human response itself. Keep Seat/Dock on the visible projection; ensure input readiness and final legality follow the spec. Update shared dock timing to render waiting using existing copy where available, otherwise add both catalog keys through the existing copy prop surface.
- [ ] **Step 4: Run green.** `pnpm --filter @release/web exec vitest run src/features/board-beats 'src/pages/board/[gameId]/__tests__'`; `pnpm --filter @release/ui exec vitest run src/table/Table`; `pnpm typecheck`. Expect all pass, including rejection handling and Board type contracts.
- [ ] **Step 5: Commit Task 4 files.** Message: `feat: acknowledge settled boards and defer visible countdowns (#226)`.

### Task 5: Rotate seats relative to every player

**Files:** Modify `packages/engine/src/fake/project.ts`, extend `project.test.ts` and frontend `entities/game/board/toBoardState.test.ts` using existing adapter fixtures.

**Interfaces:** No new public API. `project(state, viewerId).opponents` returns successors in the immutable circle; `spectate(state).opponents` stays canonical.

- [ ] **Step 1: Write table-driven tests.** For each viewer in circles of 3 through 6 players, assert opponents equal `seating.slice(i + 1).concat(seating.slice(0, i))`. Explicitly assert p2 sees `[p3,p1]` for three players. Rename and eliminate seats and assert identical ID order. Assert spectator order is unchanged, missing/disconnected peer metadata does not alter places, and Board adaptation preserves the projected order.
- [ ] **Step 2: Run red.** `pnpm --filter @release/engine exec vitest run src/fake/project.test.ts`; expect non-first-viewer order assertions to fail.
- [ ] **Step 3: Rotate before mapping opponents.** Keep state.seating immutable and retain eliminated seats. Avoid altering turn succession or canonical spectator layout.
- [ ] **Step 4: Run green.** Repeat the engine command and run the frontend adapter test; expect all pass.
- [ ] **Step 5: Commit Task 5 files.** Message: `fix: preserve circular seating for every viewer (#226)`.

### Task 6: Restore, reconnect, and keeper lifecycle

**Files:** Modify `shared/lib/persistence.ts`, `network/useLobby.ts`, `network/session/{referee,remoteLink}.ts`, `network/types.ts` for handover metadata; extend `persistence.test.ts`, `useLobby.test.ts`, `session/remoteLink.test.ts`, and `presentationFlow.test.ts`.

**Interfaces:** Persist `PresentationRuntime` with the keeper snapshot. Carry runtime alongside state in `KEEPER_STATE` rather than treating handover as a fresh session. Introduce `restorePresentationRuntime(saved: PresentationRuntime | null, gameId: string, incarnation: string, now: number): PresentationRuntime` in `presentationGate.ts`: generate a new incarnation externally, preserve revision progression and the original cap/botNotBefore, discard former connection obligations, and establish current obligations without extending the old deadline. Missing legacy runtime releases held clocks conservatively rather than manufacturing a fresh cap; active clocks are retained as stored.

- [ ] **Step 1: Write recovery tests.** Reload at 7,000 into a wait issued at 1,000; assert its cap is still 13,000. Reload again and assert unchanged cap. Restore an active clock and assert its original deadline remains; expired active clocks follow normal expiry. Test legacy snapshot, malformed optional runtime, reconnect with a new peer ID, keeper handover, close, and rematch. Old-incarnation and old-connection ACKs must be ignored; restored presentation need not replay history. Assert the last pre-handover bot timing still bounds the successor's first bot action.
- [ ] **Step 2: Run red.** `pnpm --filter @release/web exec vitest run src/shared/lib/persistence.test.ts src/network/session/presentationFlow.test.ts`; expect missing runtime preservation assertions to fail.
- [ ] **Step 3: Persist and restore runtime.** Extend existing snapshot validation/backward compatibility without exposing GameState to spectators. On incarnation replacement clear obsolete ACK obligations and require a committed current projection from connected seats within the remaining original cap. The restore helper preserves timing and clears obsolete peers; the session caller installs the current peer set without reissuing the wait. Ensure gate cancellation and subscription cleanup cannot release old clocks. Preserve the exact Task 3 publication path for restored keepers. Audit `rebind`'s existing expired-turn restamp: keeper snapshot restoration must not inadvertently invoke it as a fresh allowance; retain the separate existing grace policy for a genuinely absent returning player.
- [ ] **Step 4: Run green.** `pnpm --filter @release/web exec vitest run src/shared/lib/persistence.test.ts src/network/useLobby.test.ts src/network/session`; expect all pass. Run `pnpm typecheck`.
- [ ] **Step 5: Commit Task 6 files.** Message: `fix: preserve presentation timing across session recovery (#226)`.

### Task 7: Browser acceptance, audit, and final validation

**Files:** Modify `docs/animations/backlog.md`, `apps/playground/stories/AnimationAuditStory/AnimationAuditStory.tsx`; create `docs/verification/2026-10-15-issue-226.md` for evidence and per-criterion outcomes. Read `apps/playground/CLAUDE.md`. Use the applicable browser skill before browser automation.

**Interfaces:** No new product API. Diagnostics use existing trace facilities; any added fields are scoped to presentation identity, ACK, action, rejection, window, and queue timing, without hidden-card leakage.

- [ ] **Step 1: Establish a real host/non-host WebRTC session with two bots.** Use the local signaling configuration (`pnpm dev:p2p`) and separate browser contexts. Verify the DataChannel actually opens. Record versions/commit, seats, and connection topology; distinguish this from debug-only scenes and memory-network tests.
- [ ] **Step 2: Exercise timing and presentation.** Delay the non-host's actual animation completion beyond two seconds through a browser test harness around the shared animation completion seam, without changing shipped timing policy. Record that bot actions remain at least 2,000 ms apart, wait for the guest, and resume after the 12,000 ms cap if it stays stalled. Test disconnect and hidden-tab recovery, plus all clients' Seat/Dock after drain. Start an attack window and a human turn and verify full time begins only after release; confirm that clock activation does not animate again.
- [ ] **Step 3: Reproduce the two unconfirmed symptoms.** For a fresh bot release, drag a legal attack on the non-host with a live window, then test Code Review restrictions and expired-window rejection. For Crush, record subtype, target owner, Monitoring/AI Monitoring, Debugger decision, and releaseDestroyed/neutralized events. If a defect appears, capture a failing regression in its owning layer before a focused patch; if it needs a rules decision or unrelated subsystem, stop that patch and report it separately. Record unreproduced/blocked symptoms accurately.
- [ ] **Step 4: Check seating in browsers.** For three or more players, inspect each seated viewer and a spectator. Confirm p2's top row starts with p3, turn direction is clockwise, and rename/elimination preserve ID-based places.
- [ ] **Step 5: Update the audit and evidence.** Record the owner-approved timer/pacing decisions beside the existing backlog finding. Set Interaction audit status based on completed evidence, preserving unverified conditions. Include reproducible browser steps, timing traces, and screenshot artifact paths in the verification report; do not commit video/media without need.
- [ ] **Step 6: Run final checks.** `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`. Expect each exit code 0. Report local checks, browser results, and remaining environment limits separately. Re-run only checks invalidated by later edits.
- [ ] **Step 7: Review the final diff and commit audit/evidence.** Message: `docs: record bot board synchronization acceptance (#226)`. Any browser-discovered code fix gets its own regression and focused commit before this. Finish through the applicable review/branch workflow; do not claim #226 fully verified with missing WebRTC acceptance.

## Self-review and execution handoff

Coverage: design clock lifecycle → Tasks 1, 3, 6; identity/pacing → Tasks 2, 3;
committed completion and visible turn → Task 4; relative seating → Task 5;
all browser criteria and animation audit → Task 7. All five Review Focus cases
have explicit owning tests. Interfaces use one PresentationId and one runtime
across local, remote, restore, and Board paths.

This is a plan, not implementation evidence. Owner review and execution-method
selection are required before Task 1 starts. Recommended method: Native, because
the session, clock, and Board tasks share interfaces and one implementer can
carry those contracts through without repeated context handoffs. Subagent-driven
execution remains available if the owner prefers per-task independent reviews.
