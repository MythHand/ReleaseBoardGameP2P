# Game page wiring — Plan

Supersedes tasks 13–17 of [`2026-07-31-table-interaction-plan.md`](./2026-07-31-table-interaction-plan.md), whose `useGame` design predates the P2P sync layer landing.

## What changed

[`2026-07-31-table-interaction-design.md`](./2026-07-31-table-interaction-design.md) assumed piece 4 of #18 — the sync layer — was still deferred, and specified a `useGame` that owns `GameState` and calls `reduce` itself.

It is not deferred. #60 closed and merged as #63: `apps/frontend/src/network/session/` ships the referee, the keeper, the projection wire, presence, handover, and the `GameLink` seam. `link.ts:19` states the intent plainly:

> "`useGame` and the page hold this and nothing else, so they cannot tell a local engine from a remote keeper."

A `useGame` that owned `GameState` would bypass that seam and give solo play a different code path from networked play — the one thing the seam exists to prevent. So the page consumes `GameLink`, and nothing else.

## The gap, precisely

Three complete subsystems, no composition root:

1. `packages/engine` — rules, projection, legality. 157 tests.
2. `network/session/` — the keeper and the seam. Every entry point (`createSession`, `attachKeeper`, `createRemoteLink`, `applyIntent`, `tick`, `handover`) has **zero non-test call sites**, and `network/index.ts` exports none of it.
3. `apps/ui` `Table` — interactive, emitting completed intents. Fed `PLACEHOLDER_STATE`.

## Decisions

1. **`useLobby` is the composition root.** It already owns the transport and routes messages by type; the session needs both. Exposing the transport instead would leak the one thing `useLobby` encapsulates.

2. **Seats are minted by the host, in roster order.** `createSession` wants `players: { playerId, peerId, name }[]`, and the lobby has only peer ids. The host assigns `p1…pN` over players (not spectators) and holds the mapping in the session's seats. Only the host computes it — guests learn their seat from the `SYNC` they receive — so no cross-peer ordering agreement is needed.

3. **`PlayerId` is never a peer id.** They are distinct spaces that are both `string`, which is exactly what hides a mix-up (`remoteLink.ts:34`). Minting `p1…pN` keeps them visibly different, so a swap fails loudly rather than silently addressing the wrong seat.

4. **The seed is the host's**, from `crypto.getRandomValues`. The engine never sources randomness; determinism is what lets every peer replay identically.

5. **`KeeperHandle` gains `resync()`.** `createSession` returns the opening deal as `outgoing`, but the handle offers no way to deliver it — the sync-layer tests discard it, which is fine for them and not fine for a real game, where nobody would see their hand until they acted. `resync()` re-runs `syncAll` through the keeper's existing `deliver`. This is a gap in #63 that #18's wiring was always going to have to close.

6. **`toAction` is not on this path.** `GameLink.submit` takes `Intent` — `Action` minus `player` and `at`, which the referee stamps. The kit's callbacks map to `Intent` directly.

## Shape

```
host                                    guest
────                                    ─────
createSession(...)  ──► SessionRef
attachKeeper({ref, transport})          createRemoteLink({transport, keeperPeerId})
   │ .link (own seat)                       │ .link
   │ .handleMessage(INTENT)                 │ .handleMessage(SYNC | KEEPER_CHANGED)
   │ .resync()  ──► opening deal            │
   └──────────────► GameLink ◄──────────────┘
                        │
                  useGame(link)  ──► { view, events, submit }
                        │
              toTableState(view, log, labels)
                        │
                     <Table state=… actions=… />
```

## Tasks

1. **`resync()` on `KeeperHandle`** — plus a test that a fresh session's opening deal reaches every seat.
2. **Seat assignment** — `entities/game/seats.ts`: roster → `{ playerId, peerId, name }[]`, players only, deterministic order. Pure, tested.
3. **Session wiring in `useLobby`** — host builds session + keeper on `startGame`; guest builds a remote link on `GAME_STARTING`; `onMessage` routes `INTENT` to the keeper and `SYNC`/`KEEPER_CHANGED` to the remote. Exposes `gameLink`.
4. **`features/play-game/useGame.ts`** — subscribes to the link, holds the latest `PlayerView` and accumulated events, exposes `submit`.
5. **Translation keys** — `pending`, `window`, engine-error, expanded `moveHistory` (both catalogs).
6. **The page** — `@release/table-adapter` as a dependency, `toTableState`, real actions, `PLACEHOLDER_STATE` deleted.

## Definition of done

A game started from the lobby deals real cards to host and guest, each seeing only their own hand; clicking a card sends an intent that reaches the engine and comes back as a new projection to every seat. Verified in a browser with two peers, not only in jsdom.

## Not here

Animations (milestone 4), #61's card surfaces, keeper handover on host loss (the machinery exists; nothing drives it), and the three `room` fields with no producer — spectator limit, connection, per-peer liveness.
