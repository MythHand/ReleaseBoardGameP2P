# Secure Seat Rejoin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent a peer from claiming another player's seat by replaying identity data exposed in public P2P messages.

**Architecture:** Replace the public `clientId` contract with a host-private `resumeToken`. Public peers and seats contain only display and routing data; the host keeps a separate private seat list carrying tokens and uses it exclusively for rejoin matching and keeper persistence.

**Tech Stack:** TypeScript, React hooks, PeerJS/WebRTC message types, Vitest, Testing Library, sessionStorage.

**Spec:** `docs/specs/2026-09-13-main-review-findings-design.md`

## Global Constraints

- Mixed-version sessions are not supported.
- A resume token must never appear in `PEER_LIST`, `PEER_JOINED`, `GAME_STARTING`, or `SEAT_REBOUND`.
- Unknown or legacy credentials fail closed and never receive a private projection.
- Keep `@release/ui` and engine types independent from browser persistence.
- Do not create a branch, commit, or push unless the user explicitly requests it.

## Implemented Hardening Addendum

Final review tightened the approved design in three ways: `getResumeToken(roomCode)` stores one credential for the active room and rotates it on explicit leave or room change; every created, joined, and restored transport is guarded by an ownership generation; and keeper/client event logs are validated by the engine parser, including event-specific audience semantics. These hardening changes supersede the tab-global token examples below while preserving the original public/private wire boundary.

---

### Task 1: Rename the Browser Credential and Remove It from Public Wire Types

**Files:**
- Modify: `apps/frontend/src/shared/lib/persistence.ts`
- Test: `apps/frontend/src/shared/lib/persistence.test.ts`
- Modify: `apps/frontend/src/network/types.ts`
- Test: `apps/frontend/src/network/envelope.test.ts`
- Test: `apps/frontend/src/network/lobby/state.test.ts`

**Interfaces:**
- Produces: `getResumeToken(): string` backed by `release:resumeToken`.
- Produces: public `PeerInfo` without a credential field.
- Produces: public `Seat` with `{ playerId, peerId, name }` only.
- Produces: `JOIN_REQUEST.payload.resumeToken: string` as the only wire occurrence of the token.

- [ ] **Step 1: Write the failing persistence test**

Replace the `getClientId` stability assertion with the new API and verify that ordinary session cleanup does not rotate the token:

```ts
it('keeps one private resume token for the life of the tab', () => {
  const first = getResumeToken()
  expect(first).toBeTruthy()
  clearSession()
  expect(getResumeToken()).toBe(first)
})
```

- [ ] **Step 2: Update protocol compile-time fixtures before implementation**

Change message fixtures to the new request shape and remove `clientId` from public peer and seat literals:

```ts
const join: Message = {
  type: 'JOIN_REQUEST',
  payload: { name: 'Ann', resumeToken: 'resume-ann' },
}

const peer: PeerInfo = {
  id: 'peer-ann',
  name: 'Ann',
  role: 'player',
  ready: false,
  where: 'lobby',
}
```

- [ ] **Step 3: Run the focused tests to verify failure**

Run:

```bash
pnpm --filter @release/web test -- src/shared/lib/persistence.test.ts src/network/envelope.test.ts src/network/lobby/state.test.ts
```

Expected: TypeScript/Vitest failures because `getResumeToken` and the new message shape do not exist yet.

- [ ] **Step 4: Implement the new storage and public types**

In `persistence.ts`, replace the client key and accessor:

```ts
const RESUME_TOKEN_KEY = 'release:resumeToken'

export function getResumeToken(): string {
  const existing = read(RESUME_TOKEN_KEY)
  if (existing) return existing
  const minted = crypto.randomUUID()
  write(RESUME_TOKEN_KEY, minted)
  return minted
}
```

In `types.ts`, make credentials absent from public data by construction:

```ts
export interface PeerInfo {
  id: string
  name: string
  role: Role
  ready: boolean
  where: Where
}

export interface Seat {
  playerId: PlayerId
  peerId: string
  name: string
}

export type Message =
  | { type: 'JOIN_REQUEST'; payload: { name: string; resumeToken: string } }
  | { type: 'PEER_LIST'; payload: { peers: PeerInfo[]; yourRole: Role } }
  | {
      type: 'PEER_JOINED'
      payload: { id: string; name: string; role: Role; ready: boolean; where: Where }
    }
```

The union members from `PLAYER_READY` through `KEEPER_CHANGED` retain their current payloads; `GAME_STARTING` automatically becomes public because its existing `seats: Seat[]` now uses the credential-free type.

- [ ] **Step 5: Run the focused tests to verify the new contract passes**

Run the command from Step 3. Expected: all selected tests pass.

- [ ] **Step 6: Inspect the credential surface**

Run:

```bash
rg -n "clientId|resumeToken" apps/frontend/src/network apps/frontend/src/entities/game apps/frontend/src/shared/lib
```

Expected after later tasks: `resumeToken` appears only in private host state, persistence, and `JOIN_REQUEST`; no public payload includes it. At this task boundary, remaining `clientId` compile failures identify the exact integration sites for Tasks 2 and 3.

---

### Task 2: Add Private Seats and Pure Rejoin Matching

**Files:**
- Modify: `apps/frontend/src/entities/game/seats.ts`
- Test: `apps/frontend/src/entities/game/seats.test.ts`
- Modify: `apps/frontend/src/network/lobby/host.ts`
- Test: `apps/frontend/src/network/lobby/host.test.ts`

**Interfaces:**
- Consumes: public `PeerInfo` and `Seat` from Task 1.
- Produces: `PrivateSeat { seat: Seat; resumeToken: string }` in the seating module; composition prevents structural assignment to `Seat[]`.
- Produces: `privateSeatsFor(seats, tokensByPeer)` and `publicSeats(privateSeats)`.
- Produces: `handleJoinRequest(state, fromId, name, returningSeat?)`; credential matching stays outside the public lobby reducer.

- [ ] **Step 1: Write failing seating tests**

Add tests that prove public conversion strips the credential and missing credentials fail before a match starts:

```ts
it('builds host-private seats and strips credentials for the wire', () => {
  const seats = seatsFor(peers)
  const privateSeats = privateSeatsFor(seats, new Map([['peer-a', 'resume-a']]))
  expect(privateSeats[0]).toEqual({
    seat: { playerId: 'p1', peerId: 'peer-a', name: 'Ann' },
    resumeToken: 'resume-a',
  })
  expect(publicSeats(privateSeats)[0]).toEqual({ playerId: 'p1', peerId: 'peer-a', name: 'Ann' })
})

it('refuses to start with a player whose private credential is missing', () => {
  expect(() => privateSeatsFor(seatsFor(peers), new Map())).toThrow('missing resume token')
})
```

- [ ] **Step 2: Write failing host reducer tests**

Change rejoin tests to pass an already-authenticated public seat rather than a credential-bearing list:

```ts
it('rebinds only when the caller supplied an authenticated returning seat', () => {
  const returningSeat = { playerId: 'p2', peerId: 'dead-peer', name: 'Bo' }
  const result = handleJoinRequest(returningBase(), 'fresh-peer', 'Bo', {
    matchRunning: true,
    returningSeat,
  })
  expect(result.outgoing).toContainEqual({
    to: 'broadcast',
    message: { type: 'SEAT_REBOUND', payload: { playerId: 'p2', peerId: 'fresh-peer' } },
  })
})

it('treats a join with no authenticated seat as ordinary', () => {
  const result = handleJoinRequest(returningBase(), 'newcomer', 'Cy', {
    matchRunning: true,
  })
  expect(result.state.peers.newcomer.role).toBe('guest')
  expect(result.outgoing.some((item) => item.message.type === 'SEAT_REBOUND')).toBe(false)
})
```

- [ ] **Step 3: Run focused tests to verify failure**

Run:

```bash
pnpm --filter @release/web test -- src/entities/game/seats.test.ts src/network/lobby/host.test.ts
```

Expected: failures for missing private-seat helpers and the old reducer signature.

- [ ] **Step 4: Implement private seat helpers**

Use a separate type that cannot be assigned accidentally to a public wire payload without an explicit conversion:

```ts
export interface PrivateSeat {
  seat: Seat
  resumeToken: string
}

export function privateSeatsFor(
  seats: Seat[],
  tokensByPeer: ReadonlyMap<string, string>,
): PrivateSeat[] {
  return seats.map((seat) => {
    const resumeToken = tokensByPeer.get(seat.peerId)
    if (!resumeToken) throw new Error(`missing resume token for ${seat.peerId}`)
    return { seat, resumeToken }
  })
}

export const publicSeats = (seats: PrivateSeat[]): Seat[] =>
  seats.map(({ seat }) => seat)
```

Update `seatsFor` so it no longer reads a credential from `PeerInfo`.

- [ ] **Step 5: Make `handleJoinRequest` consume an authenticated seat**

Replace its token lookup with:

```ts
export function handleJoinRequest(
  state: LobbyState,
  fromId: string,
  name: string,
  options: { matchRunning: boolean; returningSeat?: Seat },
): Result {
  const role: Role = options.returningSeat
    ? fromId === state.hostId
      ? 'host'
      : 'player'
    : options.matchRunning
      ? 'guest'
      : assignRole(state)
  // construct only public PeerInfo and public outgoing payloads
}
```

- [ ] **Step 6: Run focused tests and typecheck**

Run:

```bash
pnpm --filter @release/web test -- src/entities/game/seats.test.ts src/network/lobby/host.test.ts
pnpm --filter @release/web typecheck
```

Expected: tests pass; typecheck now points only to `useLobby` and persistence sites intentionally handled in Task 3.

---

### Task 3: Integrate Private Credentials into Lobby, Rejoin, and Persistence

**Files:**
- Modify: `apps/frontend/src/network/useLobby.ts`
- Test: `apps/frontend/src/network/useLobby.test.ts`
- Modify: `apps/frontend/src/shared/lib/persistence.ts`
- Test: `apps/frontend/src/shared/lib/persistence.test.ts`

**Interfaces:**
- Consumes: `getResumeToken`, `PrivateSeat`, `privateSeatsFor`, and `publicSeats`.
- Produces: host-only `resumeTokensRef` keyed by live peer ID.
- Produces: host-only `privateSeatsRef` for match rejoin and keeper snapshots.
- Changes: `StoredKeeper.privateSeats` replaces credential-bearing `lobbySeats`.

- [ ] **Step 1: Write the public-payload regression test**

Start a two-peer lobby and inspect every outgoing public message:

```ts
const frames = [...transports[0].send.mock.calls, ...transports[0].broadcast.mock.calls]
expect(JSON.stringify(frames)).not.toContain('resume-guest')
expect(JSON.stringify(frames)).not.toContain('resume-host')
```

The only allowed frame containing a token is the guest's direct `JOIN_REQUEST` to the host.

- [ ] **Step 2: Write legitimate and forged rejoin tests**

Extend the existing host rejoin fixture so it starts a match with Bo, disconnects Bo, and reads Bo's private token from the host-only keeper snapshot. Drive the legitimate return with that exact token:

```ts
const bo = (storedKeeper()?.privateSeats as PrivateSeat[]).find(
  ({ seat }) => seat.name === 'Bo',
)
act(() => {
  transports[0].onMessage?.({
    type: 'JOIN_REQUEST',
    payload: { name: 'Bo', resumeToken: bo?.resumeToken ?? '' },
    from: 'bo-returned',
    seq: 10,
  } as WireMessage)
})
expect(sentTo('bo-returned').some((message) => message.type === 'GAME_STARTING')).toBe(true)
expect(transports[0].broadcast).toHaveBeenCalledWith({
  type: 'SEAT_REBOUND',
  payload: { playerId: bo?.seat.playerId, peerId: 'bo-returned' },
})
```

Reset the mocks, send a different token from Mallory, and assert the fail-closed path:

```ts
act(() => {
  transports[0].onMessage?.({
    type: 'JOIN_REQUEST',
    payload: { name: 'Mallory', resumeToken: 'not-the-seat-token' },
    from: 'mallory-peer',
    seq: 11,
  } as WireMessage)
})
expect(sentTo('mallory-peer').some((message) => message.type === 'GAME_STARTING')).toBe(false)
expect(transports[0].broadcast).not.toHaveBeenCalledWith(
  expect.objectContaining({ type: 'SEAT_REBOUND' }),
)
expect(result.current.state?.peers['mallory-peer'].role).toBe('guest')
```

- [ ] **Step 3: Write the fail-closed snapshot migration test**

Persist a legacy keeper record containing `lobbySeats` but no `privateSeats`, mount `useLobby`, and assert that no game is restored and the stale keeper record is cleared.

- [ ] **Step 4: Run the tests to verify failure**

Run:

```bash
pnpm --filter @release/web test -- src/network/useLobby.test.ts src/shared/lib/persistence.test.ts
```

Expected: failures because tokens are still stored in public state and legacy snapshots are still adopted.

- [ ] **Step 5: Add host-private refs and sanitize start messages**

In `useLobby`, add:

```ts
const resumeTokensRef = useRef(new Map<string, string>())
const privateSeatsRef = useRef<PrivateSeat[]>([])
```

On host creation, store the host token by peer ID. On every `JOIN_REQUEST`, store the submitted token for a normal lobby join, or authenticate it against `privateSeatsRef.current` during a match. Pass only the matched public seat to `handleJoinRequest`. During a match, an unmatched request is explicitly a spectator even when the live roster has spare player capacity.

At game start:

```ts
const seating = seatsFor(current.peers)
const privateSeats = privateSeatsFor(seating, resumeTokensRef.current)
privateSeatsRef.current = privateSeats
applySeats(seating)
dispatch([{ to: 'broadcast', message: { type: 'GAME_STARTING', payload: { gameId: id, seats: seating } } }])
```

- [ ] **Step 6: Persist and restore only private host seating**

Change the keeper schema to:

```ts
export interface StoredKeeper {
  gameId: string
  keeperId: string
  state: unknown
  seats: unknown
  privateSeats: unknown
  log: unknown[]
  savedAt: number
}
```

Before adoption, validate that `privateSeats` is an array and every entry has a `seat` object with non-empty string `playerId`, `peerId`, and `name`, plus a non-empty string `resumeToken`. If not, clear the keeper snapshot and return `false`; do not fall back to legacy `clientId`.

Restore the private ref and derive the public seats explicitly:

```ts
privateSeatsRef.current = snapshot.privateSeats as PrivateSeat[]
applySeats(publicSeats(privateSeatsRef.current))
```

- [ ] **Step 7: Send only the local token in `JOIN_REQUEST`**

Replace every `getClientId()` call used by guest join/reconnect with:

```ts
payload: { name, resumeToken: getResumeToken() }
```

Remove credentials from every host and guest `PeerInfo` literal.

- [ ] **Step 8: Run focused tests and inspect all wire constructors**

Run:

```bash
pnpm --filter @release/web test -- src/network/useLobby.test.ts src/network/lobby/host.test.ts src/entities/game/seats.test.ts src/shared/lib/persistence.test.ts src/network/envelope.test.ts
rg -n "clientId|resumeToken" apps/frontend/src/network apps/frontend/src/entities/game apps/frontend/src/shared/lib
```

Expected: tests pass; no `clientId` remains; every `resumeToken` occurrence is private or the direct join request.

---

### Task 4: Security Verification Gate

**Files:**
- Verify only; no planned source changes.

**Interfaces:**
- Consumes: completed Tasks 1–3.
- Produces: evidence that issue #146 is safe to close.

- [ ] **Step 1: Run the complete frontend test suite**

```bash
pnpm --filter @release/web test
```

Expected: zero failing tests.

- [ ] **Step 2: Run frontend typecheck and repository lint**

```bash
pnpm --filter @release/web typecheck
pnpm lint
```

Expected: both commands exit successfully with no warnings promoted to failures.

- [ ] **Step 3: Review the final diff for credential leakage**

```bash
git diff --check
git diff -- apps/frontend/src/network apps/frontend/src/entities/game/seats.ts apps/frontend/src/shared/lib/persistence.ts
```

Confirm manually that no public message serializer can receive `PrivateSeat[]` and that legacy snapshots fail closed.

- [ ] **Step 4: Present the verification result**

Report changed files, exact test counts, and any unrelated failures. Do not commit or push without a new explicit request.
