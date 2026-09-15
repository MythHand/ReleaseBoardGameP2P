# Bots fill the free seats in the lobby

**Date:** 2026-09-13; updated after PR #142 review on 2026-09-15.
**Project:** ReleaseBoardGameP2P ("Release любой ценой")
**Scope:** Add bots to the existing networked lobby and play them through the keeper.

## Decision history

The first implementation on this branch used a separate roomless solo session. It was
replaced before merge. That flow never existed in `main`; its removal is branch history,
not a change delivered to users by this PR. Decisions 1, 3, 4 and 5 of
[the first design](./2026-09-09-solo-bot-mode-design.md) remain superseded.

The 2026-09-13 draft specified a `БОТОВ` slider and a matching playground slider
(decisions 1 and 10). Commit `d8069c33` superseded those two decisions with an
**Add bot button in every free slot** and **Remove bot in each bot row's menu**.
The implementation plan records the earlier steps; the decisions below describe the final UI.

## Current decisions

| # | Decision | Behavior |
|---|----------|----------|
| 1 | Add/remove controls | Host clicks Add bot in a free slot, or Remove bot in a bot row's menu. No bot slider. |
| 2 | Entry point | The ordinary networked lobby. Creating a room needs the signaling broker; offline play is outside this feature. |
| 3 | Capacity | Humans + effective bots ≤ capacity, between 2 and 6 seats. |
| 4 | Lobby identity | Bots are a count in lobby config, not connected peers. |
| 5 | Displacement | Before Start, humans take seats first. The stored count is a ceiling; a bot can reappear when a human leaves. |
| 6 | Frozen seating | Start assigns the human and bot seats once. New arrivals during a match are spectators; returning humans retain their existing seat. A bot is never a returnable human seat. |
| 7 | Board presence | `bot` travels on the wire seat. Bots are shown as connected and never as disconnected players. |
| 8 | Names | `useStartGame` supplies localized names from the catalog to `startGame`. |
| 9 | Minimum players | One ready host with at least one effective bot can start. Every human must still be ready. |
| 10 | Kit parity | The reference Lobby uses the same row controls. ButtonsKit shows the new `pill` button in normal and disabled states. The app header uses LobbyCode's separate link/code buttons. |

## Lobby count and controls

`bots` travels in `LOBBY_CONFIG_UPDATED` with `maxPlayers` and `setup`. The host-only
setter clamps it to 0–5. Every reader uses:

```text
effectiveBots = max(0, min(bots, capacity − humans))
```

The rows and header show this effective count. Add/remove operate on that visible count,
not on the stored ceiling. For example, two humans in a three-seat room with a stored
request for five bots show one bot; Remove bot sets the request to zero. The clicked bot
row has no durable identity, so removal always reduces the count and removes the last row.

Before the match, joining humans can displace bots. Once seating is frozen, new arrivals
are spectators even if the connected-human count is below capacity. A synthetic `bot:N`
client id cannot claim a bot seat or trigger `SEAT_REBOUND`/`GAME_STARTING` for a newcomer.

## Starting and restoring a match

`seatsFor` builds the humans; `botSeats` continues their `p1…pN` numbering. Wire seats use
`bot:N` for stable display keys. The referee receives `peerId: null, bot: true`, so its
unattended-seat driver plays the bot immediately instead of waiting through human absence grace.
Only human seats participate in the opening gate.

Snapshots retain both the referee seats and the wire seating, including the bot flags.
On reload `restoreSeats` preserves bots without adding an absence timestamp. Returning humans
are treated separately. The start/restore tests are also merge guards for PR #149: its future
private-seat/token validation must preserve this bot representation and must not require a
human resume token for a bot. PR #149 is still separate; the second branch merged must run
these tests against the combined implementation.

## Delivery and pacing

A keeper timer can expire a window or human turn and then drive a bot. `advanceSession`
returns one final projection with all events from those reductions. This avoids losing the
first batch when React batches synchronous updates to the host's session state. Recipient
visibility still goes through the referee's normal event audience filtering.

Bot decisions still run on the keeper's 250ms ticker. The board's animations can take longer,
so its displayed turn can lag behind the authoritative clock. This remains an open pacing
issue, recorded in Interaction audit and `docs/animations/backlog.md`. It is distinct from
lost events. Changing the shared ticker interval would also change deadline and absence checks;
a future pacing fix must control bot actions separately or coordinate board readiness.

## Verification

- Count clamping, human readiness, guest config updates, add/remove controls and copying.
- New mid-match clients, including `bot:1`, remain spectators without rebinding the bot.
- A lobby-started bot acts through the keeper; start gate waits only for humans.
- A host reload preserves and continues the bot seats.
- Host history retains window closure and timeout draw/turn events when a bot acts on the same tick.
- Board and statistics do not mark bots as disconnected.

## Gameplay reports checked during review

- **Release after DRAW:** a human-only real-engine test confirms the first release is
  playable after drawing and reaches the zone after payment. The reported failure is
  not reproduced by this scenario.
- **AI Inside:** a human-only engine projection with two different releases in discard
  renders both choices on Board; selecting and confirming one resolves the pending.
  This uses reduced motion, not a browser animation/WebRTC end-to-end run, so the
  original full-game stall remains unconfirmed. Both cases live in `pr142Gameplay.test.tsx`.
- **503 elimination:** a three-human fixture with two piles confirms that the eliminated
  current player keeps the turn. Bot policy continues to propose DRAW, but the draw
  sequence refuses to deal to an eliminated player, leaving the same turn and action
  again. The extra card receipt was not reproduced. This is existing engine behavior
  on `main`, reserved for the separate engine fix requested in the review.
- **DDoS freeze:** the engine excludes frozen cards from playable, but Board does not
  render a specific frozen indicator. Recorded as a separate open finding in the
  animation backlog and Interaction audit.

The engine reducers, Board and Inside staging inspected here match `origin/main`
(`287fd6e8`); the fake-engine entry point only differs by window-duration exports.
