# Keeper Clock Synchronization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make host and non-host countdowns agree despite machine clock skew, using RTT measurement and monotonic interpolation.

**Architecture:** A session clock model estimates keeper time without changing projections or engine deadlines. Session links own calibration traffic and lifecycle; the game hook exposes the clock to the existing Board countdown consumer. The keeper uses one monotonic authority clock for actions and timing metadata.

**Tech Stack:** TypeScript, React 19, existing PeerJS transport, Vitest and Testing Library, pnpm 9.15.0, Node >=24. No added dependencies.

**Spec:** [2026-10-15-keeper-clock-sync-design.md](./2026-10-15-keeper-clock-sync-design.md)

## Global Constraints

- One issue/branch: `fix/228-keeper-clock-sync`; one implementation PR.
- GameState, events and deadlines remain in their existing keeper time domain.
- Only the keeper decides expiry and stamps action time; clock messages never reach the reducer.
- Initial burst: three probes, 250 ms apart; periodic probing every ten seconds.
- At most three outstanding requests; five-second response lifetime; eight samples in a 30-second window.
- Lowest network RTT wins; equal RTT prefers the newest sample.
- No local Date.now subtraction as a legacy fallback; before a trusted anchor, show a full numberless ring.
- Calibration is local, ephemeral and never persisted or added to game history.
- No automatic election, new production handover receiver, animation catch-up fix or bot-policy change.
- Follow `CLAUDE.md` and frontend FSD rules; source comments in English.
- Plan/spec locations follow the repository's `docs/specs/` convention.

## Review Focus

- Immediate in-memory replies can arrive before handle assignment: activate probes explicitly after routing is installed (Task 2).
- React batching, Board unmount and empty-event updates must not lose calibration or replay history (Task 3).
- Same peer/game IDs reused after reconnect must not let late replies recalibrate a new generation (Task 2).
- An uncalibrated legacy peer must not show fabricated seconds or disable valid actions (Task 3).
- A successor with a different epoch must preserve adopted deadlines, rather than immediately expire or renew them (Task 4).

## File Map

Create `apps/frontend/src/network/session/clock.ts` and `clock.test.ts`: pure calibration/authority clocks.
Create `apps/frontend/src/network/session/clockProbe.ts` and `clockProbe.test.ts`: probe scheduling, request tracking and lifecycle.
Modify `session/link.ts`, `session/remoteLink.ts` and their tests: expose clocks, stamp SYNC at delivery, handle clock traffic.
Modify `network/types.ts`, `network/useLobby.ts` and its tests: additive wire contracts and lifecycle routing.
Modify `features/play-game/useGame.ts`, `useNow.ts` and their tests: expose and consume calibrated time.
Modify `entities/game/board/types.ts`, `pages/board/[gameId]/_Board.tsx`, `index.tsx` and page tests under `__tests__/`: pass the common clock and represent unavailable time.
Extend session handover tests and add `session/clockIntegration.test.tsx`: complete authority → transport → hook → dock checks.
Update the older sync-layer design's Trust boundary paragraph to reference the implemented mechanism.

## Task 1: Pure clock model

**Interfaces** — produce in `session/clock.ts`:

```ts
interface GameClock {
  now(): number | null
  getSnapshot(): number // stable revision until calibration changes
  subscribe(listener: () => void): () => void
}
interface RemoteClock extends GameClock {
  anchor(keeperNow: number, receivedAt: number): void
  sample(value: { sentAtLocal: number; receivedAtLocal: number;
    receivedAtKeeper: number; sentAtKeeper: number }): boolean
  reset(): void
}
createRemoteClock(monotonicNow: () => number): RemoteClock
createAuthorityClock(args: { epochNow: () => number; monotonicNow: () => number;
  initialKeeperNow?: number }): GameClock & { now(): number }
```

- [x] Write `clock.test.ts` first. With local send=1000, receive=1220, keeper receive=1800000000100 and send=1800000000120, assert estimated now at local=1300 is **1800000000300**. For machine epoch shifts 0, ±60000 and −3523000, assert this result is unchanged.
- [x] Add tests asserting: authority remains +500 ms after local wall time jumps; provisional anchor becomes RTT-calibrated; later SYNC cannot replace calibration; lower-RTT sample wins until it expires; equal-RTT selects newest; reset makes now null and notifies subscribers; malformed/negative-RTT samples leave snapshot unchanged. After nine samples and after 30 seconds, assert selection reflects the stated retention limits.
- [x] Run `pnpm --filter @release/web exec vitest run src/network/session/clock.test.ts`; confirm failures identify the missing model/behavior.
- [x] Implement the signatures above. Use the spec's RTT formula, an immutable selected anchor and a bounded sample array. `now()` advances the selected anchor using injected monotonic elapsed time; expired sample selection is recomputed when receiving another sample. Retain the last anchor while awaiting a new valid sample. `anchor` only initializes an uncalibrated generation.
- [x] Rerun the focused command and frontend typecheck. Commit only clock files as `fix: add monotonic keeper-relative clock model`.

## Task 2: Authenticated wire exchange and link lifecycle

**Interfaces** — consume Task 1 clocks; produce:

- `GameLink.clock: GameClock`, required for all production link implementations.
- Additive SYNC payload fields `gameId?: string`, `keeperNow?: number`, stamped at link delivery.
- `CLOCK_REQUEST { gameId: string; requestId: number }` and `CLOCK_RESPONSE { gameId: string; requestId: number; receivedAt: number; sentAt: number }`.
- `createClockProbe({ clock: RemoteClock, monotonicNow: () => number, send: (gameId: string, requestId: number) => void })`: returns `activate(gameId: string): void`, `reset(): void`, `receive(payload: unknown): void`, `refresh(): void`, `close(): void`. Inject timer scheduling in tests.
- `RemoteHandle.activate(gameId: string): void`, `resetClock(): void`; preserve `setKeeper(peerId)` and reset/reprobe the active game there.
- `createRemoteLink` accepts optional injected `monotonicNow`; `attachKeeper` and `createLocalLink` accept optional injected `monotonicNow` and `initialKeeperNow`. Production defaults to `performance.now`; existing `now` becomes the initial epoch source.

- [x] Add failing probe tests for exactly three startup requests at 0/250/500 ms, ten-second refresh, five-second timeout, outstanding cap, invalid payload, consumed/unknown IDs and close cleanup. Reuse a handle across game resets: IDs never repeat, an old reply cannot make the reset clock ready.
- [x] Extend `remoteLink.test.ts`: a synchronous memory-network response succeeds after explicit activate; wrong sender/game is ignored; repeated same-peer reconnect rejects the old response; spectator gets timing, stranger does not; clock request leaves GameState/event sequence/deadlines unchanged. A deposed keeper stops replying.
- [x] Assert ordinary, empty-event, rejection, resync, spectator and local SYNC delivery carry a finite authoritative stamp. Invalid/mismatched timing metadata cannot seed a clock; legacy unstamped SYNC still delivers its projection and events.
- [x] Run focused probe/link tests to observe failures before implementation.
- [x] Implement `clockProbe.ts`, additive types and link integration. Validate unknown payload values before timestamp arithmetic. Keeper verifies current game and seated/registered spectator membership. Stamp outgoing SYNC in the link's delivery boundary, including its own local subscriber path; leave pure referee timing generation untouched.
- [x] In `useLobby.ts`, route both new message types to keeper/remote handles. Call activate only after remote assignment and transport routing are installed; reset on game change and reconnect/disconnect. On visibility return refresh the probe burst without resetting game state or deadlines. Close/reset removes timers/listeners and outstanding requests. `KEEPER_CHANGED`/`setKeeper` invalidate the previous endpoint generation.
- [x] Update existing fixtures to inject coordinated epoch and monotonic clocks when manually advancing time; do not add production switches solely to preserve old tests. Run probe, link, remoteLink and useLobby tests, plus frontend typecheck. Commit as `fix: synchronize session clocks through authenticated RTT probes`.

## Task 3: Board consumes keeper time

**Interfaces** — consume `GameLink.clock`; produce `Game.clock: GameClock | null` from `useGame` and change the hook to:

```ts
useNow(active: boolean, clock: GameClock | null, intervalMs = 250): number | null
```

Add `BoardProps.countdownReady?: boolean`, defaulting to true for existing standalone consumers. The page passes `now={now ?? 0}` and `countdownReady={now !== null}`. Board passes `countdownReady` as deriveDock's fourth `timers` argument. The zero is a numeric prop adapter only: disabled countdown rendering must not display it.

- [x] Add failing hook tests: read latest clock on first render and activation; tick monotonically; respond to calibration-only revision; stop the 250 ms interval when inactive/unmounted; never use local Date.now when clock is unavailable. Use React external-store subscription for clock revisions and compute current clock time on render, avoiding a stale value until a passive effect.
- [x] Extend `useGame.test.tsx` and Board page tests: batching an initial SYNC and a calibration update keeps both view and correct clock; unmount/remount retains link calibration; a clock-only change does not duplicate events/rejections or alter restoredThrough.
- [x] Test legacy/no-anchor UI: a live action remains available, the ring is full and numberless, and neither 3553 nor a fabricated zero appears. A null display clock must not become Date.now or zero through a default parameter.
- [x] Run hook/game/page tests and confirm failures.
- [x] Implement exposure and hook changes. In the page and Board, use the exact prop contract above to render the existing full/numberless ring while time is unavailable. Preserve actual action eligibility and authoritative clocks. Do not mutate engine setup or globally turn off game timeouts.
- [x] Verify full/numberless behavior also covers a timed reaction/pending, not just the turn. Run hook/game/page tests and frontend typecheck. Commit as `fix: render game countdowns from the session clock`.

## Task 4: Preserve time through adoption and prove end-to-end behavior

**Interfaces** — consume clock and link interfaces from Tasks 1–3. Existing `adoptSession` retains its GameState contract. A handover test caller captures `remote.link.clock.now()` before reset and passes that finite value as `initialKeeperNow` to `attachKeeper` on the successor; no new production election receiver.

- [x] Add `clockIntegration.test.tsx` using actual createSession/attachKeeper/createRemoteLink, memory transport, useNow and deriveDock. With a real 30-second deadline, test the four epoch shifts above; after successful symmetric 100 ms one-way exchange, assert displayed seconds agree with keeper seconds and advance with elapsed local monotonic time.
- [x] Extend to a real 15-second reaction window and timed pending produced by reducer actions. Delay delivery and React render separately. Assert asymmetric 50/150 ms paths produce at most 50 ms clock-estimation error, rather than claiming exact time.
- [x] Add a wall-clock change after calibration, missing probe responses, rematch, hidden/visible refresh and same-peer reconnect; no case renews an authoritative deadline. Include a legacy peer that never answers probes.
- [x] Add lower-level handover test: different successor epoch, calibrated inherited time, adopted live turn deadline unchanged (window and pending deadlines are covered by the reducer integration tests), remaining peer remeasures successor and keeper expires at the original logical deadline. Existing same-host reload starts from current epoch and does not reuse stale calibration.
- [x] Run integration/adoption tests, confirm any missing behavior fails first, then make the minimal integration corrections within the specified interfaces. Run full frontend tests and engine tests; commit as `test: cover skewed-client countdowns and keeper adoption` (use `fix:` if production corrections are included).

## Task 5: Browser evidence and branch verification

- [x] Run two local browser clients using the actual frontend and local signaling server. Control guest Date.now at 0, −3523000 and +60000 ms; preserve performance.now. Observe turn and reaction countdowns, then change guest wall time during the same deadline. Capture client-visible values and timing messages; confirm an actual open WebRTC DataChannel before claiming P2P acceptance.
- [x] Return the guest from background and reconnect it. Verify fresh calibration, current authoritative state, and no deadline renewal. Old animation playback remains #143; distinguish it from a clock failure. If the environment blocks WebRTC, record that blocker and separately label any browser memory-transport harness evidence.
- [x] Update `docs/specs/2026-07-30-p2p-sync-layer-design.md` Trust boundary to point to the implementation and document the additive clock messages. Mark design status implemented only after required validation succeeds; otherwise record remaining acceptance limits.
- [x] Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `git diff --check`, preserving exit codes/logs. Report failing test names and environment limits; do not infer browser correctness from green unit tests.
- [x] Review the complete diff for clock-domain mixing, event-history changes, timestamp trust, timer/listener leaks and unrelated edits. Obtain an independent whole-branch review using the selected execution workflow; address actionable findings and rerun affected checks.
- [x] Commit final documentation/verification corrections. Present the branch, validation results and material limits. Publication, if requested, targets `MythHand/ReleaseBoardGameP2P:main` and references #228; attach any created PR through the app tool.

## Execution notes — 2026-10-16

Implementation and independent review are complete. Browser memory-transport
checks passed; actual WebRTC acceptance was attempted but remains blocked by ICE
failure before DataChannel open. Checked browser steps record this explicit limit,
not successful P2P acceptance. See the design verification record for observations.

The lower-level adoption test exercises a live turn; real release-window and
pending deadlines are exercised through reconnect in the integration tests.

## Self-review

The plan covers the approved design's formula, sample selection, provisional/legacy display,
all delivery paths, runtime validation, lifecycle resets, monotonic keeper authority,
existing adoption contract, restoration policy and browser acceptance. Every Review Focus
condition has an owning test task. No code/dependencies are changed by this plan document.
