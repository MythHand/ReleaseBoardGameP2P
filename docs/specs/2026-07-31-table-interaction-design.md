# Table interaction surface and page wiring — Design

## Goal

Make `Table` interactive and render `/board/:gameId` from real engine state — milestones
2 and 3 of [`2026-07-27-game-page-design.md`](./2026-07-27-game-page-design.md).

Milestone 1 shipped in [#59](https://github.com/MythHand/ReleaseBoardGameP2P/pull/59):
`@release/engine` exists, the contract is published, and a fake implementation passes the
conformance suite. What is missing is the path between a click and `reduce`.

## Context

`Table` is display-only. It renders `<TurnDock>` without `onDraw` / `onPush` / `onPass`
and `<Hand>` without `onCardClick` / `accentAt`, even though both components already
accept them. `apps/frontend/src/pages/board/[gameId]/_layout.tsx` renders it against
`PLACEHOLDER_STATE` — empty hand, empty zones, zero decks.

The original spec answered *where* interaction lives (Decision 8: gesture state in the
kit, completed intents to the frontend) but not *how the props get there*. Since it was
written, [#62](https://github.com/MythHand/ReleaseBoardGameP2P/pull/62) added the pause
window and its seven props. `Table` now takes 32 flat props; this milestone's action
surface adds twelve more, taking it to 44.

That number is the reason for this spec. The boundary in the original design is right and
does not move — what needs designing is the shape of the surface across it.

## Scope

In: `Table`'s prop regrouping, `useTableInteractions`, the engine-driven `TableStory`
mode, `useGame`, the adapters, and the page.

Out: milestone 4 (animations — the anchor registry and the event → preset driver), and
the five card surfaces in
[#61](https://github.com/MythHand/ReleaseBoardGameP2P/issues/61). Neither is blocked by
this work; both are easier once the page is live.

## Decisions

1. **`Table` stays a single component the playground and the page both render.** The
   alternative — composing the board page in `apps/frontend` out of `Seat`, `Hand`,
   `ReleaseZone` and `TurnDock` — was considered and rejected. It duplicates 478 lines of
   layout plus its module CSS, which is the drift risk
   [#51](https://github.com/MythHand/ReleaseBoardGameP2P/issues/51) exists to close, and
   it makes `playground/table` unplayable. The playground is where this design gets
   validated before the route exists, which is why milestone 2 precedes milestone 3.

2. **Props group by who owns the data, not by which sub-component consumes them.** Five
   groups replace 44 flat props. The grouping is the design: it makes visible at the call
   site which values come from the engine and which come from the session, and that is
   the distinction the page has to get right.

3. **`participants` and `spectators` move out of `state` into `room`.** They are room
   facts, not game facts — `PlayerView` has no concept of a spectator. This is what makes
   `toTableState` a total function of `PlayerView` with nothing left over.

4. **`panel` becomes controlled, with an uncontrolled fallback.** Omitted, `Table` keeps
   its internal `useState<Panel | null>` and the playground is unchanged. Supplied, the
   page binds it to `?panel=`, so browser-back closes a drawer instead of leaving the
   match. Drawer width and the `lastOpen` ref stay internal — they are presentation.

5. **`view` is retired.** `oppEliminated` / `youEliminated` read from
   `PlayerView.opponents[].eliminated`; `oppDisconnect` / `youDisconnect` become
   `room.connection`. The prop exists today only because there was no real state to drive
   those renders.

6. **The dock derives its own state.** `turnDockState`, `turnDockDanger`,
   `turnDockSeconds` and `turnDockProgress` come from `state.turn`, `state.window` and
   `state.pending` plus one interval over the absolute deadline. An optional `dock`
   override group remains for the playground's manual selector mode, which drives the
   dock from a history entry rather than a live game.

7. **`@release/ui` mirrors the engine's action types structurally rather than importing
   them.** The kit carries no logic and no domain dependency; it already mirrors
   `TableState` this way. The cost is real — `Target`, `Choice`, `PendingView` and
   `WindowView` are about forty union members maintained in two places — and it is paid
   at the seam rather than avoided (see *The seam* below).

8. **`Table` never stamps time or identity.** `actions.onPlay(card, target?, combo?)`
   mirrors `Action['PLAY']` minus `player` and `at`; `useGame` adds both. Determinism
   requires time to arrive on the action, so no `Date.now()` in the kit — including the
   deadline interval, which reports crossings through `actions.onWindowExpired` rather
   than dispatching.

## The prop surface

| Group | Source | Contents |
|---|---|---|
| `state: TableState` | `toTableState(PlayerView)` | hand, release zones, opponents, decks, turn, pending, window, playable, frozen, over |
| `actions: TableActions` | `useGame` | `onPlay`, `onDraw`, `onPush`, `onAttack`, `onPass`, `onUnpass`, `onResolve`, `onOverContinue`, `onWindowExpired`, `legalTargets` |
| `copy: TableCopy` | `t()` in the page | the nine current `*Copy` props plus `pauseCopy`, under one object |
| `room: TableRoom` | session / P2P layer | `code`, `role`, `participants`, `spectators`, `spectatorLimit` + handler, `onKickSpectator`, `lang` + handler, `connection`, and the pause block from #62 |
| `panel` / `onPanelChange` | the page | which drawer tab is open |
| `slots` | the page | `corner`, `banner` |

`slots` has exactly two named positions, both driven by things the playground has no
equivalent of: `corner` for the leave-game control (navigation, so it cannot live in the
kit) and `banner` for the engine-error notice described under *Failure modes*. No third
slot until something needs one.

The pause block belongs in `room` because pause is host authority over the room, not a
state the reducer knows about.

## The interaction surface

`useTableInteractions` lives in `apps/ui/src/table/Table/` and is a three-phase machine:

1. **`idle`** — clicking a hand card in `state.playable` moves to `selected`; clicking one
   outside it shakes the card and stays.
2. **`selected`** — the card is accented through `Hand`'s existing `accentAt`, and if
   `actions.legalTargets(card)` returns anything, the targeting arrow tracks the cursor.
   Legal drop zones highlight; illegal ones do not respond. A legal drop fires the intent;
   `Escape` or an outside click returns to `idle`.
3. **`comboPending`** — entered when the selected card is a combo source and a Sudo partner
   is legal. A second hand card completes it.

Phase 3 is why gesture state cannot be lifted out of the kit: it is two DOM-anchored
selections before a single domain action exists.

The dock and reaction-window affordances need no phase. `TurnDock` already has
`onDraw` / `onPush` / `onPass`, and `state.window.canAttackWith` gates the attack path the
same way `playable` gates the release path. Pending prompts render through the existing
`ConfirmAction` component, which is exported today but unused by `Table`.

Legality is never computed in the kit. `playable`, `canAttackWith` and `legalTargets` are
the engine's answers; the kit only renders and gates on them. This retires `cardCanTarget`,
`isComboSource` and `validComboTarget` in `apps/ui/src/cards/catalogue.ts`, which are
already labelled as mock logic.

## The seam

Decision 7 keeps the kit free of `@release/engine`, which puts the risk of drift on the
translation between them. `apps/frontend/src/entities/game/` is the one layer that imports
both, so it owns the translation and proves it at compile time:

- `toTableState.ts` — `PlayerView` + event log → the kit's `TableState`.
- `toAction.ts` — kit intent + player + time → `Action`.
- A type-level suite asserts mutual assignability in both directions.

When the engine gains a `Pending` kind or a `Target` variant, the frontend stops compiling
and names the missing case — instead of the kit silently rendering a prompt the engine no
longer produces.

## Frontend wiring

```
useGame ──► dispatch(Action) ──► reduce() ──► { GameState, Event[] }
                                                    │
                                project(state, you) ─┴─► PlayerView
                                visible events ────────► eventLog
                                          │
              toTableState(view, eventLog)│    room ◄── SessionProvider
                                          ▼
                            <Table state=… actions=… room=… />
                                          │  completed intents only
                                 toAction ─┴─► dispatch(Action)
```

Four modules, placed per the layer rules in
[`apps/frontend/CLAUDE.md`](../../apps/frontend/CLAUDE.md):

1. **`features/play-game/useGame.ts`** — owns `GameState`, calls `reduce`, keeps the
   projection and the visible-event log, stamps `player` and `at` onto every action. The
   single module the P2P sync layer replaces later.
2. **`entities/game/toTableState.ts`** — pure adapter, described above.
3. **`entities/game/toAction.ts`** — pure adapter, described above.
4. **`pages/board/[gameId]/_layout.tsx`** — stays thin: the hook, the adapters, `t()`, the
   `?panel=` binding, the two slots. `PLACEHOLDER_STATE` is deleted.

`room` is assembled in the page from `SessionProvider`, never from the engine — Decision 3
holding at the call site.

The turn clock lives in `useGame`: one interval over the absolute deadline that dispatches
`WINDOW_EXPIRED` on crossing. Locally the sandbox owns that dispatch; under P2P it becomes
the turn authority's, which is why it sits here rather than in the page or the kit.

## Failure modes

- **Illegal action.** `reduce` returns the state unchanged plus a `rejected` event. The
  kit gates most of these before they are dispatched, but the engine remains the authority.
- **The engine throws.** `useGame` wraps the call, retains the last good state, and fills
  `slots.banner`. Losing a live match to a rules bug is worse than a degraded one.
- **Unknown card id.** `toTableState` renders a placeholder slot rather than letting
  `assetUrl` throw and take the page down.
- **Abandoned decision.** Deadlines and their defaults on expiry are the engine's, not the
  UI's — otherwise peers diverge on a timeout.

## Testing

1. **`apps/ui`** — clicking a card outside `playable` dispatches nothing; a legal drop
   fires exactly one `onPlay` with the right `(card, target, combo)`; a combo source needs
   two selections before anything fires; `Escape` and outside-click return to `idle` with
   no dispatch; controlled `panel` calls `onPanelChange` and does not update itself.
2. **`entities/game`** — table-driven over `PlayerView` fixtures: hand uid assignment,
   event log folded into `MoveHistory`'s tree via each event's `parent`, unknown `CardId`
   renders a placeholder. Plus the type-level assertion suites.
3. **`features/play-game`** — every action carries `player` and `at`; a throwing `reduce`
   retains the last good state and raises the banner; `WINDOW_EXPIRED` fires once on
   deadline crossing, not per tick.
4. **`pages/board`** — renders projected state; `PLACEHOLDER_STATE` is gone.
5. **`packages/engine`** — unchanged. This work adds no engine code, so the conformance
   suite from #59 stands as-is.
6. **`playground/table`** — a solo game playable end to end against the fake engine with no
   frontend: draw, play, release, reaction window, defend, win. This is milestone 2's real
   definition of done.

**Every new test is verified by mutation, not by reading.** Break the code the test names,
confirm it goes red, restore. Nine tests during the engine work shipped green while
asserting nothing, and every one was found this way — none by inspection.
[`2026-07-27-game-engine-plan.md`](./2026-07-27-game-engine-plan.md) records the specific
failure modes.

## Milestones

1. **Prop regrouping** — the five groups, controlled `panel`, `view` retired, dock derived.
   `TableStory` and the page move to the new shape; no behaviour change.
2. **`Table` becomes interactive** — the action surface, `useTableInteractions`, and a
   `TableStory` mode driven by the real fake engine.
3. **The page** — `useGame`, the two adapters, `/board/:gameId` on real state,
   `PLACEHOLDER_STATE` deleted.

Milestone 1 is separated so the regrouping lands as a reviewable no-op refactor rather
than mixed into the diff that adds behaviour.

## Relation to existing issues

[#18](https://github.com/MythHand/ReleaseBoardGameP2P/issues/18) is refined, not replaced.
Its Decision 8 stands; this spec adds the prop grouping, the `state` / `room` split, the
controlled panel, and Decision 7's structural mirroring.

[#51](https://github.com/MythHand/ReleaseBoardGameP2P/issues/51) is untouched. `Table` is
already the controlled component that issue asks for; its subject is `screens/Start` and
`screens/Lobby`, which the frontend re-implements today.
