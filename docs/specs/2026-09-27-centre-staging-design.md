# What is put out at the centre is seen by everyone

**Date:** 2026-09-27
**Issue:** [#168](https://github.com/MythHand/ReleaseBoardGameP2P/issues/168)
**Rule:** `docs/rules/resolution.md` §1 — «Выложенное на стол видно всем», «То же правило и у атаки»,
«И у любой другой карты», and the ⚙️ timeout note under them.

## The task

A card the player pulls out of the fan and puts at the centre, while it waits for what completes
the play — a Sudo for its partner, a Code Review for its release, a release for its cost, an attack
for its target — is seen by every player. So is taking it back into the hand. The game's logic —
what plays with what, in which order, what happens after — does not change.

## Why

`resolution.md` §1 has said since 24.08 (#127) that a card put out at the centre is seen by the
whole table while the player decides. The code never followed: the engine learned of a staged card
only when the play completed, and kept an unpaid release out of every view but its owner's.

This supersedes Decision 5 of `2026-08-18-defense-release-board-design.md` («the cancel emits no
events — no peer ever knew»).

## The engine

- **`PlayerState.shown`** — the uids of the cards the player has put out at the centre. The cards
  **stay in the hand**: legality, spending and the census are untouched. `setHand` drops a card
  from `shown` when it leaves the hand, as it already does for `frozen` and `replayLocked`.
- **`SHOW { player, card }`** emits `shown { player, card }`; **`TAKE_BACK { player }`** emits
  `takenBack { player, cards }`. Both public, face up. Neither restarts the turn clock.
- A release's play in base mode shows the release (and its Code Review); its cancel takes them
  back with `takenBack`.
- The referee takes shown cards back when the turn's deadline fires (⚙️ in §1).
- **Only a card its player could start a play with now** is accepted (`onShow`, `fake/shown.ts`):
  playable on its own (`playableFor`), an attack thrown at a fresh release (`canAttackWith`), a Sudo
  or Code Review with a partner, or that partner (`combosFor`) — the same answers the board lights
  the fan by. Anything else is refused and stays home, so no other seat's card can stand beside
  the one really out.
- **One attack at a time** (`resolution.md` §1, `fake/window.ts`): while a responder's attack — or
  the Sudo it goes with — is out, or an attack is being dealt with, other responders' `SHOW` and
  `ATTACK` are refused (`another attack is out`, `an attack is being dealt with`) and
  `canAttackWith` offers them nothing. Whoever reached the keeper first is the one.
- **A pass is only a mark** (the ⚙️ on passes in §1, owner 04.10): it costs the one who passed
  nothing — they may still attack — and the window closes early only when every responder has
  passed. An attack or its Sudo put out by a responder starts the passes over; no `PASS` is taken
  while one is out (`an attack is out`); `UNPASS` takes a pass back and says so with `unpassed`,
  which has no row in the move history. The dock shows it: no dots and no PASS while an attack is
  out — its attacker sees the attack being made, everyone else the attacker's turn.
- **A responder's Sudo holds the time to attack** for `SUDO_PARTNER_MS` (10 s, the ⚙️ under
  «Атакующие действуют одновременно» in §1): the window's deadline becomes the Sudo's own. If no
  attack joins it, or it is taken back, the Sudo goes home and the time to attack starts anew
  (`endSudoTime`). An attack card still out when the time to attack runs out goes home too.
- **Projection:** `PlayerView.shown` — every shown card with its owner, for every viewer. An
  opponent's `handCount` leaves the shown cards out. `discardForRelease` no longer redacts
  `release`.

## The board

- **Layout** — `shownLayout` (`entities/game/board`): one player's shown cards stand in the places
  the actor's own staging uses — a release at the stage slot, a support in the row, a Code Review
  folded with its release in the row's first place, a Sudo under an attack at the middle, a card
  aiming at the middle.
- **Render** — `_Board` draws another player's shown cards in that layout, and our own when our
  gesture holds nothing at the centre (the board was rebuilt: the stand's viewer switch, a
  reconnect). The fan does not draw a card the projection shows at the centre.
- **Beats** — `shownBeat`: another player's `shown` flies seat → place (`useToCentre`,
  `takeFromSeat`), or folds into a pair with the card already standing (`usePairFold`); their
  `takenBack` flies place → seat (`dealToSeat`). Our own events plan nothing. `comboBeat.foldIn`
  and `operationBeat` start an attack's, a release's or a git operation's play from the place its
  card stands when it was shown, and take it off the centre rather than off the seat's count a
  second time.
- **Gesture** — `_useBoardStaging` sends `SHOW` when a card is put out at the centre and
  `TAKE_BACK` on every cancel — a miss, Escape or a refused play — whether or not the engine has
  confirmed the card out yet. From the cancel until our `takenBack` arrives, the cards asked back
  are home for the player: the centre does not draw them off the projection, the fan does not
  give them up, whatever the table still says of them. A rebuilt board (a reload, the stand's
  viewer switch) finds our cards out with the gesture empty: the gesture takes up the step it
  would be at, read off `shownLayout`, and one with nothing left to choose goes home through the
  ordinary cancel.
- **Refusals** — the keeper's "no" to an intent this peer sent reaches the board as its own list
  (`useGame`'s `rejections`), never as an event of the feed. A refused `SHOW` of a staged card
  sends it back to the fan through the ordinary cancel, whatever the reason.
- **Transport** — every connection opens ordered (`reliable: true`), so the keeper receives a
  player's `SHOW` and `TAKE_BACK` in the order they were made.
- **History** — `shown` and `takenBack` have no row in the move history.
