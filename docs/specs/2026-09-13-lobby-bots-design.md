# Bots move into the lobby — a number that fills the empty seats

**Date:** 2026-09-13
**Project:** ReleaseBoardGameP2P ("Release любой ценой")
**Issue:** none
**Scope:** The way a player asks for bots. Bot setup leaves the start screen and the create-game
form and becomes a second slider in the lobby, beside the capacity one. The roomless solo session
is deleted. How a bot *plays* does not change.

> Supersedes decisions 1, 3, 4 and 5 of
> [`2026-09-09-solo-bot-mode-design.md`](./2026-09-09-solo-bot-mode-design.md), whose engine-facing
> half stands untouched: `Seat.bot`, the `driveUnattended` driver, `restoreSeats`' bot branch and
> the stall warning are all kept exactly as they are. That design's open pacing question
> (its decision 8) is untouched too, and is discussed at the end.

## The goal

Asking for bots currently means a separate front door: a start-screen entry, a second submit on the
create-game form, and a whole session type behind it that has no room, no broker and no peers. It
works, but it splits the app in two at the very first screen, and a player who wants "a game with
two friends and a bot to fill the table" has no way to say so.

Putting bots in the lobby says it in one place. The lobby is already where you decide how big the
table is and which modes it plays; how many of those seats are bots belongs on the same screen. And
because the lobby is the same screen whether you end up alone or with four friends, one flow covers
both.

The price, chosen deliberately, is that playing bots now needs a room — and opening a room needs the
signaling broker once. There is no longer any way to play this game with no network at all.

## Decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Where bots are asked for | **A `БОТОВ` slider in the lobby, under the capacity slider,** and hidden for guests exactly as the capacity slider already is. Guests read the count off the bot rows in the player column instead. |
| 2 | The old front door | **Deleted.** The start-screen entry, the create-form slider and its second submit, and the whole roomless session behind them. |
| 3 | What capacity means | **The whole table.** Humans + bots ≤ capacity, and capacity stays 2–6 as the rules require. |
| 4 | What a bot *is*, in the lobby | **A number, not a roster member.** One field in the lobby config, beside `maxPlayers` and `setup`. |
| 5 | The number's meaning | **A ceiling, not a reservation.** Everything reads `min(bots, capacity − humans)`, so arriving friends push bots aside and departing ones bring them back. |
| 6 | When bot seats become real | **At Start,** where the seating is already built and broadcast. |
| 7 | How the board knows a seat is a bot | **`bot` travels on the wire `Seat`,** and three readers learn to check it. This reverses the old decision 5 — see "Why the roster is no longer the answer". |
| 8 | Where bot names come from | **The catalog, passed into `startGame` by the features layer,** because `network/` may not import i18next. |
| 9 | Starting alone | **Allowed with at least one bot.** `canStart` counts humans + effective bots and still requires two seats. |
| 10 | The kit | **The kit's `Lobby` screen and `LobbyStory` get the same slider,** per the rule that `apps/ui/src/screens/` is the visual source of truth. |

## What survives, and what goes

Everything about how a bot plays survives, because none of it knew where bots came from:
`Seat.bot` and the `driveUnattended` driver (`network/session/referee.ts`), `restoreSeats`' bot
early-return, the stall warning and its threshold, and `createSession`'s per-player `bot` flag.

What goes is the front door and the session type behind it — 348 lines of dedicated files plus the
parts living inside shared ones:

| Deleted | Why |
|---|---|
| `network/transport/loopback.ts` (+ test) | Nothing plays without a room any more. |
| `network/session/solo.ts` (+ test), `soloPlay.test.ts` | The solo table is built by the lobby now. |
| `features/start-game/useStartSolo.ts` (+ test) | Replaced by `startGame`'s new argument. |
| `startSolo`, `restoreSolo` and the mount branch in `useLobby.ts` | No separate session to start or restore. |
| `role: 'solo'` and the nullable `roomCode` in `persistence.ts` | Every session has a room again — which also removes the two nullability guards that change forced. |
| The start-screen `MenuButton`, the create-form slider and second submit | One front door. |
| `Form.tsx`'s submitter merge (+ its two tests) | It existed only to tell two submit buttons apart. With one submit, the Safari 15 defect it fixed cannot occur. |
| `start.soloCta`, `start.soloNote` | No longer said anywhere. |

`start.botsLabel` and `start.botName` survive their owner and move to `lobbyScreen.bots` and
`lobbyScreen.botName`, which is where they are now read.

## The bot count is a ceiling

`bots` joins `maxPlayers` and `setup` as a third field of the lobby config: in `LobbyState`, in
`applyConfig`, and in the `LOBBY_CONFIG_UPDATED` payload that already carries the other two. A
host-only `setBots` applies it locally and broadcasts, mirroring `setMaxPlayers` line for line.

Nothing stores which seats are bots, because storing that is what creates work. Every reader derives
it:

```
effectiveBots = min(state.bots, capacity − humans)
```

That single expression is the whole displacement policy. A friend joining reduces it; a friend
leaving restores it; lowering capacity squeezes it; and `assignRole`, which decides whether a
joiner is a player or a spectator, needs no change at all — it counts peers, and bots are not
peers, so a bot can never cost a person their seat.

`canStart` gains the bots: `humans + effectiveBots ≥ 2`, with every human ready. A host alone with
one bot can start; a host alone with none still cannot. `setMaxPlayers`' demotion loop is untouched:
it demotes over-capacity *players*, and there is nothing to demote for a number.

## Why the roster is no longer the answer

The superseded design put a synthetic `PeerInfo` in the roster for each bot, so that the board's
three readings — `disconnected` (`pages/board/[gameId]/index.tsx:77`), `participants`' `connected`
flag, and `toStatPlayers`' `location` — would treat a bot as a present player with no bot-specific
check anywhere. That was the right trade when solo built its own roster wholesale at match start.

It is the wrong trade here. Bots are a number until Start, so synthetic peers would have to be
minted at Start, broadcast to every guest through a roster message that is currently per-recipient,
and then cleaned out of the roster again when the table returns to the lobby — or the lobby would
show phantom players who are not there.

So `bot?: boolean` travels on the wire `Seat` instead, which `GAME_STARTING` already broadcasts to
everyone, and the three readers each gain one clause: a bot seat is connected, is never listed as
disconnected, and reports its location as in-game. Seat names already fall back to `seat.name`, so
bot rows read "Бот 1" with no further change.

## Starting a match

`startGame` mints the seating at `useLobby.ts:1560` with `seatsFor(current.peers)`. It appends
`effectiveBots` seats after the human ones — ids continuing the same `p1…pN` sequence, `bot: true`,
and names supplied by the caller.

That last part is the one boundary worth naming. `network/` may not import i18next, so bot display
names cannot be built where the seats are. `startGame` takes `botNames: string[]`, and
`useStartGame` — which lives in `features/` and already wraps the call — builds them from
`t('lobbyScreen.botName', { n })`. It is the same seam `useStartSolo` used; the seam outlives the
function that introduced it.

## The UI

In the frontend's lobby (`pages/lobby/_LobbyView.tsx`), a `Slider` directly under the capacity one,
`min={0}`, `max={5}`, rendered only for the host — the capacity slider beside it is already written
`{isHost && …}`, and a guest reads the count off the rows instead. The player column already fills
its free positions with `EmptySlot`; the first `effectiveBots` of those become `PlayerSlot` rows
carrying a badge and no dropdown — a bot cannot be kicked, only counted down.

The slider's own maximum stays a flat 5 rather than tracking `capacity − humans`, and this is
deliberate: the stored number is what the host **asked for**, and the seats show what the table can
currently **give**. When four friends fill a six-seat table, the slider still reads 3 and only one
bot row shows; when two of them leave, the other two bots come back without the host touching
anything. A slider that clamped itself on every arrival would lose that, and would also move under
the host's hand as people join.

The kit's `Lobby` screen already renders two sliders of its own (capacity and the spectator limit,
both `styles.capRow`); it gains a third beside the capacity one, its `copy` interface gains `bots`,
and `LobbyStory` gains the control so the playground still shows the screen as it really is.

## Testing

- **Lobby rules** (`network/lobby/host.test.ts`, `state.test.ts`): the ceiling clamps when humans
  arrive, when capacity drops, and back up when a human leaves; `canStart` at both sides of the
  two-seat boundary; a guest's `setBots` is refused.
- **Seating** (`useLobby.test.ts`): N bots produce N seats after the humans, each `bot: true`, with
  the supplied names; zero bots changes nothing about today's seating.
- **The lobby view** (`pages/lobby/__tests__/`): the slider is absent for a guest; the preview rows
  track arrivals and capacity.
- **The three board readers**: a bot seat is never reported disconnected, and reads as in-game on
  the results screen.
- Deleted paths take their tests with them, and the suite should shrink accordingly rather than
  leaving tests that assert a flow nobody can reach.

## Known and deliberately not fixed here

- **Pacing is still open, and this makes it matter more.** The keeper commits a bot action every
  250ms while the board animates one beat over roughly 1–4s, so a bot-heavy round can consume a
  human's 30s turn before their board shows it. Solo made that one player's problem; a room full of
  people watching the same bots makes it everyone's. The fix, and the reason the ticker interval is
  not the lever, are set out in the earlier design's decision 8 and its follow-up discussion.
- **No offline play.** Accepted in decision 2. Opening a room needs the broker once, so the game can
  no longer be played with no network at all.
- **The `driveAbsent` rename still collides with `feat/108-git-cards`.** That branch adds a test
  calling `driveAbsent`, which this work's branch renamed to `driveUnattended`. The two merge cleanly
  as text and then fail to typecheck. Whichever lands second renames that one call.
