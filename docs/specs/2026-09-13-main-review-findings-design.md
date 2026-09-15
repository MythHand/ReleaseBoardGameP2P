# Main Review Findings: Rejoin Security and Regression Fixes

## Status

Approved in chat on 2026-09-13 and stored in the repository's canonical `docs/specs` directory.

Tracking issues:

- [#146 — Secure the P2P seat rejoin credential](https://github.com/MythHand/ReleaseBoardGameP2P/issues/146)
- [#147 — Fix reconnect, restore, Cherry-pick, and Move History regressions](https://github.com/MythHand/ReleaseBoardGameP2P/issues/147)

## Scope

This work fixes seven findings that are already present on `main`. The security change is isolated in issue #146 because it changes the wire contract. The remaining six behavior defects are grouped in issue #147 because they are independent corrections to existing flows.

Mixed-version sessions are not supported. Every peer in a running room must use the same protocol version.

## Issue #146: Private Seat Rejoin Credential

### Problem

The current `clientId` is both a browser identity and the only proof that a reconnecting peer owns a frozen seat. The host publishes that value in roster and seating messages, so any participant can replay another player's value and claim the seat, its private projection, and its actions.

### Chosen Approach

Separate public seating data from the private rejoin credential.

- Each browser keeps a random room-scoped `resumeToken` in `sessionStorage`.
- `JOIN_REQUEST` sends the token directly to the host.
- The host keeps the token in private lobby and keeper state.
- Public roster and seating payloads contain no token.
- Rejoin matching happens only against the host's private frozen seating.

This keeps reconnect authentication host-private without adding a second credential-delivery handshake. The token is bound to one room, reused only while reconnecting to that room, and rotated when the browser explicitly leaves or starts/joins another room so a former host cannot replay it elsewhere.

### Data Boundaries

Public data may contain:

- peer ID;
- player ID;
- display name;
- role, readiness, and whereabouts.

Private host data additionally contains:

- `resumeToken` for each player seat.

The public `Seat` type must not include `resumeToken`. A separate host-only credential record carries `{ seat: Seat, resumeToken: string }` by composition rather than extending `Seat`; TypeScript must reject passing the private record directly to `GAME_STARTING`. `PEER_LIST`, `PEER_JOINED`, and `SEAT_REBOUND` likewise accept only public shapes.

### Join and Rejoin Flow

1. A browser creates or reads the `resumeToken` stored for the current room from `sessionStorage`.
2. It sends the token only in `JOIN_REQUEST` to the host.
3. In the lobby, the host stores the token privately alongside that peer.
4. When a match starts, the host freezes private seats with their tokens and broadcasts sanitized public seats.
5. On reconnect, the host matches the submitted token against a private vacant or stale seat.
6. A matching token rebinds that seat. During a running match, an unknown token joins only as a spectator and never receives another seat's projection.
7. A duplicate token is rejected, and an explicit leave or room change rotates the browser credential.

The token is not rotated while reconnecting to the same match. Leaving, disbanding, or explicitly switching rooms removes it and therefore its ability to resume that match.

### Persistence

Keeper snapshots retain the host-private seating needed for rejoin. Guest persistence stores only that guest's own token and room metadata. Existing snapshots without the new private shape are treated as non-restorable; no insecure compatibility fallback is allowed.

### Security Tests

- A legitimate reload with the original token rebinds the same seat and receives the same private hand.
- A peer cannot learn another player's token from any public protocol message.
- Replaying public roster or seating data cannot claim another seat.
- An unknown token does not trigger `SEAT_REBOUND` or private `SYNC` delivery.
- Restoring an old snapshot without private credentials fails closed.
- A token learned by a host in one room cannot authenticate a seat in another room.
- Duplicate live credentials cannot produce an ambiguous private seating snapshot.

## Issue #147: Six Regression Fixes

### Guest Reconnect Uses the New Transport

When `joinRoom` replaces a dead transport, it must close and clear the existing `RemoteHandle` and its subscription. The next `GAME_STARTING` creates a new remote link over the new transport. A regression test reconnects a guest, submits an intent, and asserts that the frame is sent through the replacement transport rather than the closed one.

### Event Log Restores After Reload

When `gameId` changes from `null` to a restored match ID, `useGame` reads the matching stored log synchronously during that render instead of treating the transition as a new match and clearing it. The returned `events` and `restoredThrough` therefore already cover the restored feed in the first layout effect that sees the restored projection. A passive effect then commits the same feed to hook state. A genuinely new game still starts with an empty feed.

Both client and keeper logs pass through the engine-owned parser before adoption. It rejects unknown fields, invalid ordering, malformed events, and audience metadata that does not match the privacy semantics of the event type, preventing corrupt storage from publishing private card identities.

Tests cover both transitions:

- mount with `gameId: null`, then restore a matching ID and log;
- move from one real game ID to a different new game ID without carrying history across.

### Keeper Snapshot Preserves Lobby Seating

Host restoration validates `snapshot.privateSeats`, derives public seats into `seatsRef`, and restores lobby configuration before the first `keeper.resync()`. Therefore the `onCommit` persistence callback cannot enqueue a replacement snapshot with empty private seating or default configuration. A fake-timer test advances past the trailing save and verifies that a second restore still has every private seat and name.

### Rematch Preserves Lobby Configuration

The keeper snapshot stores the lobby's `maxPlayers` and `setup` alongside its game state. Host restoration recreates the lobby from that stored configuration. Older snapshots without this field use the existing defaults, but no current snapshot silently resets a non-default match.

Tests restore a non-default setup and capacity, leave the completed match for the lobby, and assert that the next `startGame` receives the same setup.

### Cherry-pick Does Not Return to the AI Deck

`homewardOf` returns a source only when the source card exists and belongs to the AI deck. A Git Cherry-pick `pickFromDiscard` pending therefore plans the taken card animation without an AI homeward carrier. Existing AI Inside, Crush, and other prompt-resolution paths keep their return animation.

Tests cover one Cherry-pick resolution and one AI Inside resolution to pin both sides of the condition.

### Move History Follows Nested Arrivals

Tail-following depends on a value that changes for every rendered event, including descendants. The preferred dependency is the highest/latest recursive entry ID rather than root `entries.length`. It preserves the existing rule that an intentionally scrolled-up reader is not pulled back to the bottom.

Tests append a child to an existing root while the viewport is at the tail and while it is intentionally scrolled up.

## Error Handling

- Invalid or missing resume credentials fail closed and never restore a private seat.
- Storage failures retain the current in-memory fallback behavior.
- A reconnect failure keeps the existing retry and error UI; clearing the old remote link must not report success before the new link is usable.
- Missing optional lobby configuration in an old snapshot uses defaults without throwing.

## Validation

Implementation follows test-driven development: add a failing regression test for each finding, confirm the failure, apply the minimum fix, then confirm the test passes.

Final validation includes:

- focused networking and persistence tests;
- focused board-beat and Move History tests;
- the complete frontend and UI test suites;
- frontend and UI type checks;
- repository lint and formatting checks applicable to changed files.

## Non-Goals

- Supporting mixed protocol versions in one room.
- Adding a backend identity service or account authentication.
- Rotating credentials during a live match.
- Refactoring unrelated lobby, animation, or history code.
- Fixing the two separate PR #128 licensing/documentation comments tracked outside issues #146 and #147.
