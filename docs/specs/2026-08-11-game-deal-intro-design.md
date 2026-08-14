# Game deal intro on the board

Issue: [#89](https://github.com/MythHand/ReleaseBoardGameP2P/issues/89), sub-task of
[#88](https://github.com/MythHand/ReleaseBoardGameP2P/issues/88).

## The goal

Starting a game must open with the deal, not with a table that is simply there.
The choreography already exists as a layout-only playground story —
[`GameDealStory`](../../apps/playground/stories/interactive/GameDealStory.tsx),
`/playground/game-deal` — whose comment block is a written spec of the beats.
This brings it to the real board.

## Why it needs a fork first

The board renders `<Table>` from `@release/ui` wholesale, fed by
`@release/table-adapter` ([`_layout.tsx`](../../apps/frontend/src/pages/board/[gameId]/_layout.tsx)).
There is no seam to hang an animation on: cards have to fly into the *real*
`Hand`'s DOM, and that DOM belongs to a component in another app. The playground
stays layout-only, so the animation cannot live there either.

So the screen's **composition** moves into the frontend, and everything below it
stays shared. This is also the prerequisite for the rest of #88 — every later
animation needs the same seam.

## Scope

Changes are confined to `apps/frontend` and `packages/engine`, with two
deliberate exceptions, both stated below: the `@release/ui` barrel gains
export-only lines, and `packages/table-adapter` is deleted.

`apps/ui/src/table/Table/` is **not** touched and keeps serving `TableStory` in
the playground. The fork is a copy.

---

## Architecture

### What moves into `apps/frontend`

| Piece | From | Why |
|---|---|---|
| `Table.tsx` → `_Board.tsx` | `apps/ui/src/table/Table/` | the composition is where the deal phase lives |
| `Table.module.css` → `_Board.module.css` | same | the intro animates the screen's own geometry |
| `useTableInteractions.ts` → `_useBoardInteractions.ts` | same | selection/targeting state; the intro holds it inert |
| `types.ts` → `BoardState` etc. | same | the intro adds fields no `@release/ui` type can carry |
| `toTableState`, `toTableOver`, `toAction` + tests | `packages/table-adapter` | one consumer; after the fork the output type is the frontend's |

Named `Board`, not `Table`: in `@release/ui` `Table` names a *component*, while in
the frontend this is the board **route's** screen. Two `Table`s meaning different
things is the ambiguity the rename removes.

### What stays in `@release/ui`, imported

Every leaf block — `Hand`, `Seat`, `Pile`, `Card`, `TurnDock`, `ReleaseZone`,
`HudBackground`, `TabRail`, `Drawer`, `Rules`, `GameModes`, `MoveHistory`,
`Participants`, `GameOver`, `Reconnect`, `PauseGame`, `Arrow` — plus
`deriveDock` / `isCounting` and the `TableState` / `TableProps` types.

### What the barrel gains

Export-only, no behaviour, in `apps/ui/src/index.ts`:

- from `animations`: `wait`, `scatterAt`, `restTransform`, and the `Rect` /
  `Scatter` types
- from `primitives/Card`: `cardBoxIn`
- `PendingPrompt` and its copy types

Without these the frontend would have to duplicate the scatter and timing maths,
and a tuning change in `apps/ui` would never reach the board. `PendingPrompt` is
417 lines plus 295 of test; exporting it rather than forking it roughly halves
the copied surface.

### Type ownership and drift

`Board` owns `BoardState` / `BoardProps`, forked from
[`types.ts`](../../apps/ui/src/table/Table/types.ts), because the intro needs
fields (`phase`, the staged heap) that have no business in a type we cannot edit.
The forked `Board` still feeds `Hand`, `Seat`, `PendingPrompt` and the rest from
`@release/ui`, which structural typing allows as long as the shapes agree.

A `contract.test-d.ts` asserts `BoardState` and `@release/ui`'s `TableState` are
mutually assignable — the idiom this repo already uses at
[`intents.ts:1`](../../apps/ui/src/table/Table/intents.ts:1) for the engine's
action surface. If a leaf block's props change, the frontend stops compiling
instead of misrendering.

Drift is the standing cost of the fork: the frontend's copy is the live one, and
`@release/ui`'s `Table` is now a playground fixture. The `contract.test-d.ts`
catches prop-shape drift; visual drift it cannot catch. A comment at the top of
`_Board.tsx` records this, since `apps/ui/CLAUDE.md` is out of scope.

### `packages/table-adapter`

Deleted. Its source and tests move to `~/entities/game/board/`. It holds real,
tested logic the forked board still needs — sudo combo pairing derived from
`rulesFor`, card-catalogue resolution with a total fallback, event→history-label
mapping, release-slot flattening — so this is a relocation, not a rewrite. It has
exactly one consumer, and after the fork its output type belongs to the frontend.
The workspace entry, the Vite/tsconfig/vitest aliases and the dependency go with
it. The playground never used it.

### New frontend modules

```
~/entities/game/board/    toBoardState, toBoardOver, toAction, contract.test-d (+ tests)
~/pages/board/[gameId]/   _Board.tsx, _Board.module.css, _useBoardInteractions.ts
~/features/game-intro/    useDealIntro.ts, planDeal.ts, useFlyer.tsx, useHandArrival.tsx
~/shared/lib/             useReducedMotion.ts
```

`useFlyer` and `useHandArrival` are ported from the playground story — they are
local to it, not shared code, and the playground copy stays where it is.
`_layout.tsx` remains the route and renders `<Board>`.

---

## The intro

### It replays, it does not drive

By the time any peer mounts the board, `startGame` has created the session and
dealt ([`useLobby.ts:524`](../../apps/frontend/src/network/useLobby.ts:524)); the
first SYNC carries the finished `PlayerView`. `planDeal` reconstructs the
*pre-deal* table and the sequence plays forward to the state it already holds:

- pre-deal base pile = `decks.piles` plus every hand count, self's and each
  opponent's
- self's five, in identity and order — from `self.hand`
- each opponent's count — from the `dealt` events, so the seat counter climbs as
  cards land rather than starting at its final value
- events pile untouched; discard empty

### Engine change: emit `dealt`

`{ type: 'dealt'; player; count }` is declared in the
[Event union](../../packages/engine/src/events.ts:16) and **never emitted** —
`grep dealt` over `packages/engine/src` hits only the declaration and a comment.
The move history therefore opens on a blank.

Emit one per player at setup, in seat order, widened to:

```ts
{ type: 'dealt'; player: PlayerId; count: number; open?: CardId[] }
```

`open` names the cards dealt face up. The rules deal the Debugger openly, which
makes it public information the projection drops today. Without it the intro
would either fly every opponent card face-down — diverging from the
choreography — or *guess* that each opponent got a Debugger, a guess that is
wrong exactly when the deck ran short
([`setup.ts:38-62`](../../packages/engine/src/fake/setup.ts:38): `dbg` can be
`undefined`). The field is optional, so the change is backward-compatible; the
conformance suite gains a case.

### One state, shadowed

`Board` renders from a single state object in every phase. During the intro
`useDealIntro` returns an override — deck count, opponent hand counts, hand,
release zone — and `Board` renders that instead of the projection. The last intro
frame equals the projection's own values in the projection's own hand order, so
the handoff to `phase: 'live'` changes nothing on screen.

Hand order is what would betray it: deal into the fan in `self.hand` order and
the fan never re-sorts at the handoff.

### The beats

Ported from the story's comment block:

1. the page rail slides in from its edge
2. the HUD background — the table's own grid — fades up
3. the piles: decks from the left edge, discard from the right, staggered
4. the seats drop in one after another; the dock rises in the same beat
5. five rounds, the player first in each: self's card flies to the centre and
   stays at its own scatter; an opponent's sinks into their seat
6. the heap holds, then goes into the fan **whole** and closed
7. the hand turns over
8. the release zone arrives last — it is the player's, and it comes once they
   have a hand to play from

Round 1 is face-up when `self.hand[0]` is the Debugger (the engine deals it
first, [`setup.ts:55-57`](../../packages/engine/src/fake/setup.ts:55)) and
face-down when the deck had none to give. An opponent's round-1 card is face-up
exactly when that player's `dealt.open` names a card.

Beat constants are ported as-is from the story rather than re-tuned. The story is
the approved timing.

### Input

Dead for the duration: `actions` are no-ops, `_useBoardInteractions` is held
inert, and the dock sits in `waiting` with "game start" — the story's own
treatment. The copy key goes in both catalogs.

### When it plays

Fresh entry only, decided from the projection itself: turn index 0, nothing
drawn, empty discard, no releases, nobody eliminated, no winner. A reconnect
mid-game fails that test and drops straight to the live board.

Accepted edge: a refresh in the first seconds of turn 1, before anyone has acted,
replays the deal. Preferred over sessionStorage bookkeeping.

**Spectators get step 1 only.** They hold no seat, so `game.view` is `null` for
them by design, and there is no projection to replay — nobody can tell them how
many cards went where. They see the interface arrive, then the live table.

---

## The start gate

`createLocalLink` starts its ticker the moment it is built
([`link.ts:100`](../../apps/frontend/src/network/session/link.ts:100)), and that
ticker runs both `tick` and `driveAbsent`. Without a gate an absent seat can
auto-play while every human is still watching cards fly, and a host who finishes
its intro first can act into a guest's animation.

The keeper gains a gated state. From the deal until every seated peer has
reported, the ticker does not run and arriving intents are **buffered, not
rejected** — a rejection would surface as a visible error for a click the player
was entitled to make. On release the buffer applies in arrival order and the
ticker starts.

- peers report with a new `INTRO_READY { gameId }` envelope; the keeper's own seat
  reports locally through the same path, so host and guest share one rule
- spectators hold no seat and never report
- the gate is capped at ~12s from the deal: a hidden tab or a stalled animation
  must not freeze the table for everyone
- a peer that reconnects after release is never awaited

This lives in `apps/frontend/src/network/session/` and needs no engine change.
Nothing at the deal carries a deadline — only windows and timed pendings do
([`dock.ts`](../../apps/ui/src/table/Table/dock.ts)) — so there is no clock to
pause, only a table to hold still.

---

## Reduced motion and skip

**`prefers-reduced-motion` is honoured always.** When set, the intro resolves to
its end state immediately — no flights, no fades, the board is simply dealt — and
that peer reports ready at once, so it never holds up the others.

This must live in our own sequencer: `play()` in `@release/ui` does **not** check
the query; only the CSS modules do. Fixing that at the source would mean editing
`apps/ui`, so it is recorded here as a follow-up rather than folded into this
work.

**Skip** is the same code path — one `finish()` that jumps to the end state —
bound to a click on the board root or Esc. Two entry points, one implementation,
so a bug cannot reach one and not the other.

---

## Degradation

| Situation | Behaviour |
|---|---|
| a rect is unmeasured (deck box not laid out) | collapse to the end state; never drop a card silently |
| resize mid-flight | collapse to the end state |
| unmount / navigation mid-intro | cancel the sequence, drop every flyer |
| StrictMode double-mount | the sequence is keyed by `gameId` and guarded; it plays once |
| projection arrives after mount | step 1 needs no data, so the interface arrives while the first projection travels; the deal begins when it lands |
| game already over in the first projection | no intro |

---

## Testing

- **`planDeal(view, dealtEvents) → flights`** is a pure function: pre-deal counts,
  hand order, Debugger detection, the no-Debugger case, opponents' `open` cards —
  all tested without a DOM.
- **The gate**, against `memoryNetwork` in the existing referee-test style: a
  gated keeper does not tick, releases on all-ready, releases on timeout, buffers
  and replays intents in order.
- **The fork**: [`Table.test.tsx`](../../apps/ui/src/table/Table/Table.test.tsx)'s
  322 lines ported to `Board.test.tsx`. If the fork renders what the original
  rendered, the fork is clean — and any stage 2 failure can only be the
  animation.
- **The board under intro**: input inert, dock in `waiting`, and the
  reduced-motion path renders the end state directly.
- The adapter's own tests move with it unchanged.

---

## Staging

**Stage 1 — the fork.** Copy the composition into `apps/frontend` as `Board`,
widen the `@release/ui` barrel, move the adapter, add `contract.test-d.ts`, port
`Table.test.tsx`. No animation. Ships when the board renders and plays exactly as
it does today.

**Stage 2 — the deal.** The engine's `dealt` event, `planDeal`, `useDealIntro`,
the ported flight hooks, the start gate, reduced motion and skip.

Splitting them is what makes a stage 2 regression legible: after stage 1 the
board is provably unchanged, so anything that breaks afterwards is the intro.

---

## Out of scope

- teaching `play()` in `@release/ui` about `prefers-reduced-motion` (follow-up)
- every other animation under #88 — draw, play, discard, attack
- any change to `apps/playground`; the story stays layout-only and keeps its
  local copies of the flight hooks
- retuning the choreography; the story's timings are the approved ones
