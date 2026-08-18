# Release and defence on the board

**Date:** 2026-08-18
**Project:** ReleaseBoardGameP2P ("Release любой ценой")
**Issues:** [#101](https://github.com/MythHand/ReleaseBoardGameP2P/issues/101) (Wave 3 of
[#88](https://github.com/MythHand/ReleaseBoardGameP2P/issues/88)), plus
[#95](https://github.com/MythHand/ReleaseBoardGameP2P/issues/95) as its named prerequisite.
**Scope:** The playground's `DefenseReleaseStory` brought to the real board, driven by engine
events: the release played with its cost shown in the open, the attack window, attacks from seats,
defences covering them, the defence-side Sudo pair, Security Bug's steal, Rollback's return — and
the `CardPreview` for reading cards standing at the centre. The engine grows the missing window on
a stolen release (#95) and a cancel for the release-cost pending. The visual source of truth is the
recipe "Defending a release — the whole turn" (`docs/animations/recipes.md`) and the story itself.

> Builds directly on the arrow/combo design
> ([2026-08-17-board-arrow-and-combo-design.md](./2026-08-17-board-arrow-and-combo-design.md)):
> `_useBoardStaging`'s pull/fold/handoff machinery, `planBeats`/`useBeats`, and `comboBeat`'s
> `attackPlaced` / `releasePlaced` / `pairToDiscard` are reused, not rebuilt.

## The goal

The core loop of the game becomes visible on the board: a release is made and pays its cost in the
open, the window opens, attacks fly in from seats, and answers cover them — for the actor through
gestures, for everyone else through beats planned from the same events. When this lands, Waves 4+
(Error 503, elimination) inherit the exchange shape it introduces.

## Decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | #95 | **Fixed in the engine first, as its own PR to main.** A stolen release opens its own window; the win by steal settles on that window's close. |
| 2 | Work cut | **Two PRs.** PR 0: the engine fix (`fix/95-stolen-release-window`, off `main`). PR 1: the whole scene (`feat/101-defense-release`, stacked on `feat/100-combo-pair` while [#117](https://github.com/MythHand/ReleaseBoardGameP2P/pull/117) is open, rebased onto `main` when it merges). |
| 3 | CardPreview | **In scope**, wired to the five centre slots only. It was untracked anywhere; this scene is where reading the centre becomes load-bearing (choosing a defence against a standing attack). |
| 4 | Cost pick UI | **A table gesture, not the panel.** The staged release stands at the stage slot; the fan is the picker; the generic `PendingDecision` panel is suppressed for `discardForRelease`. |
| 5 | Cancel of a staged release | **A new engine choice.** `discardForRelease` gains an owner-only cancel that clears the pending and emits no events — the release play emitted none either, so no peer ever knew. Fits the engine's philosophy (`unpassed` already exists for a change of mind). |
| 6 | Defence gestures | **A new sibling hook `_useDefenseStaging.ts`**, not more growth of `_useBoardStaging.ts` (562 lines): turn plays and window plays are different modes with different dispatches, and only one is active at a time. |
| 7 | Remote release plays | **Fully choreographed, including the cost.** The cost card's identity is public (`discarded` carries the id), and "the cost is shown beside it in the open" is a rules-reading for the table, not a courtesy to the actor. |
| 8 | Take-the-hit | **Stays declarative** (button), not a gesture — the recipe choreographs none. |
| 9 | Bare moments | `passed`/`unpassed`/`tookHit`/`monitoringDestroyed`/`neutralized` plan no new choreography. Anything that feels bare goes to the audit register + `docs/animations/backlog.md`, never into an invented local movement. |

## What the issue asks for, and what the code actually says

### More of the scene already exists than the issue implies

`comboBeat` (from #100) already: flies a **remote attack** from the attacker's seat card box to the
centre (`foldIn` aims with `anchors.seatBox`, the `cardBoxIn` equivalent — I6), adopts the actor's
own staged play via `StagedHandoff` so nothing is ever on screen twice, flies a Code Review release
into its zone slot for **any** player, and splits the resolving pending pair to the discard
(`pairToDiscard`). What #101 adds on the beat side is precisely: the **cover**, the **steal**, the
**Rollback return**, and widening the release flight to plain releases with the cost shown.

### The engine already models the cost as the choreography needs it

`release` action → pending `discardForRelease`, **zero events emitted** — remote peers see nothing
while the actor picks a cost. Paying resolves to one batch: `discarded(releaseCost)` → `released` →
`windowOpened`. The staged release standing at the centre is therefore purely local until the cost
is paid — exactly the staging→beat handoff shape #100 built.

### The recipe's cancel needs one engine addition

"A press on nothing valid takes back whatever is staged (the Release awaiting its cost)" — but once
`release` is dispatched the engine holds the pending with no way back. Hence Decision 5. Dispatch
timing stays as today (on drop / partner pick) so engine validation stays early; the cancel covers
the gap between dispatch and cost pick.

### #95's ordering question dissolves against the rules text

`resolution.md` §1: attack time starts the moment a Release lands in a zone, *"чьим бы ходом это ни
было и как бы она туда ни попала"*. The steal removes the old window's subject, so the old window
closes (the resolution path already does this); the new one opens in the same resolution step. No
overlap (§1's "nothing else happens"), no deferral (§1's "as soon as it lands"). #67 already moved
the played-release win check to window close and added a post-steal check — that check now moves to
the new window's close, the same correction #67 made for played releases.

Two adjacent facts pin the fix's shape: the **reflected** Security Bug never steals (rules-owner
ruling after #92, already in code — `docs/rules/backlog.md` "Спека отстаёт от кода"), so there is
exactly one call site; and a stolen release arrives without a Code Review (a CR-protected release
cannot be Security-Bugged at all), so the no-window CR exception never applies to it.

### Rollback's return is invisible in the event stream — a finding, not a workaround

`attacks.ts:245-252` (and `handAttacks.ts:345-351`) puts the attack card back into a hand by
mutating state and emits **nothing** for it: the batch carries `defended(effect: 'return')` and the
`defenceSpent` / `attackSpent` discards of the spent cards, and that is all. `handTransfer` exists
as an event type and is not used here.

So the beat derives the recipient the same way #100 already derives a resolving pair's sudo half:
the defender keeps the card when a `defenceSpent` discard of `support-sudo` accompanies the
`defended` (that is exactly `sudoDefence` in the engine); otherwise it goes back to the attacker,
who is `pending.attacker` in the *before* projection. The derivation is sound today and is what
this scene ships.

It is still a gap: a movement with no event behind it is one rename away from silently stopping.
**It goes to `docs/animations/backlog.md` and the audit register** with the fix named (the engine
emits `handTransfer` for the return, and the plan reads it instead of inferring), so the choice is
recorded rather than rediscovered. Making that engine change is not in this scene's scope —
deriving is consistent with the code around it, and widening the event surface mid-wave would land
untested in a PR about animation.

### CardPreview was never tracked

The audit binds `table/CardPreview` to CardPlay, AiCards, Error503 and DefenseRelease — but no
issue tracks bringing it to the board and #96 didn't. Decision 3 puts it in this scene's scope,
bound to the five centre slots; other scenes' bindings ride with those scenes.

## Architecture

### PR 0 — the stolen release's window (#95)

**Behaviour.** In `attacks.ts`'s take path, after `takeRelease` lands the release in the thief's
slot: close the current window (already happens), then open a fresh one on the thief's slot — same
deadline source as any window, round counter fresh. Event order in one batch: `releaseStolen` →
`windowClosed` (victim's slot) → `windowOpened` (thief, the same release-type slot). The post-steal
win check moves to that window's close: a third stolen release must survive its window before it
wins.

**Non-changes.** No event-shape changes (`windowOpened`/`windowClosed` exist), so nothing rides
into the projection. The reflected path is untouched. `win.test.ts`'s assertion of the immediate
win is rewritten — it currently pins the wrong behaviour in writing.

### PR 1 — the scene

#### The centre grows a slot family

Today the centre is one anchor (staged card / pending attack). It becomes the story's family:
**stage** (release awaiting cost), **cost**, **attack** (the existing pending render), **cover**,
**sudo** — each an axis-aligned box with the tilt on an inner pose element, so the slot rect stays
the true card box (I6). Poses from the recipe: attack `rot −4`, cover `rot 6, dx 16, dy −12`, sudo
`rot −7`. New refs join `anchors.ts`; `_Board`'s centre block renders the family.

#### Staging: the release and its cost (`_useBoardStaging.ts`)

The pull and dispatch are unchanged. New: while `pending` is your `discardForRelease`, the staged
release holds the **stage** slot, the fan lights as the picker, and a hand click flies the card to
the **cost** slot shown open, dispatching the RESOLVE. The `PendingDecision` panel no longer
renders for this pending kind. A press on nothing valid dispatches the new cancel choice and takes
the release home through the existing return flight (`useHandArrival`, into the middle of the fan).
A rejection of the RESOLVE returns the cost card the same way and leaves the release staged.

#### Staging: the defence (`_useDefenseStaging.ts`, new)

Active only while `pending` is a `defend` owed to you. Availability comes from the projection, the
way `comboOptions` did in #100 — which defences light, whether Sudo is offered (only when the hand
holds a defence it can enhance that also answers this attack; never against a sudo-backed attack).

- **Plain defence:** pull a defence from the fan, drop it on the attack → it covers (COVER_POSE,
  ~240 ms), dispatch. A rejection returns it by the existing return-flight path.
- **Sudo defence:** pull Sudo → it takes the **sudo** slot with the arrow pointing out of it →
  clicking a defence in the fan folds the pair via `foldIntoPair` (MERGE_MS 620) — the standing
  Sudo is handed to the fold's flyer **in the same commit**, never on screen twice — the pair
  covers the attack → dispatch. Miss/Escape takes the Sudo home; a pick is irrevocable once the
  fold starts, same as #100's partner pick.
- **Take the hit:** the declarative button, as today.

Shared flight primitives (the fold-in, the return-to-fan) are extracted to a module both staging
hooks import, rather than copied.

#### Beats: `planBeats` grows two plans and widens two

1. **`releasePlaced` widens to every `released`** (today Code Review only), gaining optional
   `cost: {eventId, card}` read positionally from the `discarded(releaseCost)` that precedes it in
   the batch (the `revealAfter` idiom) and **claiming** that discard so `discardBeat` doesn't
   double-fly it. The runner (`comboBeat.runRelease`): actor → staged release and cost already
   stand at their slots (handoff); cost holds open (SHOW_HOLD 1200), exits via `useDiscardExit`,
   then the release flies `playToReleaseZone` (SNAP). Remote → release folds in from the seat to
   the stage slot, cost flies seat → cost slot shown open, holds, exits, release lands. Easy-mode
   games simply have no cost half.
2. **New plan `covered`** from `defended`: the defence (a `CardPair` when sudo-enhanced) covers the
   attack — handoff for the local defender, flight from the seat's card box for a remote one —
   lands in COVER_POSE, holds (LAND_HOLD 700), then routes by `effect`:
   - **cancel / reflect:** the whole exchange — attack (+ its sudo), cover (+ defender's sudo) —
     leaves as **one** `useDiscardExit` send, each card with its table layer (I9), landing on each
     `discarded` event's own `scatterAt` (I7). The plan claims those `attackSpent`/`defenceSpent`
     discards; `pairToDiscard` remains for cover-less resolutions (take-hit). Reflect's destruction
     on the attacker's side is the existing `discardBeat` zone flight.
   - **return (Rollback):** the cover exits normally; the attack card is *not* discarded — it flies
     back to its recipient's hand: into the local player's own fan via `useHandArrival`, or into a
     remote player's seat box (dissolving into their counter). The card was public at the centre,
     so no visibility question. **The recipient is derived, because no event records the return** —
     see below; local-vs-remote covers both directions, since the rolled-back attacker can be the
     local player just as easily as the defender can.
3. **New plan `stolen`** from `releaseStolen`: the release flies zone → zone (victim's slot rect
   from the *before* projection, thief's from the live one — both anchors exist for opponents) and
   morphs into its LOD reading **in flight**, ported from the story. It rides the same batch as the
   Security Bug's own `pairToDiscard` exit and the new `windowOpened`; the queue plays them in
   event order.
4. **Everything else plans nothing** (Decision 9); those events keep breaking coalesced runs, as
   the walk's default already does.

**Runner placement:** a new `defenseBeat.tsx` owns `covered` + `stolen`; `comboBeat` keeps
`attackPlaced` / `releasePlaced` / `pairToDiscard`. Each runner holds its own `useDiscardExit` /
`useFlyer` and a `reset()` joining the established cancellation idiom (rematch, unmount).

#### CardPreview

Imported from `@release/ui`, bound to the five centre slots, rendered at one fixed place on the
right. Behaviour per the audit's ruling verbatim: size = the hand's hover zoom at its largest +15%
/ −10%; closes by the one rule — the pointer moved somewhere that is neither a readable slot nor
the preview (which yields both special cases for free: a card discarded under a still cursor keeps
the preview until the mouse moves; a pointer resting on the preview keeps it); 90 ms delay on
leaving a slot only, no blind period; face-down shows nothing. No bindings on the hand or zones —
those belong to the scenes that own them.

### Data flow

Actor: gesture → dispatch → engine events → `planBeats` (reads the *before* projection, I1) →
beat adopts the staged nodes via `StagedHandoff` → last frame = projection. Remote: the same events
→ the same plans → flights from seats/zones. One exchange pending at a time (engine invariant), so
`covered` never overlaps itself.

### Error handling

Every dispatch keeps #100's discipline: a rejection cannot outlive its dispatch, a mid-flight
target press cannot be clobbered, and a rejected play returns home through the same return flight
that a cancel uses. Beats that cannot measure a source or target play nothing and let the
projection resolve (the established "never stranded" rule). `prefers-reduced-motion` is honoured
through the Wave 0 layer's policy.

## Tests

- **PR 0:** `attacks.test.ts` — steal → the close/open pair, the victim may attack the stolen
  release, a defended steal-window attack reopens round+1; `win.test.ts` — the immediate-win
  assertion rewritten to settle on window close; conformance assertions for the new sequence.
- **PR 1, engine:** the `discardForRelease` cancel — owner-only, clears pending, emits nothing,
  rejected for non-owners and absent pendings.
- **PR 1, plans:** `planBeats.test.ts` — cost linkage + claim; `covered` routing per effect and its
  claims; `stolen`; Rollback recipients derived both ways (sudo → defender, plain → attacker, each
  with the local player on either side); easy-mode (no cost).
- **PR 1, runners:** `defenseBeat.test.tsx` in the established mock pattern — what `send` received
  (layers, scatters), not just that it was called; handoff adoption for the local defender.
- **PR 1, staging:** both hooks — gestures, cancels, rejection returns, the adoption race
  (`comboHandoff.test.tsx` precedent), the panel suppressed for `discardForRelease`.
- **PR 1, board:** the centre slot family renders and anchors; CardPreview's open/close rules
  including the two special cases.

## Documentation

Same PR as the code it describes: the audit page's scenario status for Defense Release plus any
findings into its register **and** `docs/animations/backlog.md` — the Rollback-return event gap
above is one such entry, written with what it costs and what would close it; `recipes.md` touched only where
board reality diverges from the story; a new preset (only if the LOD morph cannot be a mid-flight
content swap) gets its `reference.md` line or `apps/ui/src/animations/docs.test.ts` goes red. All
new user-visible copy through `@release/translation`, keys in **both** `en` and `ru`. PR 0 closes
#95; PR 1 closes #101.

## Out of scope

- CardPreview bindings for CardPlay / AiCards / Error503 scenes — they ride with those scenes.
- Error 503 (`#102`), elimination (`#103`) — Wave 4, inheriting this exchange shape.
- Any choreography for `passed` / `unpassed` / `tookHit` / `monitoringDestroyed` / `neutralized`
  beyond what the projection and existing beats already show (Decision 9).
- The window countdown UI — already on the board from Wave 1.
