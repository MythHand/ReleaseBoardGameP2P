# Main Review Regressions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix six reconnect, restore, animation, and history regressions already present on `main`.

**Architecture:** Keep each correction inside its existing owner: lobby transport lifecycle, game-feed persistence, keeper restoration, board-beat planning, and Move History scrolling. The host restore task consumes the private-seat model introduced by issue #146; all other tasks are behaviorally independent.

**Tech Stack:** TypeScript, React hooks, Vitest, Testing Library, fake timers, UI animation planning.

**Spec:** `docs/specs/2026-09-13-main-review-findings-design.md`

## Global Constraints

- Complete `docs/specs/2026-09-13-secure-seat-rejoin-plan.md` first because Task 3 modifies the same persistence and lobby restore code.
- Preserve the frozen board beneath reconnect UI; replacing the link must not invent a new game state.
- Restored events must never replay as fresh animation beats.
- Missing optional lobby configuration in an older valid private-seat snapshot falls back to current defaults.
- Do not create a branch, commit, or push unless the user explicitly requests it.

## Implemented Hardening Addendum

Combined final review expanded the lifecycle work beyond the original six regressions: explicit Create/Join performs full session teardown while same-room reconnect preserves the frozen board; stale callbacks are rejected for guest, created-host, and restored-host transports; and persisted event feeds are engine-validated before synchronous restore. These changes are part of the completed regression verification scope.

---

### Task 1: Rebuild the Guest Remote Link on a Replacement Transport

**Files:**
- Modify: `apps/frontend/src/network/useLobby.ts`
- Test: `apps/frontend/src/network/useLobby.test.ts`

**Interfaces:**
- Consumes: existing `RemoteHandle.link.close()` and `joinRoom` reconnect loop.
- Produces: `resetRemoteLink()` callback that closes subscribers, clears `remoteRef`, and clears `gameLink` without clearing the last `gameSync`.

- [ ] **Step 1: Write the failing reconnect-submit test**

Extend the host-drop test through the complete second handshake:

```ts
act(() => first.onDisconnect?.(hostId))
const second = transports[1]
act(() => second.onConnection?.(hostId))
act(() => {
  second.onMessage?.({
    type: 'GAME_STARTING',
    payload: { gameId: 'g1', seats: SEATING },
    from: hostId,
    seq: 2,
  } as WireMessage)
})
act(() => result.current.gameLink?.submit({ type: 'DRAW' }))
expect(second.send).toHaveBeenCalledWith(hostId, {
  type: 'INTENT',
  payload: { intent: { type: 'DRAW' } },
})
expect(first.send).not.toHaveBeenLastCalledWith(hostId, expect.objectContaining({ type: 'INTENT' }))
```

- [ ] **Step 2: Run the test to verify failure**

```bash
pnpm --filter @release/web test -- src/network/useLobby.test.ts
```

Expected: the intent is sent through the first closed transport or never reaches the second transport.

- [ ] **Step 3: Implement one remote-link reset path**

Add and reuse:

```ts
const resetRemoteLink = useCallback(() => {
  remoteRef.current?.link.close()
  remoteRef.current = null
  setGameLink(null)
}, [])
```

Call it immediately before `joinRoom` replaces `transportRef.current`. Keep `gameSync` intact so the reconnect overlay remains over the last authoritative board. Keep `leaveSession` using the same helper before it clears the sync.

- [ ] **Step 4: Run focused reconnect tests**

```bash
pnpm --filter @release/web test -- src/network/useLobby.test.ts
```

Expected: reconnect tests pass and the post-reconnect intent uses the second transport.

---

### Task 2: Load a Stored Event Feed When a Restored Game ID Arrives Late

**Files:**
- Modify: `apps/frontend/src/features/play-game/useGame.ts`
- Test: `apps/frontend/src/features/play-game/useGame.test.tsx`

**Interfaces:**
- Consumes: `readLog(gameId)`, `clearLog()`, `mergeEvents`, and React `useMemo`.
- Produces: a render-time `storedForGame` snapshot plus an effect that commits exactly that snapshot to state.

- [ ] **Step 1: Write the failing late-ID restoration test**

```ts
it('loads the stored feed when restore supplies gameId after mount', () => {
  writeLog({ gameId: 'g1', events: [dealt('p1'), drawn('p1')], savedAt: Date.now() })
  session = { gameLink: null, gameSync: null, gameId: null }
  const seen: { events: Event[] }[] = []
  const { rerender } = render(<Probe seen={seen} />)

  session = { gameLink: null, gameSync: { view: view(), events: [] }, gameId: 'g1' }
  rerender(<Probe seen={seen} />)

  expect(seen[0].events.map((event) => event.id)).toEqual([1, 3])
})
```

Add a companion assertion that `restoredThrough` is `3` on the same first layout-effect observation.

- [ ] **Step 2: Run the focused test to verify failure**

```bash
pnpm --filter @release/web test -- src/features/play-game/useGame.test.tsx
```

Expected: the observed feed is empty because the transition effect clears the stored record.

- [ ] **Step 3: Read the incoming game's feed synchronously**

Memoize the synchronous storage read by game ID, then expose it on the transition render before any layout effect can arm animations:

```ts
const storedForGame = useMemo(
  () => (gameId ? ((readLog(gameId) ?? null) as Event[] | null) : null),
  [gameId],
)
const incomingEvents = !sameGame ? (storedForGame ?? []) : []

if (seenGame.current !== gameId) {
  seenGame.current = gameId
  seenSync.current = null
  if (!storedForGame) clearLog()
  restoredThrough.current = incomingEvents.at(-1)?.id ?? 0
  setEvents(incomingEvents)
}
```

Replace the current transition value with `const carried = sameGame ? events : incomingEvents`. Compute the base high-water mark from `incomingEvents.at(-1)?.id ?? 0` when `sameGame` is false, then retain the existing pending-resync override. Preserve the existing `sameGame` write guard so outgoing events cannot be written under the new ID. Use the null result from `readLog`, not array length, to distinguish a missing record from a valid empty feed.

- [ ] **Step 4: Run all `useGame` tests**

```bash
pnpm --filter @release/web test -- src/features/play-game/useGame.test.tsx
```

Expected: late restoration, direct mount restoration, no cross-game leakage, resync high-water marking, and rejection filtering all pass.

---

### Task 3: Restore Seating Before Resync and Preserve Lobby Configuration

**Files:**
- Modify: `apps/frontend/src/shared/lib/persistence.ts`
- Test: `apps/frontend/src/shared/lib/persistence.test.ts`
- Modify: `apps/frontend/src/network/useLobby.ts`
- Test: `apps/frontend/src/network/useLobby.test.ts`

**Interfaces:**
- Consumes: private keeper seating from issue #146.
- Produces: `StoredKeeper.lobbyConfig?: { maxPlayers: number; setup: unknown }`.
- Produces: restore order `private seats -> public seats -> lobby state -> keeper resync`.

- [ ] **Step 1: Write the failing second-reload snapshot test**

Use fake timers and inspect the serialized record after the first restore's trailing save:

```ts
it('does not replace restored seating with an empty snapshot', async () => {
  vi.useFakeTimers()
  storedHostSession('g1')
  const original = storedKeeperSnapshot('peer0')
  renderHook(() => useLobby())
  await act(async () => Promise.resolve())
  act(() => vi.advanceTimersByTime(KEEPER_SAVE_MS))
  expect(storedKeeper()?.privateSeats).toEqual(original.privateSeats)
  vi.useRealTimers()
})
```

- [ ] **Step 2: Write the failing non-default rematch test**

Build a snapshot with `maxPlayers: 3` and a non-default setup, restore it, call `leaveGame()` and `startGame()`, then inspect the engine/session snapshot or outgoing `GAME_STARTING` setup path:

```ts
expect(result.current.state?.maxPlayers).toBe(3)
expect(result.current.state?.setup).toEqual(nonDefaultSetup)
```

- [ ] **Step 3: Run focused persistence and restore tests to verify failure**

```bash
pnpm --filter @release/web test -- src/shared/lib/persistence.test.ts src/network/useLobby.test.ts
```

Expected: the first test observes empty persisted seating and the second observes defaults.

- [ ] **Step 4: Extend the keeper snapshot configuration**

Add:

```ts
export interface StoredLobbyConfig {
  maxPlayers: number
  setup: unknown
}

export interface StoredKeeper {
  gameId: string
  keeperId: string
  state: unknown
  seats: unknown
  privateSeats: unknown
  log: unknown[]
  savedAt: number
  lobbyConfig?: StoredLobbyConfig
}
```

In `persistKeeper`, snapshot the current lobby state at commit time:

```ts
const lobby = stateRef.current
lobbyConfig: lobby
  ? { maxPlayers: lobby.maxPlayers, setup: lobby.setup }
  : undefined,
```

- [ ] **Step 5: Reorder host restoration**

Before `keeper.resync()`, restore private seats and public state:

```ts
privateSeatsRef.current = restoredPrivateSeats
applySeats(publicSeats(restoredPrivateSeats))
const lobbyConfig = snapshot.lobbyConfig
commit(
  createLobbyState({
    selfId: t.id,
    hostId: t.id,
    maxPlayers: lobbyConfig?.maxPlayers ?? 6,
    setup: (lobbyConfig?.setup as Setup | undefined) ?? restoredGameState.setup,
    peers: [restoredHostPeer],
  }),
)
keeper.resync()
```

The restored seats must be in refs before `resync()` invokes `onCommit`.

- [ ] **Step 6: Run focused tests**

```bash
pnpm --filter @release/web test -- src/shared/lib/persistence.test.ts src/network/useLobby.test.ts
```

Expected: both new regressions and all existing host restore tests pass.

---

### Task 4: Gate AI Homeward Planning by Card Deck

**Files:**
- Modify: `apps/frontend/src/features/board-beats/planBeats.ts`
- Test: `apps/frontend/src/features/board-beats/planBeats.test.ts`

**Interfaces:**
- Consumes: `cardById(source)?.deck` from `@release/ui`.
- Produces: `homewardOf(before)` only for `deck === 'ai'`.

- [ ] **Step 1: Write the failing Cherry-pick test**

```ts
it('does not send Git Cherry-pick to the AI deck after taking a discard', () => {
  const before = boardBefore({
    pending: {
      kind: 'pickFromDiscard',
      player: 'p1',
      options: [],
      picks: 1,
      source: 'operation-git-cherry-pick',
    },
  } as Partial<BoardState>)
  const plans = planBeats(
    [{ id: 20, type: 'takenFromDiscard', player: 'p1', card: 'release-frontend', to: 'hand' }],
    before,
  )
  expect(plans[0]).not.toHaveProperty('homeward')
})
```

Keep the existing AI Inside assertion expecting `homeward: 'ai-inside'`.

- [ ] **Step 2: Run the test to verify failure**

```bash
pnpm --filter @release/web test -- src/features/board-beats/planBeats.test.ts
```

Expected: Cherry-pick incorrectly has `homeward`.

- [ ] **Step 3: Implement the deck guard**

```ts
const homewardOf = (before: BoardState): { homeward?: string } => {
  const pending = before.pending
  if (!pending || !('source' in pending) || !pending.source) return {}
  return cardById(pending.source)?.deck === 'ai' ? { homeward: pending.source } : {}
}
```

- [ ] **Step 4: Run the complete beat-planning test file**

Run the command from Step 2. Expected: Cherry-pick has no carrier and AI prompt resolutions retain theirs.

---

### Task 5: Follow Nested Move History Arrivals

**Files:**
- Modify: `apps/ui/src/table/MoveHistory/MoveHistory.tsx`
- Test: `apps/ui/src/table/MoveHistory/MoveHistory.test.tsx`

**Interfaces:**
- Produces: `latestEntryId(entries: HistoryEntry[]): number` that recursively observes descendants.
- Consumes: existing `followTail(viewport)` behavior, including its scrolled-up guard.

- [ ] **Step 1: Write the failing nested-arrival test**

```ts
it('follows when a child is appended without changing the root count', () => {
  const root: HistoryEntry = { id: 1, who: 'Ann', kind: 'attack', children: [] }
  const { rerender } = render(<MoveHistory copy={copy} entries={[root]} />)
  vi.mocked(followTail).mockClear()

  rerender(
    <MoveHistory
      copy={copy}
      entries={[{ ...root, children: [{ id: 2, who: 'Bo', kind: 'defend' }] }]}
    />,
  )

  expect(followTail).toHaveBeenCalled()
})
```

- [ ] **Step 2: Run the test to verify failure**

```bash
pnpm --filter @release/ui test -- src/table/MoveHistory/MoveHistory.test.tsx
```

Expected: `followTail` is not called after the rerender because root length stays `1`.

- [ ] **Step 3: Implement a recursive dependency**

```ts
const latestEntryId = (entries: HistoryEntry[]): number =>
  entries.reduce(
    (latest, entry) => Math.max(latest, entry.id, latestEntryId(entry.children ?? [])),
    0,
  )

const latestId = latestEntryId(entries)
useLayoutEffect(follow, [latestId])
```

Keep `followTail` itself unchanged; its viewport-distance check already protects readers who intentionally scrolled up.

- [ ] **Step 4: Run component and helper tests**

```bash
pnpm --filter @release/ui test -- src/table/MoveHistory/MoveHistory.test.tsx src/table/MoveHistory/followTail.test.ts
```

Expected: mount following, nested following, and scrolled-up preservation all pass.

---

### Task 6: Regression Verification Gate

**Files:**
- Verify only; no planned source changes.

**Interfaces:**
- Consumes: completed Tasks 1–5 and issue #146.
- Produces: evidence that issue #147 is safe to close.

- [ ] **Step 1: Run focused suites together**

```bash
pnpm --filter @release/web test -- src/network/useLobby.test.ts src/shared/lib/persistence.test.ts src/features/play-game/useGame.test.tsx src/features/board-beats/planBeats.test.ts
pnpm --filter @release/ui test -- src/table/MoveHistory/MoveHistory.test.tsx src/table/MoveHistory/followTail.test.ts
```

Expected: zero failing tests.

- [ ] **Step 2: Run complete package tests**

```bash
pnpm --filter @release/web test
pnpm --filter @release/ui test
```

Expected: zero failing tests.

- [ ] **Step 3: Run type checks and lint**

```bash
pnpm --filter @release/web typecheck
pnpm --filter @release/ui typecheck
pnpm lint
```

Expected: every command exits successfully.

- [ ] **Step 4: Inspect final scope**

```bash
git diff --check
git status --short
git diff --stat
```

Confirm that only the two approved issues, their tests, and their documentation changed.

- [ ] **Step 5: Present the verification result**

Report exact test counts, commands, changed files, and any unrelated failures. Do not commit or push without a new explicit request.
