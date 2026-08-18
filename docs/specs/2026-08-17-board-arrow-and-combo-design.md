# Arrow targeting and the combo pair on the board

Issues: [#99](https://github.com/MythHand/ReleaseBoardGameP2P/issues/99) and
[#100](https://github.com/MythHand/ReleaseBoardGameP2P/issues/100), sub-tasks of
[#88](https://github.com/MythHand/ReleaseBoardGameP2P/issues/88). **Wave 2** — both stand on the
board animation layer from [#96](https://github.com/MythHand/ReleaseBoardGameP2P/issues/96) and
branch from the #97 stack. One design, two stacked PRs: the arrow lands first because three later
scenes need it (#100, #101, #102), the combo lands on top of it.

## The goal

The arrow is the aim gesture: a card is pulled out of the fan, an arrow tracks the cursor to the
target it will hit, legal targets light up, and a press commits the play. The combo is two cards
played as one: the pair folds at the centre, flies as one thing, and splits back into two singles
on its way to the discard. The approved movements are
[`ArrowStory`](../../apps/playground/stories/ArrowStory/ArrowStory.tsx) and
[`ComboStory`](../../apps/playground/stories/ComboStory/ComboStory.tsx); this design makes the
board play them from engine events and real legality instead of mocks.

Combo plays in scope: **Sudo + attack** (the hand attack that aims with the arrow, and the window
attack whose target the window already names) and **Code Review + release**. Sudo + defence is
Wave 3 (#101); operation combos are Wave 7, gated on #61.

Every preset the scenes need already exists (`playToCenter`, `foldIntoPair`, `enterPose`,
`playToReleaseZone`, and the three carriers `useFlyer` / `useHandArrival` / `useDiscardExit`).
The expectation is **zero new presets** — what the two tasks add is a staging gesture, beat kinds,
and the engine's own answers about legality.

---

## What the issues ask for, and what the code actually says

### Legal targets come from the projection — which carries none

#99: *"legal targets come from the projection, not from geometry."* Today the projection has no
targets to give. [`PlayerView`](../../packages/engine/src/view.ts) carries `playable` and `frozen`
but no targets; `engine.legalTargets` needs the full `GameState`, which a non-keeper peer never
holds. The frontend half of the machinery exists and is dead:
`TableActions.legalTargets` is read by `_useBoardInteractions` and exercised by the board tests,
but [`_layout.tsx`](../../apps/frontend/src/pages/board/[gameId]/_layout.tsx) never supplies it —
so `targets` is always `[]` and a click-played attack dispatches **with no target**. The view
grows a `targets` field (§PR A).

### The pull exists in the component, not on the board

#99: *"`Hand`'s existing `onPlay` intent already reports the pull, so no new gesture layer."* True
of [`Hand`](../../apps/ui/src/table/Hand/Hand.tsx) — `onPlay(uid, drop)` with the drag flyer's
rect, click preserved under the 6 px threshold — but the board renders the hand in click mode:
no `onPlay`, no `onReorder`, no drop rect to continue a flight from. Wiring it is PR A's gesture.

### `placed` is not the combo's event

#100 names the engine events as *"`attacked` (with `sudo: true`), `placed`."* In the engine,
`placed` is emitted in exactly two places — a Monitoring play
([`release.ts:178`](../../packages/engine/src/fake/release.ts)) and an AI-event Monitoring landing
([`triggers.ts:298`](../../packages/engine/src/fake/triggers.ts)) — and Monitoring takes no combo.
The event a Code Review pair actually produces is `released` with its `codeReview` field. This
design reads #100's `placed` as `released(codeReview)` and says so here rather than silently.

### The discard leg has no event to plan from — and the Sudo half is banked too early

`DiscardReason` declares `attackSpent` and `defenceSpent`; nothing emits them. A resolved attack
banks its card to the discard silently. Wave 0 already recorded this gap; #100 is where it closes,
because the pair's split into the discard heap is a beat and a beat is planned from events (§PR B).

The Sudo half has a second problem: it is banked **at attack time**
([`attacks.ts`](../../packages/engine/src/fake/attacks.ts) hands `discard(spent, [sudoCard])` no
log; the hand-attack path in `release.ts` does the same). On a physical table both halves of the
pair lie in front of the victim until the exchange resolves — the early bank would put the Sudo
card on the discard heap (`discardTop`, `discardCount`) while the pending pair still shows it at
the centre: the same card in two places, and the beat's last frame could never equal the
projection. The banking moment moves to resolution (§PR B). This is bookkeeping timing, not a
rules change — nothing can read the discard pile while a defence is pending (a pending suspends
`playable`, draws, and every other pile reader), and the tests pin that.

### Supports are unplayable by design — combo legality needs its own answer

[`playableFor`](../../packages/engine/src/fake/project.ts) returns `false` for `support` — correct,
a support is never a standalone play. But the approved staging starts **from the support card**
(pull Sudo / Code Review out, partners light up), so the board needs the engine's answer to "may
this support start a pair right now, and with whom". Today
[`toBoardState.ts`](../../apps/frontend/src/entities/game/board/toBoardState.ts) derives
`comboOptions` locally from the rules table — its own comment admits it is not the engine's
answer, and it pairs in the wrong direction besides (main-first, where ComboStory is
support-first). The view grows a `combos` field and the local derivation is deleted.

---

## Architecture

### The decision: staging owns the pre-commit scene, the beat continues from it

The pull → fold → aim gesture happens before any event exists — #99 is explicit that the arrow
"must not wait on a round trip through the keeper". So the gesture layer stages locally, exactly
as ComboStory does, and when the event batch lands the combo beat picks up from wherever the
viewer already is:

- **the actor** has a staged card or pair standing at the centre — the runner adopts its rect and
  animates only the tail;
- **everyone else** has nothing — the runner plays the full fold from the actor's seat anchor,
  then the same tail.

One runner, two entry points. Two alternatives were rejected: replaying everything from events for
everyone (the actor watches their own play rewind — exactly what #99 forbids), and optimistic
beats synthesized at dispatch (breaks the queue's event-id watermark and makes rejection ugly).

Staging state is a page-level concern next to `_useBoardInteractions`; the handoff contract with
the beat runner (staged uids + the pair node's rect) lives in
`entities/game/board/types.ts`, the same home `BeatRun` and `IntroBeat` already use so features
never import siblings.

### PR A — arrow targeting (#99)

**Engine.** `PlayerView.self` grows `targets: Record<CardUid, Target[]>`: for every playable card
that needs a target, the `Target[]` the engine would accept — `attackTargets`' own answer, so a
hand attack offers seats and DDoS offers releases and Monitorings. Absent or empty means "no
target needed". Computed in `project.ts` beside `playableFor`; no rules change, no redaction
change (the projection is already per-viewer).

**Wiring.** `toBoardState` maps engine `Target` → `TableTarget` kind-for-kind (the shapes already
mirror each other), and `_layout.tsx` finally passes `legalTargets` — turning the existing
`targets` / `onPick` lighting on `Seat` and `ReleaseZone` live.

**The gesture — pull replaces click-select.** The board supplies `Hand.onPlay`. A pull of a card
with targets is accepted: the card leaves the fan and flies to the `.centre` staging
(`playToCenter`, continuing from `HandPlayDrop.rect`), the arrow arms from the staged card
(`useArrow` + `centerOf` — already rendered in `_Board`), targets light. A press on a lit target
stops the arrow and dispatches `PLAY` with it. A press on anything else, or `Escape`, returns the
staged card to the middle of the fan (`useHandArrival`) — the cancel ComboStory shows. A pull of a
no-target card is refused (`return false`, the Hand glides it back); click keeps doing what it
does today for immediate no-target plays. The click-select arrow code this replaces is removed.

**The seam PR B builds on.** After dispatch the staged card stands at the centre, inert. When
`attacked` arrives, staging clears and the same `.centre` node renders the pending attack
statically from the projection (`pending.kind === 'defend'` already carries `attackCard`;
`toBoardState` passes it through). Same place, same size — invisible for the actor; opponents see
the card appear with the projection, un-animated until PR B's beat. On `rejected`, the staged card
returns to the fan.

### PR B — the combo pair (#100)

**Engine.** Two additions. (1) `PlayerView.self.combos: Record<CardUid, CardUid[]>` — for each
support card in hand, the uids it may pair with right now: on the holder's turn, playable
sudo-carriers for Sudo and playable releases for Code Review; inside a reaction window, the
`canAttackWith` cards that carry a sudo effect. Empty means the support cannot start a pair.
(2) The declared discard reasons become real events, and the Sudo half's banking moves to
resolution: the pending carries the Sudo instance alongside the attack it rode, and every
resolution path — a hit taken, a defence, an expired window — banks both halves together,
emitting `discarded(reason: 'attackSpent')` for each and `discarded(reason: 'defenceSpent')` for
a spent defence. Emission order and `parent` links are pinned by tests, as is the invariant that
the discard pile is unreadable while the exchange is pending. Code Review is untouched — it stays
under its release (the rules discard it only with the release), and `released(codeReview)`
already says everything.

**UI package.** `PAIR_AUX` / `PAIR_AUX_POSE` join the `@release/ui` barrel (today only `CardPair`
is exported — the frontend cannot read the pose). `ReleaseZone` learns to render a static
`CardPair` for a released card whose view carries `codeReview`. No new presets expected; if a
movement turns out to need one it lands as a module with its `reference.md` row, per the
animations rule.

**Staging grows the pair.** Pulling a support with a non-empty `combos[uid]` stages it and lights
the partners in the fan (`accentAt`). Picking a partner is the ComboStory fold verbatim: partner
box measured from fan geometry (not the rotated slot rect), `CardPair` mounted in the staging
flyer, first frame painted with `enterPose(from, box)` before the start — the staged half is the
degenerate `enterPose(box, box)` identity, and no branch is added — then `foldIntoPair` per half,
the aux onto `PAIR_AUX_POSE` with a snap landing. Then, by partner kind: window attack →
dispatch `ATTACK { card, combo }` straight from the fold (the window names the target); hand
attack → aim phase, then `PLAY { card, target, combo }`; release → `PLAY { card, combo }`.
Cancel at any stage returns everything staged to the fan at once — one `useHandArrival.arrive`
with the halves as `anchor: 'main' | 'aux'` items.

**The beat.** `planBeats` learns two kinds. `attackPlaced`, from every `attacked` — sudo or not:
the plain attack is the aux-less degenerate case of the same runner, no separate branch.
`releasePlaced`, from `released` carrying `codeReview` (a plain release keeps today's behaviour).
The runner (`features/board-beats/comboBeat.tsx`) has the two entry points from the decision
above. Tails: an attack pair settles into the `.centre` pending display — which upgrades from PR
A's single card to a `CardPair` when `pending.sudo` — and a Code Review pair flies
`playToReleaseZone` into the owner's slot, landing on the exact pose the `ReleaseZone` static
render already holds (the last frame is the projection). The resolution batch — the new
`discarded` events — plans a `pairToDiscard` beat: `useDiscardExit` with one `Leaving` carrying
`aux`, the split into two singles, the aux starting at `PAIR_AUX.rot` read as a number. The plan
walk routes these `discarded` events by matching them against the pending exchange in `before` —
the halves of a resolved pair take the pair exit, everything else keeps flowing into the existing
discard beat unchanged. The pose
is declared once as data; the CSS string, the fold keyframe and the discard number are its three
representations — nothing restates the angle.

**Not yet right, and recorded.** A sudo Rollback returns the attack card to a hand — that exchange
is Wave 3 (#101). Until then the resolution beat sends both halves to the discard even when the
projection says the card went elsewhere; the discrepancy goes to the audit register and
`docs/animations/backlog.md`, not into a local branch of the runner.

### Data flow

```
pull → stage (.centre) → fold → aim → press target
  → onPlay(card, target?, combo?) → toAction → PLAY/ATTACK → keeper
  → events: attacked(sudo) / released(codeReview) / discarded(reason)
  → planBeats → attackPlaced | releasePlaced | pairToDiscard
  → comboBeat.run: staged? tail only : full fold + tail
  → last frame = projection (pending CardPair / ReleaseZone pair / discard heap)
```

### Error handling

- `rejected` → staged cards return to the fan; state untouched (the engine guarantees identity).
- A beat throw costs the animation, never the state — the queue's existing guarantee.
- Disconnect mid-staging: nothing was dispatched, cancel works locally.
- Reduced motion: the gesture layer asks `prefers-reduced-motion` itself (staging becomes instant
  placement); beats collapse in `useBeats` as today. `play()` still checks nothing.

## Tests

- **Engine** — `project.test.ts`: `targets` appears only for playable targeting cards, seats for
  hand attacks, releases/Monitorings for DDoS; `combos` per context (turn vs window), empty when
  no legal partner. `attacks.test.ts` / `release.test.ts` / `window.test.ts`: the new `discarded`
  emissions — reasons, order, `parent` links — and the Sudo half reaching the discard only at
  resolution, on every path (hit taken, defence, expired window, elimination mid-exchange);
  conformance suite re-run for event-count and discard-content assumptions.
- **Frontend** — `toBoardState.test.ts`: the `Target` → `TableTarget` map, `combos` passthrough,
  pending attack card passthrough. `planBeats.test.ts`: `attacked` → `attackPlaced` (sudo and
  not), `released` + `codeReview` → `releasePlaced`, resolution `discarded` → `pairToDiscard`.
  Board tests in `__tests__/`: pull → aim → press dispatches with the pressed target; press on
  nothing returns the card; `rejected` returns the card; support pull lights partners and the
  dispatch carries `combo`; the opponent path (no staging) plans the full fold; pending renders a
  `CardPair` under `sudo`; reduced motion stages without flights.
- **UI** — `docs.test.ts` stays green (no preset without a `reference.md` row); `ReleaseZone`
  renders the pair for `codeReview`.

## Documentation

- `docs/animations/recipes.md`'s combo recipe describes the older click-to-start scene — it is
  rewritten to the current story shape as part of PR B.
- The Interaction audit page: arrow and combo scenario statuses move to "on the board"; findings
  below go into its register **and** `docs/animations/backlog.md`.

## Out of scope

- **Touch input** — what an aim gesture is on a touchscreen is undecided anywhere in the project;
  it is a backlog finding, not a decision to make here (#99 says the same).
- **Defence-side scenes** — sudo Rollback's return-to-hand and the whole exchange choreography are
  #101.
- **Operation combos** — Wave 7, gated on #61. The engine's `combos` field will simply list no
  partners for them until their targets exist.
- **Optimistic beats** — rejected above, recorded so nobody re-derives it.
