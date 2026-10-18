# Offline Seats, Host Drop and Mid-Match Spectators — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A disconnected human's seat is played passively by fixed rules instead of by a bot; a host whose network blinks keeps the match; a stranger opening a running room lands as a spectator.

**Architecture:** The engine gets two new actions (`ABANDON`, `SURRENDER`) and a `passiveAction` policy beside `botAction`; the keeper's `driveUnattended` switches policy by seat kind. The transport learns to re-register with the signaling broker, and the keeper freezes while the host is off signaling. Three parts, each its own PR: Part A (tasks 1–5), Part B (tasks 6–8), Part C (task 9).

**Tech Stack:** TypeScript, React 19, PeerJS, Vitest, pnpm workspace.

**Spec:** [`docs/specs/2026-10-18-offline-seat-and-host-drop-design.md`](./2026-10-18-offline-seat-and-host-drop-design.md)

## Global Constraints

- Branches: `feat/<issue>-<slug>` — open an issue per part first (root `CLAUDE.md`, Branch Naming Rule).
- Code comments in English.
- No string literals in `.tsx`; every new key in both `packages/translation/src/locales/en/common.json` and `…/ru/common.json`.
- Colors only from `apps/ui/src/design/tokens.css`; text only via `<Typography>`.
- Every "random" in the keeper/engine is seeded from game state (`randomAt(state.seed, state.eventSeq)` or `shuffle(items, state.seed, state.rngCursor)`); never `Math.random`.
- A passive seat never produces `PLAY` or `ATTACK`.
- `ABSENT_GRACE_MS` stays `30_000`; no turn/window duration changes.
- Lobby-chosen bots (`seat.bot`) keep `botAction` unchanged.
- An AI card never leaves the game: it is in the events deck, a release zone, or at the centre — wording in comments and docs follows that.
- Animations are composed from `apps/ui/src/animations/` modules and respect `prefers-reduced-motion`.
- Run before every commit: `pnpm lint && pnpm typecheck && pnpm test`.

## Review Focus

1. **The returning player lands between the passive DRAW and PUSH.** Expected: they get their own turn back with a fresh turn clock, the drawn cards stay in hand, nothing is pushed for them. (Test in Task 4.)
2. **A passive seat's draw chain (`ai-good-vibe-coding`) turns up a 503 with no Monitoring.** Expected: eliminated mid-chain, the rest of the draw is not run, turn passes to the next living seat. (Test in Task 2.)
3. **Every human but the host is passive.** Expected: the table keeps moving (the host's seat is the connected one); no stall warning. (Test in Task 4.)
4. **Surrender while a pending involving the leaver is open** (they attacked and the victim is still deciding). Expected: the exchange finishes first; the leaver is eliminated once the table is idle; no card disappears (conformance census holds). (Test in Task 4.)
5. **Host signaling drops for longer than 30 s while a guest's turn clock runs.** Expected: on return no guest is passive, the clock has the same time left as at the drop. (Test in Task 7.)

---

## Part A — passive seat (one PR)

### Task 1: `ABANDON` — undo a played card's pending

**Files:**
- Modify: `packages/engine/src/actions.ts` (Action union)
- Create: `packages/engine/src/fake/abandon.ts`
- Modify: `packages/engine/src/fake/reduce.ts` (`dispatch`, `isWellFormedAction`)
- Test: `packages/engine/src/fake/abandon.test.ts`

**Interfaces:**
- Produces: `Action` variant `{ type: 'ABANDON'; player: PlayerId; at: number }` — keeper-only (never added to the keeper's `PEER_INTENT_TYPES`).
- Produces: `onAbandon(state: GameState, action: Action & { type: 'ABANDON' }): Reduction` in `fake/abandon.ts`.

Semantics — rejected unless `state.pending` is owed by `action.player` and is one of:

| Pending | Effect |
|---|---|
| `discardForRelease` | identical to `RESOLVE cancelRelease` (reuse `onCancelRelease`) |
| `stealCard`, `requestCard` | `context.attack` (+ `context.combo`) back to `context.owner`'s hand; if `context.cover?.player === action.player`, the cover cards go back to that player's hand instead and the attack is finished as spent (`finishHandAttack`) — see the open item below |
| `reorderTop` | the source card (+ its Sudo) removed from `decks.discard` back to hand; deck order unchanged |
| `pickFromDiscard` whose `source` is not an `ai-*` card | the source card (+ its Sudo) removed from `decks.discard` back to hand; nothing taken |

Every return logs `{ type: 'takenBack', player, cards: CardId[] }`; `pending` becomes `null`. The cards to pull back from the discard are the ones the open logged as `discarded` with reason `'effect'` — keep the pending's knowledge of them explicit: add `spent: CardUid[]` to the `reorderTop` and `pickFromDiscard` pendings at open time (`rebase.ts`, `discard.ts`) and to their `PendingView` mirror only if the view needs it (it does not).

> **Open (ask the owner before merging):** a hand-attack reflected by Works on my Machine leaves the *defender* owing `stealCard`/`requestCard`. The row above returns the defender's cover cards and spends the attack. Confirm, or record in `docs/rules/backlog.md` with a `❓ Не из правил.` marker.

- [ ] **Step 1: Write the failing tests** in `abandon.test.ts`, building states with the fixture style of `handAttacks.test.ts` / `gitRebase.test.ts`:
  - `abandon returns a staged release to hand` — after `PLAY release-frontend` raising `discardForRelease`, `ABANDON` → `pending === null`, release uid in hand, a `takenBack` event.
  - `abandon returns Git Rebase and its Sudo from the discard` — hand contains both uids again, `decks.discard` does not, `decks.main` order identical to before the play.
  - `abandon returns Cherry-pick without taking anything` — discard length equals its length before the play.
  - `abandon returns a Bug hand attack to the attacker` — attacker hand regains attack uid, victim hand unchanged.
  - `abandon is rejected for a pending owed by someone else` — state identity unchanged, `rejected` event.
  - `abandon is rejected for ai-inside pickFromDiscard` — `source: 'ai-inside'`.
  - Conformance: card census equal before/after each abandon (reuse the census helper in `conformance.ts`).
- [ ] **Step 2: Run** `pnpm --filter @release/engine test abandon` — Expected: FAIL (`unsupported action: ABANDON`).
- [ ] **Step 3: Implement** the action variant, `spent` on the two pendings, `onAbandon`, and the `dispatch` case.
- [ ] **Step 4: Run** `pnpm --filter @release/engine test` — Expected: all PASS.
- [ ] **Step 5: Commit** `feat(engine): ABANDON undoes a played card's open decision`.

### Task 2: `passiveAction` policy

**Files:**
- Create: `packages/engine/src/fake/passive.ts`
- Modify: `packages/engine/src/fake/index.ts` (export)
- Test: `packages/engine/src/fake/passive.test.ts`

**Interfaces:**
- Consumes: `ABANDON` (Task 1); existing `PASS` decline of `neutralize503`/`crush` (`reduce.ts` `dispatch`).
- Produces: `passiveAction(engine: Engine, state: GameState, me: PlayerId, at: number): Action | null`, exported from `@release/engine/fake`.

Answer table (pending owed by `me` first, then window, then own turn):

| Situation | Returns |
|---|---|
| `defend` | `RESOLVE { kind: 'defend', card: null }` |
| `neutralize503` / `crush`, `methods` includes `'monitoring'` | `RESOLVE { kind, method: 'monitoring' }` |
| `neutralize503` / `crush`, otherwise | `PASS` (decline: eliminated / release destroyed) |
| `handLimit` (incl. `endsTurn: false`) | `RESOLVE handLimit` with `excess` cards chosen by seeded shuffle of `options` |
| `giveCard` | same answer as `botAction` (the named card) |
| `systemUpgrade`, phase `discarding`, `me` owed | `upgradeDiscard` of a seeded-random hand card |
| `systemUpgrade`, phase `picking` | `upgradeTake` of a seeded-random `thrown` card |
| `pickFromDiscard`, `source` starts with `ai-` | `RESOLVE pickFromDiscard` with a seeded-random option whose kind is not `trigger` |
| `discardForRelease`, `stealCard`, `requestCard`, `reorderTop`, `pickFromDiscard` from a played card | `ABANDON` |
| window open, `me` is a responder who has not passed | `PASS` |
| window open, `me` owns it | `null` (the keeper's `tick` expires it) |
| own turn, nothing pending, `!view.turn.hasDrawn` | `DRAW` |
| own turn, drawn | `PUSH` |
| anything else | `null` |

- [ ] **Step 1: Write the failing tests:**
  - `never proposes PLAY or ATTACK` — loop like `bots.test.ts` "only ever proposes an action the engine accepts", driving every seat with `passiveAction` for 400 steps on seeds 4242 and 17; assert every action is accepted and none has type `PLAY`/`ATTACK`.
  - `draws then pushes on its own turn` — fresh game, p1 on turn: `DRAW`, then after reducing it, `PUSH`.
  - `declines a 503 while holding a Debugger` — p1 hand has `protection-debugger`, no Monitoring, pending `neutralize503` → `{ type: 'PASS' }`; reducing it puts p1 in `eliminated`.
  - `answers monitoring for ai-error-503` — pending `neutralize503` with `methods: ['debugger','monitoring']` → `method: 'monitoring'`.
  - `hand limit discards exactly excess, deterministically` — same state twice → same `cards`; `cards.length === excess`.
  - `ai-inside takes a release` — returned card's rules kind is `release`.
  - `good-vibe chain with a 503 eliminates and stops the draw` (Review Focus 2) — after the PASS, `state.drawing` is falsy and `turn.player` is the next living seat.
- [ ] **Step 2: Run** `pnpm --filter @release/engine test passive` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `passiveAction` reading `engine.project(state, me)` like `botAction`; seeded randomness via `randomAt(state.seed, state.eventSeq)` (single pick) and `shuffle(…, state.seed, state.rngCursor)` (several picks; do not write the cursor back — the policy is pure).
- [ ] **Step 4: Run** `pnpm --filter @release/engine test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine): passive policy for an absent player's seat`.

### Task 3: `SURRENDER`

**Files:**
- Modify: `packages/engine/src/actions.ts`, `packages/engine/src/fake/reduce.ts`
- Test: `packages/engine/src/fake/elimination.test.ts`

**Interfaces:**
- Produces: `Action` variant `{ type: 'SURRENDER'; player: PlayerId; at: number }`. Accepted only when `!state.pending && !state.window && !state.drawing && !state.over` and `player` is living; effect is `eliminate(state, log, player)` (which already ends the turn and detects last-standing).

- [ ] **Step 1: Write the failing tests:** `surrender eliminates at an idle table`, `surrender ends the surrendering player's turn`, `surrender of the second-last player ends the game with lastStanding`, `surrender is rejected while a pending is open`.
- [ ] **Step 2: Run** `pnpm --filter @release/engine test elimination` — Expected: FAIL.
- [ ] **Step 3: Implement** the variant and its `dispatch` case.
- [ ] **Step 4: Run** `pnpm --filter @release/engine test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine): SURRENDER eliminates a player who leaves`.

### Task 4: keeper drives passive seats and applies surrender

**Files:**
- Modify: `apps/frontend/src/network/session/referee.ts` (`Seat`, `driveUnattended`, `PEER_INTENT_TYPES`, `applyIntent`)
- Modify: `apps/frontend/src/network/session/restore.ts` (keep `surrendering` through a restore)
- Modify: `apps/frontend/src/network/useLobby.ts` (leaving mid-match)
- Test: `apps/frontend/src/network/session/passivePlay.test.ts` (new, modelled on `botPlay.test.ts`), `apps/frontend/src/network/useLobby.test.ts`

**Interfaces:**
- Consumes: `passiveAction` (Task 2), `SURRENDER` (Task 3).
- Produces: `Seat.surrendering?: true` on the keeper's referee `Seat`; `'SURRENDER'` added to `PEER_INTENT_TYPES`. `applyIntent` for a `SURRENDER` intent does not reduce it immediately: it sets `surrendering` on the sender's seat. `driveUnattended` reduces `SURRENDER` for a `surrendering` seat as soon as the engine accepts it (idle table), before any other seat acts, and does not wait for the grace.

Changes in `driveUnattended`:
- `seat.bot` → `botAction` (unchanged).
- absent human past `ABSENT_GRACE_MS`, or `surrendering` and not yet eliminated → `passiveAction`.
- The draw/push fallback below the policy call applies to bots only.

Leaving mid-match: the reconnect overlay's leave (`pages/board/[gameId]/index.tsx` `onReconnectLeave` and the overlay `onLeave`) and any other in-match leave call `session.leaveSession()`. In `useLobby.leaveSession`, when this peer is a seated non-host player in a running match and the link is open, send `{ type: 'SURRENDER' }` through the game link, then tear down with the existing `flushMs` path. A host leaving ends the room as today (out of scope).

- [ ] **Step 1: Write the failing tests** in `passivePlay.test.ts` (memory network, manual ticker, two humans p1 keeper / p2 remote):
  - `an absent human past grace draws and pushes, never plays` — disconnect p2, advance 30 s + until p2's turn ends; log for p2 has `drawn` and `turnEnded`, no `released`/`attacked`/`operationPlayed`.
  - `an absent human is not driven before the grace` — at 29 s nothing for p2.
  - `a lobby bot still plays` — `bot: true` seat produces a `PLAY` within its turn (regression).
  - `returning between draw and push gets the turn back` (Review Focus 1) — rebind p2 right after its passive `DRAW`; next ticks produce no `PUSH` for p2 and `turn.deadline` is fresh.
  - `all humans but the keeper passive keeps the table moving` (Review Focus 3) — 3 remote humans all dropped; 20 turns pass.
  - `surrender waits for the open exchange` (Review Focus 4) — p2 attacks p1, p2 sends SURRENDER while p1's `defend` is open; p2 is eliminated only after p1 resolves; card census unchanged.
  - In `useLobby.test.ts`: `leaving a running match as a player sends SURRENDER before closing`.
- [ ] **Step 2: Run** `pnpm --filter @release/web test passivePlay` — Expected: FAIL.
- [ ] **Step 3: Implement** the referee and `useLobby` changes.
- [ ] **Step 4: Verify the offline marker.** Board seat for a passive player already renders `disconnected` (`pages/board/[gameId]/index.tsx` `disconnected`, `apps/ui/src/table/Seat/Seat.module.css` `.disconnected`). Confirm in the browser with two tabs (`pnpm dev`): drop one tab's network in devtools, see the seat marked within a second and the passive turn after 30 s. If the marker is missing for any state, fix there.
- [ ] **Step 5: Run** `pnpm lint && pnpm typecheck && pnpm test` — Expected: PASS.
- [ ] **Step 6: Commit** `feat(session): absent seats play passively; leaving surrenders`.

### Task 5: rules documentation

**Files:**
- Create: `docs/rules/decisions/2026-10-18-offline-seat-decisions.md`
- Modify: `docs/rules/general.md` (new section "Игрок не в сети"), `docs/rules/backlog.md`

- [ ] **Step 1:** Write the decisions file in the format of the existing files in `docs/rules/decisions/`: each owner question and answer from the spec's Part 3 tables, "Dropping mid-decision", "Leaving on purpose", "Winning while passive", dated 18.10.2026.
- [ ] **Step 2:** Add the `general.md` section summarising the passive-seat rules and linking the decisions file.
- [ ] **Step 3:** Add backlog entries: (a) `ai-error-503` with standing Monitoring opens a choice in the engine but `cards.md` says it is automatic; (b) the reflected hand-attack case from Task 1, unless the owner has answered it.
- [ ] **Step 4: Commit** `docs(rules): record offline seat decisions`.

---

## Part B — host network drop (one PR)

### Task 6: transport re-registers with the broker

**Files:**
- Modify: `apps/frontend/src/network/transport/peer.ts`
- Test: `apps/frontend/src/network/transport/peer.test.ts`

**Interfaces:**
- Produces: `createTransport` arg `onSignaling?: (state: 'lost' | 'restored') => void`. After open: `peer.on('disconnected')` → `onSignaling('lost')`, then `peer.reconnect()` on a backoff (`backoffMs`, uncapped attempts while not closed) and immediately on `window` `online`; the next `peer.on('open')` → `onSignaling('restored')`. Peer errors of type `network` / `disconnected` / `server-error` / `socket-error` / `socket-closed` while signaling is lost are reported to `onSignaling`, not `onError`. DataChannels are left alone.

- [ ] **Step 1: Write the failing tests** with the PeerJS mock already used in `peer.test.ts`: `emits lost on disconnected and calls reconnect`, `emits restored when the peer reopens`, `retries reconnect on the online event`, `does not report network errors through onError while lost`, `close() stops reconnecting`.
- [ ] **Step 2: Run** `pnpm --filter @release/web test peer` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(transport): re-register with the signaling broker after a drop`.

### Task 7: keeper freezes while the host is off signaling

**Files:**
- Create: `apps/frontend/src/network/session/suspend.ts`
- Modify: `apps/frontend/src/network/session/remoteLink.ts` (`KeeperHandle`), `apps/frontend/src/network/useLobby.ts`, `pages/board/[gameId]/index.tsx`
- Test: `apps/frontend/src/network/session/suspend.test.ts`, `useLobby.test.ts`

**Interfaces:**
- Consumes: `onSignaling` (Task 6).
- Produces: `resumeSession(session: Session, pausedAt: number, now: number): Session` in `suspend.ts` — shifts every live deadline (`turn.deadline`/`openedAt`, `window.deadline`, timed `pending.deadline`/`openedAt`) by `now - pausedAt`, and restamps `absentSince = now` on every non-bot seat with `peerId === null` (same rule as `restoreSeats`).
- Produces: `KeeperHandle.suspend(): void` and `KeeperHandle.resume(): void` — while suspended the ticker does not call `advanceSession` and intents from any link (including the keeper's own) are dropped.
- Produces: `useLobby` field `hostOffline: boolean`; the host's `onSignaling('lost')` sets it and calls `keeper.suspend()`, `'restored'` clears it and calls `keeper.resume()`; signaling errors no longer set `status: 'error'` for the host while it is set. The board's `connection` is `'reconnecting'` when `hostOffline` is true.

- [ ] **Step 1: Write the failing tests:** `resumeSession shifts the turn deadline by the pause`, `resumeSession restamps absent humans and leaves bots`, `a suspended keeper fires no deadline` (Review Focus 5: suspend, advance 60 s, resume; no guest passive, remaining turn time equal to before), `host status stays in-game across a signaling drop` (useLobby).
- [ ] **Step 2: Run** `pnpm --filter @release/web test suspend` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm lint && pnpm typecheck && pnpm test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(session): host keeps the match through a network drop`.

### Task 8: guests keep trying for about two minutes

**Files:**
- Modify: `apps/frontend/src/network/session/reconnect.ts`, `apps/frontend/src/network/useLobby.ts` (`runGuestReconnect`, `reconnect.maxAttempts`)
- Test: `apps/frontend/src/network/session/reconnect.test.ts`

**Interfaces:**
- Produces: `GUEST_RECONNECT_ATTEMPTS = 18` in `reconnect.ts` (0.5 + 1 + 2 + 4 + 14 × 8 s ≈ 2 min of backoff). `runGuestReconnect` loops to it; `MAX_RECONNECT_ATTEMPTS = 5` stays for `restoreHost`.

- [ ] **Step 1: Write the failing test:** `guest retry backoff sums to between 110 and 130 seconds` — `sum(backoffMs(1..GUEST_RECONNECT_ATTEMPTS-1))`.
- [ ] **Step 2: Run** — Expected: FAIL (export missing).
- [ ] **Step 3: Implement**; the overlay's "attempt n of m" reads the new constant through `reconnect.maxAttempts`.
- [ ] **Step 4: Run** `pnpm test` — Expected: PASS.
- [ ] **Step 5: Manual check** with `pnpm dev`, two tabs: put the host tab offline in devtools for 60 s, back online → guest returns to the board at the same state.
- [ ] **Step 6: Commit** `feat(session): guests wait about two minutes for the host`.

---

## Part C — joining a running match as a spectator (one PR)

### Task 9: reproduce and fix

**Files:** decided by the reproduction; start from `network/lobby/admission.ts`, `pages/lobby/_InviteScreen.tsx`, `useLobby.ts` (`matchRunning` at the two `resolveJoinAdmission` call sites), and the post-admission routing.

The admission rule already admits a spectator while `matchRunning`; the defect is elsewhere and must be found, not assumed.

- [ ] **Step 1: Write the end-to-end test** in `useLobby.test.ts`: `a peer with no seat opening a running room is admitted as spectator and receives a spectator sync` — host + one guest start a match; a third peer dials with no resume token and `requestedRole: 'player'`; expect role `guest`, a spectator `SYNC`, and `where === 'game'`. Add the same after `restoreHost` (`matchRunning` must be true there).
- [ ] **Step 2: Run** — if it FAILS, the failing assertion names the defect: fix it, rerun to PASS. If it PASSES, reproduce in the browser with three tabs (`pnpm dev`) and turn whatever fails there into a test first.
- [ ] **Step 3:** If the invite screen still offers a disabled "player" choice during a running match, it routes straight to spectator instead (copy via existing `invite.spectatorOnlyNote`).
- [ ] **Step 4: Run** `pnpm lint && pnpm typecheck && pnpm test` — Expected: PASS.
- [ ] **Step 5: Commit** `fix(lobby): a newcomer to a running match joins as spectator`.
