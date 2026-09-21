# `useLobby` orchestration refactor — Design

**Date:** 2026-09-21
**Project:** ReleaseBoardGameP2P ("Release любой ценой")
**Scope:** A behavior-preserving decomposition of the frontend room orchestration currently implemented in `apps/frontend/src/network/useLobby.ts`.

## Context

`useLobby.ts` has grown to roughly 2,260 lines and its main test file to roughly 4,188 lines. The hook currently owns React view state, live PeerJS resources, connection establishment, host restoration, guest reconnection, protocol routing, chat admission, lobby commands, match keeper wiring, persistence, and teardown.

These responsibilities are individually necessary, but keeping them in one closure makes control flow difficult to read and lifecycle invariants difficult to review. Adding chat exposed the problem further: message order is now sometimes encoded through conditional array spreads and nested inline protocol objects instead of explicit orchestration.

## Goals

- Keep `useLobby(): UseLobby` and every public field and action compatible with current consumers.
- Preserve current network behavior, message ordering, persistence, reconnect, restore, and teardown semantics.
- Make ownership of mutable network resources explicit.
- Separate connection, incoming-message, chat, match, and persistence logic into independently testable controllers.
- Make every ordered protocol operation readable as sequential code.
- Split the monolithic test suite by responsibility while retaining integration coverage for the public hook.

## Non-goals

- No wire-protocol changes.
- No user-visible behavior or layout changes.
- No replacement of PeerJS or the host-authoritative star topology.
- No reducer or state-machine rewrite.
- No redesign of `UseLobby` for consumers.
- No unrelated lobby, match, reconnect, or chat fixes. A defect discovered during extraction receives a failing characterization test and a separate fix commit.

## Public API

`UseLobby` remains the public facade. Existing providers, entities, features, and pages continue to consume the same object with the same stable callback behavior.

The type may be expressed internally as an intersection of smaller view/action types if that improves navigation, but the exported structural shape must not change. The refactor is complete only when consumers require no migration.

## Architecture

`useLobby.ts` remains the React composition root. It owns the visible React state, creates one room runtime and the controllers that operate on it, and returns the memoized `UseLobby` facade. It does not contain protocol routing, keeper construction, storage validation, or connection algorithms.

The implementation uses ordinary TypeScript controllers rather than a chain of custom hooks. This avoids cyclic hook dependencies between connection callbacks, chat admission, match resources, and teardown.

```text
transport callback
  -> message controller
  -> host or guest handler
  -> explicit ordered Outgoing list
  -> dispatcher
  -> runtime commit / resource operation
  -> React facade update
```

### Room runtime

`network/lobby/runtime.ts` owns the imperative resources shared across controllers:

- the active transport and its ownership generation;
- the current lobby state and host flag;
- session epoch and reconnect epoch;
- keeper, remote link, start gate, and referee session;
- public and private seating;
- resume-token lookup;
- pending keeper persistence state.

The runtime contains resource ownership and atomic state/ref synchronization, not product decisions. Controllers ask it for the current resource, commit a next value, or invalidate a lifecycle. It must not become a second monolithic `useLobby` hidden behind a class.

Each state value used both by React and asynchronous callbacks has one write path. That path updates the live runtime value and the React view port together.

### Connection controller

`network/lobby/connectionController.ts` owns:

- room creation and joining;
- transport setup and ownership guards;
- host restore from stored room or match state;
- guest reconnect attempts and retry state;
- session teardown and late-callback invalidation.

It preserves the current generation/epoch rules: an asynchronous create, join, restore, or reconnect attempt may commit only while it still owns the current generation and session epoch.

### Message controller

`network/lobby/messageController.ts` owns the incoming protocol switch and delegates domain work to host and guest handlers. Authentication and sender authority stay at this boundary.

The handler must make ordered effects visible. It builds an `Outgoing[]` through declarations, `if`, `push`, and `for...of`, then dispatches it. It does not encode control flow in array expressions.

### Chat controller

`network/chat/controller.ts` owns:

- member admission and stable member identity;
- canonical host sends and guest send requests;
- history synchronization;
- semantic system events;
- live-entry broadcasts.

It continues to use the existing journal and `useChatSession` model. The host remains the only authority for canonical IDs, sequences, timestamps, authors, and roles.

### Match controller

`network/session/matchController.ts` owns:

- starting and attaching a match;
- keeper, remote link, and start-gate lifecycle;
- frozen public/private seating;
- intro readiness;
- leaving a match while retaining the room;
- rematch cleanup.

It preserves the distinction between leaving a match and leaving the room. Match teardown must not accidentally clear room chat or room restoration state.

### Persistence

`network/session/persistence.ts` owns keeper snapshot normalization, lobby-configuration validation, match sequence restoration, and the throttled keeper writer. Room-code parsing may live in a small lobby helper module.

Persistence code remains independent of React. It receives current values explicitly and exposes cancellation so room teardown cannot be followed by a trailing write that resurrects a discarded session.

## Protocol construction style

`network/lobby/messages.ts` exposes typed message factories for frequently constructed frames and outgoing envelopes. Names describe intent, for example `playerKicked`, `chatHistory`, `chatEntry`, `gameStarting`, and `lobbyConfigUpdated`.

The following forms are not allowed in the refactored orchestration code:

- conditional spreads such as `...(condition ? [message] : [])`;
- ternaries that return arrays or protocol messages;
- `flatMap` used as an `if` statement;
- large nested wire-message literals inside `dispatch`;
- callbacks whose message ordering can be understood only by evaluating an array expression.

Ordinary object spread for immutable data updates is still allowed. Ordinary array spread is allowed when it copies data and does not hide control flow. Ordered operations use explicit statements:

```ts
const outgoing: Outgoing[] = []

if (replacedPeer) {
  outgoing.push(playerKicked(replacedPeer.id))
}

outgoing.push(...join.outgoing)
outgoing.push(chatHistory(peerId, history, memberId))

for (const entry of chatEntries) {
  outgoing.push(chatEntry(entry))
}
```

Factories only construct typed data. They do not dispatch, persist, or mutate runtime state.

## Error and concurrency handling

- Existing user-visible error classification remains unchanged.
- A controller may surface setup errors through the facade port, but must not silently downgrade or swallow them.
- Stale transport callbacks must fail ownership checks before mutating runtime or React state.
- Teardown invalidates transport, session, and reconnect ownership before closing resources.
- A delayed keeper write is cancelled before stored session data is cleared.
- Host and guest branches continue to validate the authority of incoming frames before applying them.
- Reconnect attempts retain per-attempt settlement; one attempt cannot resolve or clear another attempt's state.

## Tests

The current test behavior is the compatibility contract. Shared fake transports, storage setup, and common room builders move into a test harness. Tests are then divided by responsibility:

- connection creation, join, restore, reconnect, and teardown;
- host and guest message handling and authority;
- chat admission, synchronization, sends, and semantic events;
- lobby commands and configuration;
- match start, keeper, seating, intro, rematch, and leave;
- persistence validation and expiry;
- a smaller `useLobby.test.ts` integration suite for the assembled facade.

Every extraction runs its focused tests, `pnpm typecheck`, and `pnpm lint`. Final verification runs `pnpm test` and `pnpm build`, followed by a two-browser smoke covering create/join, chat, start, reconnect, return to lobby, and disband.

## Migration sequence

1. Remove the completed `docs/specs/2026-09-21-text-chat-plan.md` after confirming that durable decisions remain in the chat design spec.
2. Add typed message factories and replace hidden conditional message construction.
3. Extract room-code, validation, and persistence helpers.
4. Introduce the runtime and move existing resource ownership behind it without changing behavior.
5. Extract chat, match, message, and connection controllers one at a time.
6. Reduce `useLobby.ts` to React composition and the stable public facade.
7. Split the monolithic tests around the new boundaries and retain facade integration tests.

Each step is independently reviewable and keeps the branch buildable. Mechanical moves and behavior fixes are never combined in one commit.

## Documentation policy

The chat design spec remains durable product documentation. The completed text-chat implementation plan is removed because it is an execution checklist, not a maintained specification. The working implementation plan for this refactor is local workflow state and is not committed as product documentation.

## Acceptance criteria

- `UseLobby` consumers compile without modification.
- Existing behavior and protocol tests pass without weakened assertions.
- `useLobby.ts` contains composition and facade code, not domain implementations.
- Shared mutable resources have one explicit owner and one invalidation path.
- Ordered message code contains no conditional spreads, array-returning ternaries, or `flatMap` control flow.
- Message construction uses typed factories.
- Tests are organized by responsibility and share one harness.
- Full test, typecheck, lint, build, and browser smoke verification pass.
