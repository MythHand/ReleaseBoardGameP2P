# The stats page

Issue: [#19](https://github.com/MythHand/ReleaseBoardGameP2P/issues/19), milestone 1.0.0.

## The goal

A match ends, the table's game-over overlay offers Continue, and everyone lands on the results
screen: who won, what each seat did, and five achievement plates naming the one player who led a
metric. The approved visuals are
[`StatsStory`](../../apps/playground/stories/StatsStory/StatsStory.tsx) and the screen it drives,
[`apps/ui/src/screens/Stats`](../../apps/ui/src/screens/Stats/Stats.tsx). Per
[CLAUDE.md](../../CLAUDE.md#styling-rule) `Stats` is the one screen the frontend renders straight
from `@release/ui` rather than re-implementing, and that stays true here.

This design makes the screen show a real match instead of nothing.

---

## What the issue asks for, and what the code actually says

### The screen is finished; the page behind it is a stub

`Stats` landed complete in [#118](https://github.com/MythHand/ReleaseBoardGameP2P/issues/118) —
winner block, the table with its location column, five achievement plates, a chat slot, a
`bgTone`, a lang switcher. Both catalogs already carry every `stats.*` key.
[`_layout.tsx`](../../apps/frontend/src/pages/board/[gameId]/_layout.tsx) already navigates to
`/board/:gameId/stats` on `onOverContinue`.

What is missing is everything behind the props.
[`stats.tsx`](../../apps/frontend/src/pages/board/[gameId]/stats.tsx) renders
`<Stats winnerId="" copy={copy} />`: no players, no winner, no self, no tone, no handlers. Every
part of this design exists to fill those props with something true.

### Nothing counts anything

The screen wants seven numbers per seat — two columns (`attack`, `defense`) and five metrics
(`ddos`, `ai`, `err503`, `cherryPick`, `attackedInto`). Nothing in the engine, the session, or the
frontend tallies any of them. They have to be counted from the engine's event log.

Counting them **on each peer** is the obvious move and it is wrong: peers do not hold the same
log. [`audience.ts`](../../apps/frontend/src/network/session/audience.ts) filters each seat's feed
by `visibleTo`, and two of the seven metrics ride private events — the second
`takenFromDiscard` of a cherry-pick is `visibleTo: [action.player]`
([discard.ts:100](../../packages/engine/src/fake/discard.ts)), and the hand attacks in
[handAttacks.ts](../../packages/engine/src/fake/handAttacks.ts) are `visibleTo: [from, to]`.
Local derivation therefore puts a different number on every screen at the table, for a screen
whose entire purpose is that everyone reads the same result.

A keeper-side tally outside the engine fixes the disagreement and buys a second problem: the
keeper can change mid-match (`KEEPER_STATE` carries `GameState` and nothing else), so a tally
held beside the session dies at handover.

### The location column has no protocol

`copy.location` distinguishes `game` / `stats` / `lobby` / `offline`, so the column depicts peers
moving independently through the post-game flow. The `Message` union in
[types.ts](../../apps/frontend/src/network/types.ts) has nothing post-game at all: no peer can
learn that another walked back to the lobby.

### The lobby button is inert, and the route is off-screen

`Stats` renders `<Button>{copy.toLobby}</Button>` with no handler — `StatsProps` has no
`onToLobby`.

And `_layout.tsx` **is** the board: `stats.tsx` renders inside its `<Outlet />`, below a table
that is `block-size: 100dvh`. The results screen is `min-block-size: 100%` in normal flow, so it
paints a full viewport below the fold. Today the route technically works and shows nothing.

### `selfTag` exists in the story and not in the catalog

`StatsCopy.selfTag` marks which row is you. `StatsStory` passes it; the catalog has no
`stats.selfTag`. The prop is optional and the screen degrades by simply not marking anyone — so
without this key the frontend cannot tell you which row is yours, quietly.

---

## The design

Four seams, in dependency order: the engine counts, the wire reports where people are, the UI
screen gains one callback, and the page assembles the three.

### 1. The tally lives in `GameState`

[`state.ts`](../../packages/engine/src/state.ts) gains:

```ts
export interface PlayerTally {
  attack: number        // `attacked` where attacker is this seat
  defense: number       // `defended` where player is this seat
  ddos: number          // `attacked` with card 'attack-ddos'
  ai: number            // `aiRevealed` where player is this seat
  err503: number        // `revealed` with card 'trigger-error-503'
  cherryPick: number    // `takenFromDiscard` with to: 'hand'
  attackedInto: number  // `tookHit` where player is this seat
}
```

Four of the seven are settled by the event union alone. `attack` covers both scopes without a
special case — a hand attack emits the same `attacked` event as a release attack
([handAttacks.ts:21](../../packages/engine/src/fake/handAttacks.ts)) — and `requested` is the
request-a-card mechanic, not an attack card, so it is not counted. The remaining three are
defaults under **Open questions** below.

and `GameState` gains `tally: Record<PlayerId, PlayerTally>`, seeded to zeros by `createGame`.

Living in `GameState` answers both problems at once: every peer's numbers come from one authority
so they cannot disagree, and the tally rides `KEEPER_STATE` through a handover for free because
it *is* the state.

A new `packages/engine/src/tally.ts` holds one pure fold:

```ts
export function foldTally(
  prev: Record<PlayerId, PlayerTally>,
  events: Event[],
): Record<PlayerId, PlayerTally>
```

It reads **only the event log** — never `GameState`, never card rules beyond the catalogue's
`kind`. [`fake/reduce.ts`](../../packages/engine/src/fake/reduce.ts) applies it once at its exit,
over the events that reduction produced. Nothing inside the rules code changes.

Why the log and not the reducers: the seven counters would otherwise be seven edits scattered
across `attacks.ts`, `release.ts`, `triggers.ts`, `discard.ts` and `handAttacks.ts`, each a place
for a future rules change to silently stop counting. As a fold it is one module, one test file,
and one rule — *if the event was emitted, it was counted*. Conformance cases in
[`conformance.ts`](../../packages/engine/src/conformance.ts) hold any second engine to the same
numbers.

**Projection.** [`PlayerView`](../../packages/engine/src/view.ts) gains
`tally: Record<PlayerId, PlayerTally> | null`, filled **only when `over` is non-null** and `null`
for the whole match before that. The results are for the results screen: `cherryPick` counts a
pull whose second card is deliberately private, so a live counter would leak mid-match exactly
what `visibleTo` was written to hide.

### 2. `WHEREABOUTS`, shaped like `PLAYER_READY`

`PeerInfo` gains `where: Where`, where `type Where = 'game' | 'stats' | 'lobby'`. The union has
no `offline` member on purpose: nobody announces their own disconnection. `offline` is the
*absence* of a peer from `session.state.peers`, which the session already maintains through
`applyPeerLeft`.

One new message:

```ts
| { type: 'WHEREABOUTS'; payload: { where: Where } }
```

and `PEER_JOINED`'s payload grows the same field.

The flow is `PLAYER_READY`'s, unchanged in shape: a guest sends `WHEREABOUTS` to the host; the
host runs `handleWhereabouts(state, fromId, where)` in
[`lobby/host.ts`](../../apps/frontend/src/network/lobby/host.ts), which updates that `PeerInfo`
and broadcasts the whole record back as `PEER_JOINED` — exactly what `handleReady` does with
`ready`. The host announcing its own move calls the same function locally, as `ready()` does.
`useLobby` gains `setWhere(where: Where)` beside `ready()`.

No new relay machinery, no new lifecycle, and one existing test file to extend rather than a new
subsystem to prove.

A `PeerInfo` is born `where: 'lobby'` — the only place a peer can join from — so the field is
never absent and no reader has to handle a missing location. After that each screen announces on
mount: the board `'game'`, the results page `'stats'`, the lobby `'lobby'`.

### 3. `Stats` gains one prop

`StatsProps` gains `onToLobby?: () => void`, wired to the footer button. Optional, so `StatsStory`
stays valid without a handler and the button keeps its current inert behaviour in the playground.

`stats.selfTag` is added to `en/common.json` and `ru/common.json` (`"you"` / `"вы"`, the strings
`StatsStory` already uses), and `stats.tsx` passes it.

### 4. The route moves, and the page assembles

**`_layout.tsx` → `index.tsx`.** The board stops being a layout and becomes the index route, so
`/board/:gameId` and `/board/:gameId/stats` are siblings and exactly one of them renders. The
file's contents move unchanged; only `styles.page`'s wrapper travels with it. `router.ts` is
generouted's output and regenerates — `Path` gains `/board/:gameId`.

This also unmounts the table when results open, which is what we want: the session and the game
link live in `_app`, so nothing about the match is held by the board's own tree.

**`entities/game/stats/toStatPlayers.ts`** — a pure mapper, the stats analogue of
[`toBoardState`](../../apps/frontend/src/entities/game/board/toBoardState.ts):

```ts
export function toStatPlayers(
  tally: Record<PlayerId, PlayerTally>,
  seats: Seat[],
  peers: Record<string, PeerInfo>,
): StatPlayer[]
```

It owns the playerId → peerId crossing that `_layout.tsx` already warns about at length for the
winner: the engine names seats `p1…pN`, the roster is keyed by peer id, and both are `string`.
Putting the crossing in one module means the winner block and the table resolve seats the same
way. A seat whose peer has left the roster still gets a row — it played the match — with
`location: 'offline'` and its name from `Seat`.

**`stats.tsx`** becomes the real page: `players` from the mapper, `winnerId` and `selfId` as peer
ids, `lang`/`onLangChange` from i18next as the board does it, `bgTone` `'positive'` when the local
peer is the winner and `'neutral'` otherwise, and `onToLobby`. The `chat` slot stays empty — chat
is a cross-screen feature with its own protocol and belongs to its own issue.

**The lobby button, and the rematch.** `onToLobby` clears the local game and navigates via the
existing [`useGoToLobby`](../../apps/frontend/src/app/lib/lobbyNavigation.ts). Clearing matters:
`gameId` still set would put the peer straight back on the board.

That leaves a hole the location column makes obvious. `useFollowGameStart` is called only from
[`_LobbyView`](../../apps/frontend/src/pages/lobby/_LobbyView.tsx), so a peer reading results when
the host starts a rematch is never carried into it. The effect moves up to the app shell, in a
render-null `<FollowGameStart />` inside `<SessionProvider>` (the hook needs the session context,
which `App` itself provides and so cannot consume). It fires on `gameId` **change** —
`null → g1` at the first start, `g1 → g2` at a rematch — so a peer sitting on `/board/g1/stats` is
moved to `/board/g2` and one sitting on `/board/g1` is not disturbed.

---

## Data flow, end to end

```
engine.reduce ── events ──► foldTally ──► GameState.tally
                                              │
                                       project(over ? tally : null)
                                              │
                              SYNC ──► useLobby.gameSync ──► useGame.view
                                              │
   session.state.peers (role, name, where) ───┼──► toStatPlayers ──► StatPlayer[]
                     seatsFor(peers) ─────────┘                          │
                                                                    <Stats …/>
```

Presence runs on its own wire and meets the tally only in the mapper:

```
screen mount ──► setWhere('stats') ──► WHEREABOUTS ──► host.handleWhereabouts
                                                              │
                              PeerInfo.where ◄── PEER_JOINED ─┘ (broadcast)
```

---

## Error handling

The screen is the last thing a player sees, so every failure here degrades to a partial result
rather than a blank page or a crash.

- **No projection** (`view` is null — a spectator, or a reload that lost the session): the page
  renders `Stats` with no players and no winner. The screen already handles this — `winner` is a
  `find` that misses, `players` defaults to `[]`, and `leader()` returns undefined for every
  metric, so the plates simply do not appear. Nothing to special-case.
- **`view.tally` null while `over` is set**: impossible by construction (one condition drives
  both), and if it happens the mapper returns `[]` — the same empty-results path.
- **A winner with no seat**: `toStatPlayers` cannot resolve a peer id, the winner block does not
  render, and DEV logs the roster — the treatment `_layout.tsx` already gives this exact miss.
- **A peer that left**: it keeps its row, marked `offline`. Removing the row would rewrite the
  match's history to exclude someone who played it.
- **An achievement tie**: already the screen's own rule — `leader()` awards nothing when two
  players share the top, so the plate is absent. The layout is built for an incomplete row.

---

## Testing

| What | Where |
|---|---|
| The fold, metric by metric, including private events and ties | `packages/engine/src/tally.test.ts` |
| Any engine agrees on the numbers; tally is null before `over` | `packages/engine/src/conformance.ts` |
| `handleWhereabouts` updates and broadcasts; an unknown sender is ignored | `apps/frontend/src/network/lobby/host.test.ts` |
| `setWhere` sends as a guest, applies locally as host | `apps/frontend/src/network/useLobby.test.ts` |
| playerId → peerId crossing, departed peers, offline location | `apps/frontend/src/entities/game/stats/toStatPlayers.test.ts` |
| Winner marking, self marking, tone, the lobby button's navigation | `apps/frontend/src/pages/board/[gameId]/__tests__/stats.test.tsx` |
| A rematch moves a peer sitting on results | `apps/frontend/src/features/start-game/useStartGame.test.ts` |

`StatsStory` stays mock-driven and unchanged — the playground is the visual source of truth and
has no business rendering a live session.

---

## Open questions

Three of the seven metrics have copy that does not pin an event. Per
[CLAUDE.md](../../CLAUDE.md), these are recorded rather than inferred; each ships under the stated
default so the screen is not blocked, and each default is one line in `tally.ts` to change.

These are **display semantics, not rules** — the physical game has no achievements — so they stay
here rather than in [`docs/rules/backlog.md`](../rules/backlog.md).

1. **`cherryPick` — "times pulled from discard" / "раз достал из сброса".** One Git Cherry-pick
   emits *two* `takenFromDiscard` events, one to hand and one to deck. Cards pulled, or times
   played? **Default: times played** (count the `to: 'hand'` event, which is also the public one,
   so the count is verifiable from any peer's log).
2. **`attackedInto` — "attack cards taken" / "карт атаки прилетело".** Every attack aimed at this
   seat, or only those that landed? The plate's art includes Error 503, which nobody aims, which
   argues for a third reading — everything bad that happened to you. **Default: attacks that
   landed** (`tookHit`).
3. **`err503` — "Error 503s from deck" / "ошибок 503 из колоды".** `trigger-error-503` off the
   draw deck certainly counts; `ai-error-503` off the events deck also emits `revealed`
   ([triggers.ts:338](../../packages/engine/src/fake/triggers.ts)). **Default: the trigger only.**

A fourth, smaller one: the issue asks for a "negative (looser)" state and the approved story
offers only `neutral` / `positive`, while `HudBackground` also has `problem`. We ship the story's
pair — **`positive` for the winner, `neutral` for everyone else** — because the playground is the
visual source of truth. Whether losing should read as `problem` is the designer's call.

---

## Out of scope

- **Chat on the results screen.** The slot stays empty. Chat is one feature across lobby, table
  and results, with a protocol, a history and toast behaviour of its own; wiring it only here
  would build the seam in the wrong place. Its own issue.
- **Match history across games.** The issue's "game history" is read as the achievement plates and
  the per-seat columns of *this* match — the session holds no record of previous ones, and
  inventing storage for them is a separate feature.
- **A rematch button on the results screen.** The route back is the lobby, where starting a game
  already lives.
