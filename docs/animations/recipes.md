# Recipes — animations by game situation

Each recipe is an **independent action**: an explicit trigger + guard, the exact ordered
sequence, the verbatim params/timings, the invariants that keep it stable, and the cleanup —
so it can be called at the right game moment and replay identically on repeat.

Read the shared model and the `I1…I10` invariants in [`README.md`](./README.md) first; recipes
reference those by number instead of repeating them.

**Where a movement has a step, the recipe names the step — it does not restate its mechanics.**
Three movements are shared and live in one place each ([`reference.md`](./reference.md#the-movement-steps-and-the-carrier-under-them)):
`useHandArrival` (cards arrive in the hand), `useDiscardExit` (cards leave the table for the
discard), and the carrier `useFlyer` under both. A recipe says *which step and what
it is passed*; the frame-by-frame — measuring, `nextFrames`, the scatter coupling, the layer order,
splitting a pair — lives inside the step and is described there, once.

**Recipe schema** (every recipe has these sections):

- **When to call** — the game event that triggers it + the guard/preconditions.
- **Visual result** — one line: what the player sees.
- **Elements / refs** — DOM nodes/slots/state the action needs (must pre-exist).
- **Sequence** — numbered, exact steps (set state / mount → measure → `nextFrames` → position →
  `play(...)` → `await` → branch → cleanup).
- **Params & timings** — the concrete numbers (durations, easing, offsets), verbatim.
- **Invariants** — the global `I#` it relies on + any local ones ("else it breaks …").
- **End state & cleanup** — final positions and state resets.
- **Building blocks** — links into [`reference.md`](./reference.md).
- **Live reference** — the playground story that is the visual source of truth.

---

## Playing a card — hand/opponent → center → discard

> **The engine does not emit this pair.** `placed` is a Monitoring protection landing in the
> release zone (`fake/release.ts:177`, `fake/triggers.ts:298`) and staying there, and a card spent
> on an attack reaches the discard through `bankToDiscard` with **no event at all**. There is no
> table centre in `PlayerView` either. This recipe stays as the description of the *movement*,
> which is real and shown in `CardPlayStory` — what it is **not** is a mapping from engine events.
> Both findings are in [`backlog.md`](./backlog.md); for the live board, see
> "A card leaves the hand for the discard" below.

The card is played to the table center (visible to everyone), rests there during its effect,
then leaves to the discard. Two independent triggers: **A** (to center) and **B** (to discard).

**When to call**
- **A — to center:** the player clicks a hand card, or the opponent plays one. Guard:
  `if (busy || center) return` — the center holds exactly one card; wait until it is cleared.
- **B — to discard:** the centered card resolves (in the showcase, a click on it). Guard:
  `if (busy || !center) return`.

**Visual result**
A card lifts from the hand (or from the opponent's seat), flies to the table center face up and
rests there; on resolution it flies to the discard on the right and lands rotated/offset among
the pile.

**Elements / refs**
- `handRefs[uid]` — the played hand card's slot (A source, player).
- `seatRef` — the opponent's seat (A source, opponent).
- `centerRef` — the one-card center slot (A target / B source).
- `discardRef` — the discard slot (B target).
- `flyerRef` — the **single** fixed flyer node that carries the card to the centre.
- State: `center: CardData | null`, `discard: DiscardEntry[]`, `flyer: { card, at } | null`, `busy`.
  The flyer's state carries **where it mounts** (`at`), not only which card — **[I10]**.
- The trip to the discard is not hand-rolled here: it is the shared step `useDiscardExit`.

**Sequence**

_Phase A — to center_ (trigger handler `playFromPlayer` / `playFromOpponent`, then `flyToCenter`):
1. Guard `busy || center`. Capture the **source rect** `from` and update the source — on the same
   tick, in this exact order (as in the code):
   - player → `setPlayerHand(remove the item)`, **then** `from = handEl.getBoundingClientRect()`.
     React defers the unmount, so measuring the still-mounted node on the same tick is valid.
   - opponent → pop the top of `oppDeck`, then `from = cardBoxIn(seatRect, CARD_W)` — a `Seat` is
     wider than a card and shows only a counter, so there is no card element to measure; the shared
     helper centres a card-sized box on the seat, at the width a card has on the table.
2. `flyToCenter(card, from)`: `setBusy(true)`; measure `to = centerRef.getBoundingClientRect()`.
3. `setFlyer({ card, at: from })` — the flyer is rendered with `style={{ left: at.left, top: at.top,
   inlineSize: at.width }}`, so its **first painted frame is already on the card** — **[I10]**.
4. `await nextFrames()` — **[I2]**, let it paint at `at` before it starts moving.
5. `const anim = play('playToCenter', flyer, { from, to })`; `if (anim) await anim.finished`.
6. `setCenter(card)`; `setFlyer(null)`; `setBusy(false)`. The card now rests in the center.

_Phase B — center → discard (separate trigger):_ this is the shared step, not a local flight.
1. Guard `busy || !center`; `setBusy(true)`; `const card = center`.
2. Measure `from = centerRef` rect — **[I1]**; `setCenter(null)`.
3. `await sendToDiscard([{ key: 'played', card, from }])` — `useDiscardExit`, wired once as
   `useDiscardExit(discardRef, (cards) => setDiscard(d => [...d, ...cards]))`. The step owns the
   scatter, the flight and the landing pose (**[I7]**), and hands back the entries to append.
4. `setBusy(false)`.

**Params & timings**

| Step | Preset | Duration | Easing | Extra |
|---|---|---|---|---|
| A: hand/seat → center | `playToCenter` | 480 ms | EASE | — |
| B: center → discard | `useDiscardExit` | `FLIGHT_MS = 420` | — | the step owns the preset and the scatter |
| opponent source box | — | — | — | `cardBoxIn(seat, CARD_W)` — a card-sized box centred on the seat |
| `jitter()` ranges | — | — | — | `rot ±14°`, `dx ±10px`, `dy ±8px` (inside the step) |

- Card height/width ratio = **1.4** (`CARD_RATIO`, shared from `@/primitives/Card`).
- Hold between A and B is **user-driven** (the card waits in the center until it resolves). For
  an auto-resolving variant, insert `await wait(ms)` between the phases (e.g. `CENTER_HOLD = 420`
  in Deck animations).

**Invariants**
- Global: **I1** (measure before mutate), **I2** (`nextFrames` before each flight), **I7**
  (`jitter()` once, passed into the preset **and** stored with the entry — inside the step here),
  **I10** (the flyer carries the rect it mounts at, or it flashes at the bottom of the page).
- Local — **the center is a one-card gate**: the `busy || center` guard makes the action safe to
  re-trigger; a card must leave the center (Phase B) before another can enter.
- The scene's own flyer carries the card only to the centre; the step raises its own for the trip
  to the discard. Commit to `center` / `discard` state only after the flight resolves, then drop it.

**End state & cleanup**
- After A: `center = card`, flyer gone, `busy = false`.
- After B: a new `DiscardEntry { card, rot, dx, dy }` appended; `center = null`; flyer gone;
  `busy = false`. State is clean for the next play.

**Building blocks**
[`playToCenter`](./reference.md#presets) (`move()` travel) · the step
[`useDiscardExit`](./reference.md#the-movement-steps-and-the-carrier-under-them) · [`cardBoxIn`](./reference.md#card-geometry-helpers) ·
[`nextFrames()`](./reference.md#travel-and-timing-helpers).

**Live reference**
`Card play` — `apps/playground/stories/interactive/CardPlayStory.tsx`.

---

## A card leaves the hand for the discard (live board)

The first choreography driven by real engine events rather than by a scene's own clicks. A
`discarded` event arrives off the wire; the card flies from wherever it stood into the discard heap
and stays there. This is the game-layer counterpart of the scene recipe above — same step, but the
trigger, the source and the timing all come from the projection.

**When to call**
Never directly. The board's queue (`useBeats`) plans it from the batch and runs it. What a caller
controls is `enabled` — the queue is armed only once the opening is over.

**Visual result**
The card lifts from its slot in the fan (or from an opponent's seat, or out of a release slot) and
settles into the discard at its own tilt and offset, among the cards already there.

**Elements / refs** — all from `BoardAnchors`, owned by `_Board.tsx`
- `handSlotAt(index)` — the player's own card, matched by card id against the hand **still on
  screen** (`discarded` carries a card id, not a uid).
- `seatBox(player)` — an opponent's, as a card-sized box centred on the seat (**I6**).
- `releaseSlot(player, slot)` — reasons `destroyed` / `neutralized` only; the card leaves the zone
  it stood in, and the slot is always looked up under its owner (every player has a `frontend`).
- `discardBox` — the target, trimmed to the card area by the step itself.

**Sequence**
1. A batch arrives. `planBeats(events, before)` folds every `discarded` in it into **one** beat —
   one by one but all at once, so a hand-limit discard of three reads as one gesture.
2. `before` is the projection the board is still showing, not the one that just arrived: `live`
   already has the card out of the hand, and its slot with it (**I1**).
3. The queue renders that projection as the `shadow` while the beat runs, so the source slot is
   there to measure.
4. Each card becomes a `Leaving { key, card, from, scatter: scatterAt(eventId) }`; a card whose
   source cannot be found is **not flown at all** (see the backlog — that rule is undecided).
5. `send(items)` — the shared step owns the flight, the tilt unwind and the landing pose.
6. The queue drains, the shadow is dropped, and the live projection takes over.

**Params & timings**

| Step | Preset | Duration | Extra |
|---|---|---|---|
| slot/seat/zone → discard | `useDiscardExit` | `FLIGHT_MS = 420` | the step owns the preset and the scatter |
| scatter key | — | — | `scatterAt(eventId)` — the event id is the stable integer, and the heap uses the same call |

**Invariants**
- **I1** — planned against the projection still on screen, never the one that just arrived.
- **I6** — a seat and a pile are both wider than a card; both are trimmed to a card box.
- **I7** — the flight's scatter and the heap's resting scatter are one value read twice, so the
  handover from shadow to projection changes nothing on screen. This is the property the whole
  design turns on, and it holds across a boundary neither side can see.

**End state & cleanup**
The queue drains, `shadow` goes null, and the board renders the projection — which already contains
the card in `decks.discardHeap`, at the pose it just landed on. Nothing to clean up: the beat owns
no state that outlives it.

**Gating**
None. A discard is a thing that *happened*, not a thing being decided, so the fan stays live
(README, "Gating the hand", approach 3). Only the opening is `exclusive`.

**Under `prefers-reduced-motion`**
The beat is never planned and never runs; the board renders the projection it already holds. One
check, in `useBeats`, because `play()` does not make it.

**Building blocks**
[`useDiscardExit`](./reference.md#the-movement-steps-and-the-carrier-under-them) ·
[`planBeats` / `useBeats` / `BoardAnchors`](./reference.md#the-boards-layer--anchors-and-the-beat-queue) ·
[`scatterAt`](./reference.md#discard-scatter).

**Live reference**
Not a playground scene — this one runs on the real board (`apps/frontend/src/features/board-beats/`).
The movement's own showcase is `Card play`, part B.

---

## A card is drawn (live board)

Driven by `drawn`, planned by `planBeats` and run by `drawBeat` (`useDrawBeat`). One flight to the
centre for every draw in the batch, then a branch on who drew it and what it turned out to be — the
scene is `DrawCardStory`, the trigger here is a real engine event instead of a click on a deck.

**When to call**
Never directly. `useBeats` plans a `draw` beat from every `drawn` in an arriving batch and runs it
through `drawBeat.run`.

**Visual result**
A face-down card lifts from the pile the event names and flies to the table centre. Then: the
drawer's own card flips and settles into their fan; an opponent's stays closed and sinks into their
seat as a back; a trigger flips face up, stands revealed at the centre for a hold, then leaves for
the discard on its own.

**Elements / refs** — all from `BoardAnchors`
- `pileBox(d.pile)` — the source, the pile the event names (not "the deck": `pileBox` is keyed by
  the index `drawn.pile` carries).
- `centre` — where every draw stages, mounted for the whole match (not only during the deal).
- `hand` — the drawer's own fan, via the shared step `useHandArrival`.
- `seatBox(player)` — an opponent's seat, trimmed to a card box (**I6**).
- `discardBox` — the trigger's own exit, via the shared step `useDiscardExit`.

**Sequence** (`toCentre(d)`, then a branch per `PlannedDraw`)
1. `toCentre`: measure the source cell (`cardAreaOf(pileBox(d.pile))`) and the centre; raise a flyer
   face down — its face is `d.card ?? d.reveal?.card` when known, else a generic cover (an opponent's
   closed card carries no identity to guess at); `play('drawToCenter', …)`; `pin('draw', centre)` —
   **[I4]**, so every branch below starts from where the card visibly stands.
2. Branch decided by what the `PlannedDraw` carries, not by any extra lookup — **the card's
   presence, and the reveal that follows it**:
   - **`d.card` present, `d.mine`** → the drawer's own card. `wait(BEFORE_FLIP)` → `patch('draw', {
     faceDown: false })` (the `Card` plays its own `flipCard`) → `wait(AFTER_FLIP)` → measure the
     flyer, `drop('draw')`, `arrive([...], grown)` — `useHandArrival`, where `grown` is read off
     `ctx.current.base.you.hand.length`, the fan **this beat has grown so far** (**I8**).
   - **`d.card` absent, no `d.reveal`** → somebody else's, closed. Straight from the centre:
     `play('dealToSeat', { from: centre, to: cardBoxIn(seatBox(d.player), CARD_W * SEAT_SHRINK) })`,
     no flip, `drop('draw')`, and the shadow's `handCount` for that opponent is bumped and published.
   - **`d.reveal` present** → a trigger, turned up for the whole table. `wait(BEFORE_FLIP)` →
     `patch('draw', { faceDown: false })` → `wait(AFTER_FLIP)` → `wait(REVEAL_HOLD)` → the flyer
     itself (not a copy) is handed to `useDiscardExit.send`, with `node: elOf('draw')` and
     `scatter: scatterAt(d.reveal.discardId)` — the same scatter the heap rests the card on (**I7**)
     — then `drop('draw')`.
3. The loop is serial, one `PlannedDraw` after another; each fully resolves (including a trigger's
   reveal and exit) before the next card starts its own flight to the centre.

**Params & timings**
| Step | Preset / wait | Duration |
|---|---|---|
| pile → centre | `drawToCenter` | 480 ms |
| stand before flipping | `wait(BEFORE_FLIP)` | 220 ms |
| flip settle | `wait(AFTER_FLIP)` | 560 ms |
| a trigger's stand at the centre | `wait(REVEAL_HOLD)` | 900 ms — this task's own value, no approved source (`docs/animations/backlog.md`, #84) |
| own card → hand | `useHandArrival` | `FLIGHT_MS = 480` |
| trigger → discard | `useDiscardExit` | `FLIGHT_MS = 420`, on `scatterAt(discardId)` |
| opponent's card → seat | `dealToSeat` | 460 ms, `to = cardBoxIn(seat, CARD_W * 0.7)` |

**Invariants**
- **I1** — `planBeats` reads `before`, the projection still on screen, so the source pile's slot is
  there to measure.
- **I2** — the carrier paints the flyer at its source before the flight starts.
- **I4** — the flyer is pinned at the centre after `drawToCenter`; every branch (flip, hold, seat
  flight, discard exit) leaves from where it visibly stands rather than from a re-measured rect.
- **I7** — the trigger's exit uses `scatterAt(discardId)`, the same call the heap rests the card on:
  the handover from flyer to heap changes nothing on screen.
- **I8** — the fan grows inside the batch. `useHandArrival`'s `onLanded` callback writes the new hand
  back into `ctx.base` and publishes it, so the next card in the same batch aims at the fan the
  previous one actually grew, not the one the batch started with.

**End state & cleanup**
Own card: spliced into the hand at the arrival gap. Opponent's: `handCount + 1`, published. Trigger:
gone from the centre, resting in the discard heap at `scatterAt(discardId)`. The flyer is dropped in
every branch; nothing outlives the beat.

**Gating**
None beyond the queue's own exclusivity. A draw is not a decision waiting on the player — the fan
stays live and the beat simply runs its course.

**Under `prefers-reduced-motion`**
The beat is never planned and never runs; `useBeats` renders the projection it already holds.

**Building blocks**
[`drawToCenter`](./reference.md#presets) · [`dealToSeat`](./reference.md#presets) · `flipCard` (auto,
via `Card`) · [`useHandArrival`](./reference.md#hand-arrival--cards-arrive-in-the-hand) ·
[`useDiscardExit`](./reference.md#the-movement-steps-and-the-carrier-under-them) ·
[`useFlyer`](./reference.md#the-movement-steps-and-the-carrier-under-them) ·
[`cardAreaOf`/`cardBoxIn`](./reference.md#card-geometry-helpers) · [`scatterAt`](./reference.md#discard-scatter).

**Live reference**
`Draw card` — `apps/playground/stories/interactive/DrawCardStory.tsx`. Not a playground scene itself
— this beat runs on the real board (`apps/frontend/src/features/board-beats/drawBeat.tsx`).

---

## The deck is rebuilt, split, merged (live board)

Driven by `deckReshuffled` and `pilesChanged`, planned by `planBeats` and run by `deckBeat`
(`useDeckBeat`). What happens to the draw piles themselves — none of it carries a card whose face
anybody sees, because a pile is face down before and after: what moves is the pile.

**When to call**
Never directly. `useBeats` plans a `reshuffle` beat from a `deckReshuffled` event, and a `piles` beat
carrying a list of `PileStep`s from the `pilesChanged` events in a batch — Git Branch + Sudo emits
**two** in one batch, and each is classified against the pile counts as they stand after the previous
one, not against `before`.

**Visual result**
The scattered discard gathers into a pile and flies onto a draw pile, flipping face down on landing
(`deckReshuffled`, and the discard-becomes-a-pile half of Git Branch + Sudo). A pile splits — a new
pile slides out from the source pile's spot to its own place (`flyFrom` FLIP). Piles merge — every
pile but the survivor (and, with Sudo, the gathered discard) flies into it and dissolves
(`absorbToDeck`).

**Elements / refs** — all from `BoardAnchors`
- `pileBox(index)` — a draw pile's card box, both as a flight's source and its target.
- `discardBox` — the discard's own spot, source of the reshuffle/fromDiscard movement.

**Sequence**
1. **`deckReshuffled` → `runReshuffle`**: `discardOntoPile(0, ctx.base.decks.discard)` — the recycled
   discard always lands on pile 0 (`refillFromDiscard` only runs when every pile is empty and
   replaces `main` with a single one). Raise a flyer at the discard's top card, `wait(GATHER_MS)`,
   `play('gatherToDeck', …, { duration: 560 })` to the pile, `wait(STEP_HOLD)`, `patch('pile', {
   faceDown: true })`, `wait(TURN_MS)`, `drop('pile')`.
2. **`pilesChanged` → `runPiles`**: for each `PileStep` in order, run `step(s, ctx)` then
   `wait(STEP_HOLD)` before the next.
   - **`merge`**: measure the survivor's rect (`pileBox(0)`) once; every other pile in
     `ctx.base.decks.main`, and the discard if `s.withDiscard`, plays `absorbToDeck` in parallel from
     its own rect into the survivor's; `await Promise.all(…)`; **then** `advance(ctx, s.piles)` —
     the shadow only updates once the flights have actually landed.
   - **`split`**: measure the source pile's rect (`pileBox(s.at)`) **before** anything moves;
     `advance(ctx, s.piles)` publishes the grown row immediately (I1 — mount before measure-from);
     `await nextFrames()`; `play('flyFrom', pileBox(s.at + 1), { from, duration: SPLIT_MS })` — the
     new pile is already in its final DOM place and animates *from* the source's old rect.
   - **`fromDiscard`**: read the discard's top card **before** publishing (`ctx.base.decks.discard`);
     `advance(ctx, s.piles)`; `await nextFrames()`; `discardOntoPile(s.at, top)` — the same movement
     `deckReshuffled` uses, aimed at the new pile's index instead of 0.

**What the classification derives** (`classifyPiles`, `planBeats.ts` — the engine's own event names
none of this; see `docs/animations/backlog.md`):

| before → after | operation | movement |
|---|---|---|
| `before[i] === after[i] + after[i+1]`, length +1 | split at `i` | `flyFrom` FLIP: the new pile is already in its DOM place and animates *from* the source pile's rect |
| `after.length === 1`, sum preserved | merge | every other pile runs `absorbToDeck` in parallel into the survivor's rect, measured once |
| a pile appended at the end, discard emptied | Git Branch + Sudo's second step | the reshuffle movement, into the new pile's spot |
| `after` is `before` minus its zeros | prune | nothing plays — an empty pile ceasing to exist has nothing to move |

**The implemented classifier never returns a `prune` step.** `classifyPiles` returns `null` for that
row — a pile that ran out has nothing on screen to animate away, so there is no `PileStep` variant
for it at all; the running pile count still advances past it (`planBeats` keeps classifying the
*next* `pilesChanged` against the table as it now stands), but nothing is queued to play. This is a
design choice made in code, not a gap: the table above documents the shape of the derivation, the
implementation only emits a `PileStep` where there is something to fly.

**`advance()`'s write-back is load-bearing only for `merge`.** It sets `ctx.base.decks.main` and
publishes it, and the `merge` branch reads `ctx.base.decks.main.length` back out to know how many
piles to absorb. For `split` and `fromDiscard` the `PileStep` already carries its own resolved
`piles`/`at` — `classifyPiles` did that work up front in `planBeats`, against its own running
counter, independent of what `deckBeat` publishes — so the write-back there only drives what renders
on screen, never what the next step does.

**Params & timings**
| Step | Preset / wait | Duration |
|---|---|---|
| gather the scatter | `wait(GATHER_MS)` | 360 ms |
| discard → pile (reshuffle / fromDiscard) | `gatherToDeck` | 560 ms (explicit) |
| flip back-up on landing | `wait(TURN_MS)` | 460 ms |
| new pile fly-out (split) | `flyFrom` | `SPLIT_MS = 520` |
| every pile → survivor (merge) | `absorbToDeck` | `MERGE_MS = 520` |
| between deck steps | `wait(STEP_HOLD)` | 360 ms |

**Invariants**
- **I1** — `split` measures the source pile's rect before `advance()` publishes the grown row, and
  only flies `flyFrom` after `nextFrames()` lets the new pile paint at its final place.
- **I2** — `nextFrames()` before both `split`'s and `fromDiscard`'s flights, so the newly published
  pile has a frame to exist in before anything measures or animates it.
- Local — a `piles` beat can carry more than one step (Git Branch + Sudo): each is run and settled
  (`wait(STEP_HOLD)`) before the next, against the table the previous one actually left.

**End state & cleanup**
The published `decks.main` matches `e.piles` for every step that ran; the discard is emptied by
whichever movement carried it. No state outlives the beat — every flyer is dropped inside the step
that raised it.

**Gating**
None. Like a discard, a deck change is a thing that *happened* on the projection already; only the
opening is `exclusive`.

**Under `prefers-reduced-motion`**
The beat is never planned and never runs; `useBeats` renders the projection it already holds.

**Building blocks**
[`gatherToDeck`](./reference.md#presets) · [`flyFrom`](./reference.md#presets) ·
[`absorbToDeck`](./reference.md#presets) · [`useFlyer`](./reference.md#the-movement-steps-and-the-carrier-under-them) ·
[`nextFrames`/`wait`](./reference.md#travel-and-timing-helpers).

**Live reference**
`Deck animations` — `apps/playground/stories/interactive/DeckAnimationsStory.tsx`. Not a playground
scene itself — this beat runs on the real board (`apps/frontend/src/features/board-beats/deckBeat.tsx`).

---

## Playing a combo (pair) — support pulled, partner folds in, then the board's own beat

> **Shipped shape (#100).** The gesture below is the ported, engine-fed form of ComboStory's own
> `pickPartner`/`cancelStage` (`_useBoardStaging.ts`) — `state.comboOptions` (the projection's
> `PlayerView.self.combos`) stands in for ComboStory's mocked `validComboTarget`, and the fan's own
> geometry stands in for its local `refs`. The **beat** ("The beat", below) is new: a separate,
> event-driven runner (`features/board-beats/comboBeat.tsx`) that plays the same fold for an
> opponent's combo, and splits the pending pair back to the discard at resolution.

**When to call**
- **Pull** (`onHandPlay`, guard `if (!enabled || staged) return false`): a card with a target of its
  own stages a plain aim (see "Targeted arrow attack") — a card with NO target of its own but a
  non-empty `state.comboOptions[uid]` stages the pair's first half instead: `support` set, `phase:
  'partner'`, the arrow armed from the centre exactly as a plain aim's is (`aimFromCentre`), and
  every partner still in the fan lit in the support's own category colour (`accentAt` — ComboStory's
  "the TYPE is the message").
- **Pick a partner** (`onCardClick`, guard `phase === 'partner'`, refused while a cancel or a fold is
  already in flight): not in `state.comboOptions[support.uid]` → `cancel()`, the whole staging
  returns to the fan. A hit commits the fold (`merged: true`) and sets `foldingRef.current = true` —
  irrevocable from here (ComboStory's own `playing`): neither `cancel()` nor a second click on
  another candidate is honoured again until the fold's own `finish()` (or one of its early bails)
  clears the flag.
- **After the fold** (`finish()`), by partner kind: a window already covers it →
  `onAttack(main.uid, support.uid)` at once; the partner still needs a target → `phase: 'target'`,
  re-aim; else (a release) → `onPlay(main.uid, undefined, support.uid)`.

**Visual result**
Pulling the support stands it alone at the centre and arms the arrow; every legal partner lights in
the support's own category colour. Clicking one folds the two together — the partner travels in
from its own fan slot, the support stays put — and the merged pair immediately either dispatches
into an open window, aims for a target, or plays straight through to a release slot. From there the
beat takes the pair the rest of the way: resting as the pending exchange at the centre, or settling
into the release zone.

**Elements / refs**
- `anchors.centre` — the merge target, the same node the plain-aim recipe stages onto.
- `state.comboOptions[uid]` — the engine's own legal-partner list (`PlayerView.self.combos`, keyed
  support-first), replacing ComboStory's mocked `validComboTarget` (`mockLegality.ts`, its functions
  retired from the board, kept only to run the playground story).
- `slotBox(index, total)` — the partner's own FAN geometry, not a slot's rotated bounding rect
  (**I6**) — `anchors.hand`'s rect + `slotPlacement`, standing in for ComboStory's `refs[uid]`.
- `pairRef` — the persistent pair-flyer node `_Board.tsx` mounts (`data-testid="board-pair-staged"`);
  `CardPair` renders inside it only once `staged.merged`, painted frame by frame on its
  `[data-main]` / `[data-aux]` children — the same idiom as ComboStory's own `flyRef`.
- `foldingRef` — true from the click that commits the fold until `finish()` (or an early bail)
  clears it in a `finally`; `cancel()` and a second `onCardClick` both refuse while it holds.
- `StagedHandoff` (`entities/game/board/types.ts`) — the seam to the beat: `mainUid`, `supportUid?`,
  the DOM node the staged play already stands on (`pairRef` once merged, else the solo staged node),
  and `release()` — the hook's own no-flight clear.

**Sequence** (`onCardClick`, once a support already stands at the centre)
1. Validate the click against `state.comboOptions[support.uid]`; a miss calls `cancel()` and stops.
2. Measure — **[I1]**: `mainHand = slotBox(index, handItems.length)`, `cRect = anchors.centre`.
3. `arrowCtl.stop()` — the choice is made; commit `{ support, main, phase: 'partner', merged: true }`;
   `foldingRef.current = true`.
4. Reduced motion (or no fan geometry to fold from): pin `pairRef`'s `left/top/width/opacity` to
   `cRect` directly and call `finish()` at once — `CardPair`'s own inline pose (main identity, aux
   `PAIR_AUX_POSE`) already IS the pair at rest, nothing to paint frame by frame.
5. Otherwise: `await nextFrames()` — **[I2]**, the just-mounted `CardPair` has painted. Cancel
   leftover animations on `pairRef` (`getAnimations({ subtree: true })`) — **[I3]**. Pin `pairRef` to
   `cRect`; paint the first frame with `enterPose(mainHand, cRect)` on `[data-main]` and
   `enterPose(cRect, cRect)` on `[data-aux]` — the support's own entry pose is the degenerate
   identity case (it is already at the centre), no separate branch. `await nextFrames()` again.
6. **The fold** — `play('foldIntoPair', mainEl, { from: mainHand, box: cRect, dur: 620 })` and
   `play('foldIntoPair', auxEl, { from: cRect, box: cRect, pose: PAIR_AUX_POSE, dur: 620, snap: true })`
   in parallel; `await Promise.all([a1?.finished, a2?.finished])`.
7. `finish()` — wrapped in `try`/`finally` so every exit clears `foldingRef`, not only this one —
   branches on the partner: a window names it → `phase: 'dispatched'`, `onAttack(main.uid,
   support.uid)`; it still has its own targets → `phase: 'target'`, re-aim from the centre; else (a
   release) → `phase: 'dispatched'`, `onPlay(main.uid, undefined, support.uid)`.

Staging's own job ends here — there is no `PAIR_HOLD`-style wait the way ComboStory holds the
assembled pair for 2100 ms; the beat owns everything from the dispatch onward.

**Cancel, at any stage before the fold commits**
A lone support (`phase: 'partner'`, not yet merged) returns the single-card way the plain-aim recipe
already does. A committed pair returns as ComboStory's `cancelStage` does: both halves fly off
`pairRef` in one `useHandArrival.arrive` call (`anchor: 'aux' | 'main'`), landing at the support's
own pull-time index sized for both — one group, the fan settling to projection order once `staged`
clears.

**The beat — `attacked` / `released(codeReview)` / the resolution split (`features/board-beats/comboBeat.tsx`)**
What happens once the engine answers is a separate, event-driven beat — it also plays an opponent's
combo, or a local window attack that staged nothing at all.
- **`attackPlaced`**, planned from every `attacked` (sudo or not — a plain attack is this same
  runner's aux-less degenerate case, no separate branch): `runAttack` reads the staging→beat handoff
  SYNCHRONOUSLY, before its first `await` — the actor's OWN play is already standing exactly where
  the pending render takes over, so nothing moves; it calls `handoff.release()` and hands the table
  back. Anyone else's attack folds the pair in fresh via `foldIn` — a second, beat-side
  implementation of the same steps as the gesture's own fold above (raise a carrier at the centre via
  `useFlyer`, paint both halves at their source with `enterPose`, `await nextFrames()` — **I2** —
  then `foldIntoPair` per half from the actor's seat or the hand slot a local thrower's card left) —
  and settles at the centre pending, `[data-pending-play]`, upgraded from a lone card to a `CardPair`
  under `pending.sudo`.
- **`releasePlaced`**, planned from every `released` event — widened from `codeReview`-only (Task 11,
  #101): a plain release now runs the same beat, `foldIn`'s no-aux case standing in for its fold, and
  the beat also carries the release's own cost leg (see "Defending a release" below for the cost,
  board-side). `runRelease` reads the same handoff; the actor's own staged pair (or solo card) flies
  `playToReleaseZone` straight from the centre to the slot; anyone else's folds in first via
  `foldIn`, then flies. The landing pose is `ReleaseZone`'s own static `CardPair` render — the beat's
  last frame IS the projection.
- **`pairToDiscard`**, planned from the resolution's `discarded` pair: `planBeats` matches the
  pending exchange's two halves — sudo-first, since a sudo Rollback banks only the sudo half — ahead
  of the ordinary discard routing (the centre is in no hand and no zone, so `sourceOf` would never
  find it there). `runPairOut` measures `[data-pending-play]` and hands `useDiscardExit` one
  `Leaving` with `aux` set: the pair splits into two singles, the aux riding its own `auxScatter`
  (`scatterAt` of its own `discarded` event — **I7** — the main's `scatter` alone only ever reached
  the main card; without this the aux would fly to a random `jitter()` and snap to its true rest the
  instant the heap took over).

**Params & timings**
| Step | Preset / animation | Duration | Easing |
|---|---|---|---|
| fold — main half | `foldIntoPair` | 620 ms | EASE → its `enterPose` origin to identity |
| fold — aux half | `foldIntoPair` (`snap`) | 620 ms | SNAP → `PAIR_AUX_POSE` |
| release → zone | `playToReleaseZone` | 480 ms | SNAP |
| discard (per half) | `useDiscardExit` | 420 ms | EASE + `scatterAt` / `auxScatter` |

**Invariants**
- **I1** measure the fan slot and the centre before mutating anything, in both the gesture's fold and
  the beat's `foldIn`. **I2** `nextFrames()` after mounting/painting the pair's first frame, in both
  places too. **I3** cancel subtree animations on the reused `pairRef` node before repositioning it.
  **I6** the partner's box comes from the fan's own geometry (`slotBox`), not a rotated slot rect.
  **I7** the aux half's discard flight and the heap's own rest for it share one scatter
  (`auxScatter`), never a fresh `jitter()`. **I8** the staging→beat handoff is read synchronously,
  before the beat's first `await` — reading it one line later, after `nextFrames()`, loses a race
  against `_useBoardStaging`'s own passive hand-watching effect, which would otherwise fold the
  actor's own play in a SECOND time from a hand slot it already left (found empirically; pinned by
  `comboHandoff.test.tsx`).
- The pair flyer (`pairRef`) is a **persistent** node, opacity/position toggled rather than remounted
  per fold — the same reason `foldIntoPair` is a per-half call, not a move of the whole pair.
- The discard holds **singles**: the pending pair reaches it as **two** entries, split by
  `runPairOut`.

**End state & cleanup**
Dispatched and adopted by the board: `staged` clears via `handoff.release()`, no flight at all.
Folded in from elsewhere: the pair rests at `[data-pending-play]` (an attack) or in the
`ReleaseZone`'s support slot (a release) — the beat's last frame is the projection either way.
Resolved: two `DiscardEntry`s land in the heap; `[data-pending-play]` is gone.

**Under `prefers-reduced-motion`**
The gesture places the standing card(s) instantly (step 4 above). The beat is never planned and
never runs (`useBeats`'s own blanket `if (reduced) return`); the board renders the projection it
already holds.

**Not yet right, and recorded**
A cancelled pair returns both halves through one fan gap at the support's own index rather than two
independent ones — ComboStory's own middle-return acceptance, kept as-is unless it reads badly on
the live board. This finding is in [`backlog.md`](./backlog.md) and the audit page's register.

(The sudo-Rollback return this section used to flag as having no movement on the board at all — Wave
3, #101 — is now built: see "Defending a release" below for the exchange itself, and `backlog.md` for
the one gap that survives it — the return's recipient is derived rather than read off an event.)

**Building blocks**
[`foldIntoPair`](./reference.md#presets) · [`playToReleaseZone`](./reference.md#presets) ·
[`enterPose`](./reference.md#presets) ·
[`useDiscardExit`](./reference.md#the-movement-steps-and-the-carrier-under-them) ·
[`scatterAt`](./reference.md#discard-scatter) ·
[`planBeats`/`useBeats`/`BoardAnchors`](./reference.md#the-boards-layer--anchors-and-the-beat-queue) ·
[`nextFrames()`](./reference.md#travel-and-timing-helpers) ·
[`useArrow`/`centerOf`](./reference.md#arrow-toolkit) · `CardPair`, `PAIR_AUX_POSE`.

**Live reference**
`Combo` — `apps/playground/stories/ComboStory/ComboStory.tsx`, the design-exploration scene the fold
was ported from verbatim — no engine behind it. The shipped gesture and beat run on the real board:
`apps/frontend/src/pages/board/[gameId]/_useBoardStaging.ts` (the pull/fold) and
`apps/frontend/src/features/board-beats/comboBeat.tsx` (the beat).

---

## Targeted arrow attack — aim from a card, track the cursor, light the target

**When to call**
The player arms a targeting arrow by clicking a source card (`arm`): `aim(centerOf(el), { x: e.clientX, y: e.clientY })`,
`setArmed(card)`. Used when a card needs a target (an attack, or the combo `target` phase). Cancel:
a `window` mousedown while `active` → `setArmed(null)`, `setHovered(null)`, `stop()`.

**Visual result**
A quadratic-Bézier arrow in the card's category color springs from the card's center and follows
the cursor; hovering a target zone lights it in the same color; clicking empty space cancels.

**Elements / refs**
- `refs[card.id]` — the source card spot (arrow origin via `centerOf`).
- `useArrow()` → `{ from, to, active, aim, stop }` — holds endpoints, tracks the cursor while active.
- Target zones: `lit = active && hovered === id`, highlighted via `--hl: color`.

**Sequence**
1. `arm(e, card)`: `aim(centerOf(refs[card.id]), { x: e.clientX, y: e.clientY })` — sets `from`, seeds
   `to` at the cursor, `active = true`; `setArmed(card)`.
2. While `active`, `useArrow` adds a `mousemove` listener that sets `to = { clientX, clientY }` each
   move — the arrow tail follows the cursor.
3. Target zone `onMouseEnter` (only if `active`) → `setHovered(id)`; `onMouseLeave` clears it. A `lit`
   zone gets `--hl: color`.
4. Confirm/cancel is the **consumer's** call: here a `window` mousedown cancels; in `ComboStory` the
   target click runs `runPlay`. `stop()` clears `from/to/active`.

**Params & timings**
- No timed flight — a live-tracked SVG overlay. `color = var(--cat-${armed.category})` (else `--brand-green`).
- Arrow geometry (in `Arrow`): quadratic Bézier, control point offset `min(len * 0.2, 130)` on the
  perpendicular, always bowing upward; arrowhead angled to the curve tangent.

**Invariants**
- None of I1–I8 apply (no flyer/flight). Local: endpoints are **viewport** coords (`clientX/Y`), the
  same space as `centerOf`.

**End state & cleanup**
- On `stop()`: `from = to = null`, `active = false`; the `Arrow` unmounts (`{active && <Arrow … />}`).

**Building blocks**
[`useArrow` / `centerOf`](./reference.md#arrow-toolkit) · [`Arrow`](./reference.md#arrow-toolkit).

**Live reference**
`Arrow` — `apps/playground/stories/ArrowStory/ArrowStory.tsx` (and the `target` phase of `ComboStory`).

---

## Cards arrive in the hand (`useHandArrival`)

**When to call**
Wherever a card ends up in the player's hand — a draw, a card taken from an opponent, a card pulled
out of the discard, a play taken back. Standalone trigger (showcase, the `Card to Hand` page): click
a source card, or the pair example, → `arrive(items, hand.length)`.

**Visual result**
The fan opens a gap in its MIDDLE — as wide as the number of arriving cards; they fly from their
source spots into that gap, scaling to the hand-card size and rotating to their slots' angles; they
ride above the fan briefly, then tuck under it and land at their slots' bottom-centre.

**Elements / refs**
- `handRef` — the `Hand` fan container (the step measures it and reads `@/table/Hand/fan` geometry).
- the source spots (the flight origins), whichever they are.
- `useHandArrival(handRef, onLanded)` → `{ overlay, gapAt, gapSize, arrive, reset, busy, FLIGHT_MS }`.
- `Hand` gets BOTH `gapAt` and `gapSize` — a gap of one is the default, and a two-card arrival into a
  gap of one lands two cards on the same slot.

**Sequence** (`arrive(items, handLength, at?)`, inside the step)
1. Guard `if (flights.length) return`. `gap = at ?? round(handLength / 2)`, clamped to the hand;
   `total = handLength + items.length`; card `i` aims at `slotPlacement(gap + i, total)`.
   **The middle is for an ARRIVAL, `at` is for a PLACEMENT.** A draw has no place of its own, so the
   middle is honest and a draw and an undo read as one event. A card the player DRAGGED into the fan
   has a place — the slot the pointer named — and landing it in the middle throws that away.
2. Measure the hand rect `hr` — **[I1]**. Each card's source is resolved in one of three ways: its
   `from` rect; the element it IS (`el` — measured, then taken off screen for the flight); or one half
   of a pair (`el` + `anchor`, whose tilted bbox is trimmed with `cardBoxIn` — **[I6]**).
3. A source resting at a tilt (`rot`) is mounted with the pivot difference compensated: the slot
   pivots on its bottom centre, a tilted card rests on its own centre, and without the shift the very
   first frame jumps by ~`h/2·sin(rot)`.
4. The flight is built from `insertPath(fromPt, toPt, gap + i, total)` (reference) — the fan's own rule
   for being entered, so a card drawn from the deck and a card carried back off the table come into
   the fan the same way. Both points are the card's **bottom centre** (the pivot it turns and scales
   about); each position becomes a pose — translate along the path, `rot → place.rotate`, `scale 1 →
   CARD_W / source.width`.
5. `setFlights(list)`; `setGapAt(gap)` — the fan starts opening WHILE the cards travel; **double-rAF**
   — **[I2]** → the poses are played on each flyer node (`FLIGHT_MS`, `FLIGHT_EASE`, `fill: forwards`);
   a `START_HIGH_MS` timer → `tucked = true`, and each overlay div's
   `zIndex = tucked ? place.z : 'var(--z-flight)'`.
6. After `FLIGHT_MS`: `onLanded(gap, landed)` — the step hands back WHAT arrived (each entry's `key`
   is the card's uid), the scene splices its own items at `gap` — then `reset()`. Closing the gap and
   adding the cards is the same layout, so nothing shifts on the last frame.

**Params & timings**
| Aspect | Value |
|---|---|
| flight | the `insertPath` positions played on the flyer node, `FLIGHT_MS = 480` at `FLIGHT_EASE` (= `--ease-soft`) |
| travel-layer hold | `START_HIGH_MS = 140` (then z drops from `var(--z-flight)` to the slot's z) |
| target size | `scale = CARD_W / source.width` (`CARD_W = 150`, the fan's card width) |
| slot | `slotPlacement(gap + i, handLength + items.length)` from `@/table/Hand/fan` |

**Invariants**
- **I1** measure the hand rect (and the sources) before starting. **I2** double-rAF before flipping
  `started`, or the overlay jumps from its origin. **I6** a tilted half is trimmed to a card box.
- **I8** do not read the scene's staging on landing — it is cleared the moment the flight starts (or
  the cards would be drawn twice); that is why the step hands back what arrived.
- Local: this is **not a `play()` preset** — the flight is WAAPI keyframes built from `insertPath`,
  because a curve is not something a transition can draw. The gap and the flight are one coordinated
  move — the fan must render `handLength + items.length` slots so the landing slots exist.
- A card enters the fan **by the fan's rule**, not by this step's own: being inserted between two
  cards is one situation, whether the card came off the deck or out of the player's hand.

**End state & cleanup**
- `onLanded` splices the cards into `hand` at `gap`; the step resets (`gapAt = null`, flights cleared).
  The fan is whole again with the new cards.

**Building blocks**
[`useHandArrival`](./reference.md#hand-arrival--cards-arrive-in-the-hand) (**playground-local** — see
the README "Current state" note) · `@/table/Hand/fan` (`slotPlacement`, `insertPath`, `CARD_W`) ·
`Hand` (renders `gapAt` + `gapSize`).

**Live reference.** `Card to Hand` — a single card, and a Release with the Code Review laid with it
arriving together.

---

## Drawing a card (single) — deck → center (back-up) → player / opponent / trigger

**When to call**
Player clicks a draw deck → `draw(deckIndex)`. Guard `if (busy || !nextCard) return`; `setBusy(true)`;
clear `centerCard/aiCard/alert`; `await drawOne(nextCard, deckIndex)`; `setBusy(false)`. `nextCard` is
the forced selection (`resolveForced(forced)`).

**Visual result**
A back-up card lifts from the clicked deck to the staging spot (the center, or the left "cause" slot
for an AI trigger), flips face up, then: a player's card flips and settles into the hand; an
opponent's sinks back-up into their seat; a trigger stays revealed at the center.

**Elements / refs**
- `deckRefs[i]` — draw-deck cells (source). `centerRef` — staging; `causeRef` — AI-trigger staging (left).
- `seatRefs[oppId]` — opponent seats. `handRef` — the player fan (via `useHandArrival`). `discardRef`, `aiRef`.
- `flyerRef` — the flyer, **keyed by `seq`** (`flightSeq`). State: `flyer {card, faceDown, seq}`, `centerCard`, `busy`.

**Sequence** (`drawOne(card, deckIndex)` → `boolean` "can continue")
1. `isAi = card.id === AI_TRIGGER`; `deckCell = deckRefs[deckIndex]`; `stageRect = (isAi ? causeRef : centerRef)` rect.
2. `setFlyer({ card, faceDown: true, seq: ++flightSeq })` — **[I5]**; `await nextFrames()` — **[I2]**.
3. `from = cardAreaOf(deckCell)` — **[I6]**; position the flyer at `from`; `play('drawToCenter', el, { from, to: stageRect })`;
   await. Then **cancel + pin** to `stageRect` (identity) — **[I3][I4]** so the next flight starts here.
4. Branch on `card.category`:
   - **trigger** → `await revealForAll(card)`: `wait(220)` → `setFlyer(faceDown:false)` (the `Card` plays
     `flipCard`) → `wait(560)` (let the 420 flip play) → `setCenterCard(card)`; `setFlyer(null)`. Then AI
     vs Error 503 (separate recipes below).
   - **non-trigger, player** → `toPlayerHand(card)`: `wait(220)` → flip (`faceDown:false`) → `wait(560)` →
     measure the flyer rect → `setFlyer(null)` → `arrive([{ key: uid, card, from: rect }], hand.length)` (`useHandArrival`). returns `true`.
   - **non-trigger, opponent** → `toOpponent(drawer)`: `wait(160)` → `to = cardBoxIn(seatRect, fromRect.width * 0.7)` →
     `play('dealToSeat', el, { from: fromRect, to })` (fades in) → bump `handCount` → `setFlyer(null)`. returns `true`.

**Params & timings**
| Step | Preset | Duration | Note |
|---|---|---|---|
| deck → staging | `drawToCenter` | 480 ms | back-up; `from = cardAreaOf(deckCell)` |
| flip reveal | `flipCard` (auto, on `faceDown` change) | 420 ms | JS waits `220 + 560` around it |
| player → hand | `useHandArrival` | `FLIGHT_MS = 480` | see the hand-insert reference entry |
| opponent → seat | `dealToSeat` | 460 ms | +fade; `to = cardBoxIn(seat, w*0.7)` |

**Invariants**
- **I2** `nextFrames` before the flight. **I3/I4** cancel + pin the flyer after `drawToCenter` (identity)
  so the next leg starts from where it visually is. **I5** `key={seq}` on the flyer — a new flight is a
  fresh `Card`, so the `faceDown` flip doesn't spin mid-flight on a reused node. **I6** aim at the deck's
  card area. **I8** the card travels as an argument through the async chain.
- Local: `revealForAll`/`toPlayerHand` **wait out the flip** (`220`/`560`) — a deliberate cascade around
  the `Card`'s auto-`flipCard`.

**End state & cleanup**
- Player: card inserted at `gap` (via the `onLanded` splice); flyer gone. Opponent: `handCount+1`; flyer gone.
  Trigger: `centerCard = card` stays; flyer gone.

**Building blocks**
[`drawToCenter`](./reference.md#presets) · [`dealToSeat`](./reference.md#presets) · `flipCard` (auto) ·
[`useHandArrival`](./reference.md#hand-arrival--cards-arrive-in-the-hand) · [`cardAreaOf`/`cardBoxIn`](./reference.md#card-geometry-helpers) ·
[`nextFrames`/`wait`](./reference.md#travel-and-timing-helpers).

**Live reference**
`Draw card` — `apps/playground/stories/interactive/DrawCardStory.tsx`.

---

## Multi-draw — one card per deck, in turn; a trigger can stop the batch

**When to call**
The "draw" button → `drawBatch()`. Guard `if (busy) return`; `setBusy(true)`; clear `centerCard/aiCard/alert`.

**Visual result**
For N decks, cards are drawn one per deck in sequence (each through the single-draw scenario). The forced
card appears at the chosen "queue" position; the rest are random non-trigger cards. An unresolved trigger
(Error 503) stops the run.

**Sequence**
1. Build `seq: CardType[]` of length `deckCount`: position `i+1 === forcedAt` → `forcedCard ?? randomNonTrigger()`,
   else `randomNonTrigger()`.
2. `for (i in seq)`: `canContinue = await drawOne(seq[i], i)`; `if (!canContinue) break`.
3. `setBusy(false)`.

**Params & timings** — none of its own; each item runs the single-draw recipe. **Serial** (`await` per card), not parallel.

**Invariants**
- Inherits the single-draw invariants per card. **I8**: each `drawOne` gets its card + deck index as args — no state read mid-loop.
- Local: the loop is **serial** and **short-circuits** when `drawOne` returns `false` (an Error 503 trigger).
  An AI trigger returns `true` (it plays out), so the batch continues.

**End state & cleanup**
- Hands/opponents/discard updated per drawn card; on an Error 503 the remaining decks are **not** drawn. `busy = false`.

**Building blocks**
The single-draw recipe (above) + `drawOne`'s `boolean` return.

**Live reference**
`Draw card` — the "draw" button (`deckCount > 1`).

---

## AI resolution — trigger → discard, effect → deck (after a table hold)

**When to call**
Inside `drawOne`, when the drawn trigger is the AI trigger: after `revealForAll`, `const eff = await drawAiEffect()`,
then `if (eff) await resolveAi(card, eff)`. `drawOne` returns `true` (the batch may continue).

**Visual result**
The AI trigger rests on the left as the "cause"; a larger effect card is drawn from the events deck to the
center. After a hold, both leave at once — the trigger scatters to the discard, the effect flips back-up in
place and returns to the events deck (staggered by its flip).

**Elements / refs**
- `causeRef` (trigger, left), `effectRef` (effect, center, larger), `aiRef` (events deck), `discardRef`.
- `outRefs.trig` / `outRefs.eff` — the leaving-card flyers (from `outs` state).

**Sequence**
- `drawAiEffect()`: `ai = resolveAiCard()`; `setFlyer({ card: ai, faceDown: true, seq: ++ })`; `nextFrames`;
  `from = cardAreaOf(aiRef)`; position; `play('drawToCenter', el, { from, to: effectRef rect })` (arrives
  enlarged); await; **cancel + pin** to `toRect` — **[I3][I4]**; `wait(160)`; flip (`faceDown:false`);
  `wait(560)`; `setAiCard(ai)`; `setFlyer(null)`; return `ai`.
- `resolveAi(trig, eff)` — cards passed as **args** — **[I8]**:
  1. `await wait(AI_HOLD)` (4000 — table hold while the effect is read).
  2. Measure `causeRect`, `effectRect`, `discardRect`, `aiDeckRect` — **[I1]**.
  3. `setOuts([{ key:'trig', card:trig, faceDown:false }, { key:'eff', card:eff, faceDown:false }])` (the static
     cards become flyers in their places); `setCenterCard(null)`; `setAiCard(null)`; `await nextFrames()` — **[I2]**.
  4. Position `outRefs.trig` at `causeRect`, `outRefs.eff` at `effectRect`.
  5. `await Promise.all([leaveTrigger(causeRect, discardRect), leaveEffect(effectRect, aiDeckRect)])`:
     - `leaveTrigger` → `play('centerToDiscard', outRefs.trig, { from, to: cardAreaOf(discardRect) })` — **no jitter** (the discard is a `Pile`, not a scatter).
     - `leaveEffect` → `setOuts(eff → faceDown:true)` (flip back-up in place) → `await wait(FLIP_MS)` (420, staggers it) → `play('returnToDeck', outRefs.eff, { from, to: cardAreaOf(aiDeckRect) })`.
  6. `setOuts([])`; `setDiscard({ top: trig, count+1 })`.

**Params & timings**
| Step | Preset | Duration |
|---|---|---|
| effect draw (enlarged) | `drawToCenter` | 480 ms |
| table hold | `wait(AI_HOLD)` | 4000 ms |
| trigger → discard | `centerToDiscard` | 420 ms |
| effect flip-in-place, then | `flipCard` + `wait(FLIP_MS)` | 420 ms |
| effect → events deck | `returnToDeck` | 480 ms |

**Invariants**
- **I1** measure all four rects up front. **I2** `nextFrames` after mounting the `outs` flyers. **I3/I4** pin
  the effect flyer after `drawToCenter`. **I8** `trig`/`eff` + rects passed as args, never read from state
  after the awaits.
- Local: both leave at once (`Promise.all`), the effect **staggered** by its `wait(FLIP_MS)` so the
  trajectories separate.

**End state & cleanup**
- `outs = []`; discard top = trigger, count+1; the effect is back in the events deck (visually). `drawOne` returns `true`.

**Building blocks**
[`drawToCenter`](./reference.md#presets) · [`centerToDiscard`](./reference.md#presets) ·
[`returnToDeck`](./reference.md#presets) · `flipCard` (auto) · [`cardAreaOf`](./reference.md#card-geometry-helpers) ·
[`wait`/`nextFrames`](./reference.md#travel-and-timing-helpers).

**Live reference**
`Draw card` — draw the AI trigger.

---

## Error 503 alarm — edge glow in the table zone

**When to call**
In `drawOne`, when the revealed trigger is Error 503 (a non-AI trigger): `setAlert(drawer === 'you' ? 'self' : 'other')`;
`return false` (resolution is game logic — no fixed scenario, so the batch stops).

**Visual result**
A red glow along the table edges. You drew → a **strong** glow **under** the hand; an opponent drew → a
**weak** glow **over** the hand (non-blocking). The glow is confined to the table zone (below the tech bar),
not the whole screen.

**Elements / refs**
- `EdgeGlow` inside `glowBounds` with `insetBlockStart: barH` (`barH = barRef.offsetHeight`, measured in `useLayoutEffect`).
- **DOM order matters:** the `strong` glow is placed **before** `<Hand>` (renders under it); the `weak` glow
  **after** `<Hand>` (over it, `pointer-events: none`).
- State: `alert: 'self' | 'other' | null`.

**Sequence**
1. The trigger reveal (see single-draw) leaves the Error 503 card at the center.
2. `setAlert('self' | 'other')`; `drawOne` returns `false`.
3. Render: `<EdgeGlow visible={alert==='self'} intensity="strong" />` (before Hand) and
   `<EdgeGlow visible={alert==='other'} intensity="weak" />` (after Hand).
4. Cleared on the next `draw` / `drawBatch` / `reset` (`setAlert(null)`).

**Params & timings** — no flight; `EdgeGlow` owns its own fade. `intensity`: `strong` (self) / `weak` (other).

**Invariants**
- None of I1–I8 (no flyer). Local: **DOM order = stacking** (strong under the hand, weak over it); the glow
  is scoped to the **table zone** via `glowBounds` + `barH`, not the viewport.

**End state & cleanup**
- `alert` stays until the next draw/reset; the batch does not continue past Error 503.

**Building blocks**
`EdgeGlow` (primitive) · `barH` layout measure.

**Live reference**
`Draw card` — set "will draw" = Error 503.

---

## Deck ops — the shared wrapper (`playSequence`)

The three deck operations below (split, merge, discard→deck) are the **effect** run inside one
wrapper: `playSequence(played, fromRect, effect)` — guard `busy`; `setBusy(true)`;
`setHand(remove played uids)`; `await flyHandToCenter(cards, fromRect)` (the `playToCenter` flight,
a single `Card` or a `CardPair` for a Sudo combo); `await effect()`; `await wait(CENTER_HOLD = 420)`;
`await sendToDiscard(cards)` — the shared step (each card a separate single, landing as its
own discard entry); `setBusy(false)`. The card is picked from the `Hand` fan; a deck target (Branch)
is chosen with a `useArrow` arrow. Only the **effect** differs per recipe.

---

## Splitting the deck (Git Branch) — new deck flies out via FLIP

**When to call**
Play a Git Branch card. If `decks.length <= 1` → `playSequence([item], rect, () => splitEffect(deckId))`
directly; otherwise arm `'branch'`, aim, and `pickDeck` runs `playSequence([branch], rect, () => splitEffect(id))`.
(Branch + Sudo → `enhancedBranchEffect`, see "Discard → new deck".)

**Visual result**
The played card flies hand → center and rests; the chosen deck splits — a new deck **slides out from
the source deck's spot** to its own place; then the card scatters to the discard.

**Elements / refs**
- `pileRefs[id]` — deck cells. `flip` ref — `{ id, from: DOMRect }` staged for the FLIP. Wrapper refs: `centerRef`, `discardRef`, `playFlyerRef`.

**Sequence**
- **Effect** `splitEffect(deckId)` → `split(deckId)`, then `await wait(SPLIT_MS + 150)`.
- **`split(id)`**: `half = floor(count/2)`; measure the source `el.getBoundingClientRect()` — **[I1]**; stage
  `flip.current = { id: newId, from: sourceRect }`; `setDecks` (source count − half; append `{ id: newId, count: half }`).
- **FLIP** (`useLayoutEffect` after the deck mounts): read `flip.current`, clear it,
  `play('flyFrom', pileRefs[newId], { from: sourceRect, duration: SPLIT_MS = 520 })` — the new deck
  (already at its final spot) animates **from** the source's old rect to identity.

**Params & timings**
| Step | Preset | Duration |
|---|---|---|
| card hand → center | `playToCenter` | 480 ms |
| new deck fly-out (FLIP) | `flyFrom` | `SPLIT_MS = 520` |
| effect settle | `wait(SPLIT_MS + 150)` | 670 ms |
| card center → discard | `centerToDiscard` | 420 ms + `jitter()` |

**Invariants**
- **I1** measure the source deck rect **before** `setDecks` (in `split`). The FLIP relies on that captured rect.
- Local: **FLIP pattern** — the new deck renders at its final DOM place first; `flyFrom` animates it *from*
  the previous rect. Measure→mount→animate is split across `split()` and the `useLayoutEffect` (runs before
  paint, so no flash).

**End state & cleanup**
- Two decks (source − half, new = half); the played card scattered into the discard; `busy = false`.

**Building blocks**
[`flyFrom`](./reference.md#presets) · [`playToCenter`](./reference.md#presets) ·
[`centerToDiscard`](./reference.md#presets) · [`jitter`/`nextFrames`/`wait`](./reference.md#travel-and-timing-helpers).

**Live reference**
`Deck animations` — play Git Branch.

---

## Merging decks (+ discard) — all decks absorb into the first

**When to call**
Play Git Merge with `decks.length >= 2` → `playSequence([item], rect, () => mergeEffect(false))`. Sudo + Git
Merge → `mergeEffect(true)` (the discard flows in too).

**Visual result**
The played card flies to the center; then every other deck (and, with Sudo, the gathered discard) flies
into the **first** deck and dissolves; the decks collapse into one; the card goes to the discard.

**Elements / refs**
- `pileRefs[id]` — deck cells (`decks[0]` = target). `discardRef`, `flyerRef` (the discard flyer, when `withDiscard`).

**Sequence** `mergeEffect(withDiscard)`
1. `target = decks[0]`.
2. If `withDiscard`: `discardFrom = await gatherDiscardToFlyer()` (gather + a face-up flyer at the discard
   spot), then `setFlyer(faceDown:true)`, `await wait(TURN_MS = 460)`, `await wait(STEP_HOLD)` — flip it
   back-up before it flies in.
3. Measure `tRect = pileRefs[target.id]` — **[I1]**. For each `d of decks.slice(1)`: measure its rect once,
   `play('absorbToDeck', el, { from: r, to: tRect, duration: MERGE_MS = 520 })` (move + **fade**); collect `.finished`.
4. If `withDiscard`: `play('absorbToDeck', flyerRef, { from: discardFrom, to: tRect, duration: MERGE_MS })`; collect.
5. `await Promise.all(flights)`.
6. `total = sum(decks.count) + discardCount`; `setDecks([{ id: target.id, count: total }])`; `setFlyer(null)`.

**Params & timings**
| Step | Preset | Duration |
|---|---|---|
| card hand → center (wrapper) | `playToCenter` | 480 ms |
| discard prep flip (if Sudo) | `wait(TURN_MS)` | 460 ms |
| each deck (+ discard) → target | `absorbToDeck` | `MERGE_MS = 520` (+fade) |
| card center → discard (wrapper) | `centerToDiscard` | 420 ms + `jitter()` |

**Invariants**
- **I1** measure the target rect (and each source rect) once, before the flights. All source flights start together (`Promise.all`).
- Local: `absorbToDeck` fades opacity → the flying decks dissolve into the target.

**End state & cleanup**
- One deck with `total` count; discard emptied (if merged in); played card in the discard; `busy = false`.

**Building blocks**
[`absorbToDeck`](./reference.md#presets) · [`playToCenter`](./reference.md#presets) ·
[`centerToDiscard`](./reference.md#presets) · [`nextFrames`/`wait`](./reference.md#travel-and-timing-helpers).

**Live reference**
`Deck animations` — play Git Merge (with 2+ decks).

---

## Discard → new deck (Git Branch + Sudo) — gather, fly, flip back-up

**When to call**
Inside `enhancedBranchEffect(deckId)`: `split(deckId)` → `await wait(SPLIT_HOLD = 600)` → `await flipDiscardToNewDeck()`.

**Visual result**
After the split, the scattered discard gathers into a neat pile, flies as a face-up card to a new deck
spot, flips back-up, and the new deck appears there.

**Elements / refs**
- `discardRef` — discard spot (source). `pileRefs[newId]` — the new (initially `hidden`) deck. `flyerRef` — the single face-up → back-up flyer.

**Sequence**
1. `flipDiscardToNewDeck()`: append `{ id: newId, count, hidden: true }` (opacity 0); `await nextFrames()`;
   measure `toRect = pileRefs[newId]` rect (fallback: unhide + clear discard if missing); `await runDiscardFlight(toRect)`;
   unhide the new deck.
2. `runDiscardFlight(toRect)`:
   - `fromRect = await gatherDiscardToFlyer()`: `setDiscard(showCount:false, gathered:true)` (cards stack to
     `translate(0,0) rotate(0)`); `await wait(GATHER_MS = 360)`; `await wait(STEP_HOLD)`; measure `discardRef`
     rect; `setFlyer({ card: top, faceDown: false, at: discardRect })` — the flyer's state carries the rect it
     mounts at, so it paints on the pile from the first frame (**[I10]**); `setDiscard(cards:[])`;
     `await nextFrames()` (**[I2]**); return the rect.
   - Aim at the card area: `aspect = fromRect.height / fromRect.width`; `cardTo = { left, top, width: toRect.width,
     height: toRect.width * aspect }` — **[I6]**, inline via the measured aspect (not the shared `cardAreaOf`).
   - `play('gatherToDeck', flyerRef, { from: fromRect, to: cardTo, duration: 560 })`; await.
   - `await wait(STEP_HOLD)`; `setFlyer(faceDown:true)` (flip back-up); `await wait(TURN_MS = 460)`; `await wait(STEP_HOLD)`; `setFlyer(null)`.

**Params & timings**
| Step | Preset | Duration |
|---|---|---|
| gather the scatter | `wait(GATHER_MS)` | 360 ms |
| discard → new deck | `gatherToDeck` | 560 ms (explicit) |
| flip back-up | `wait(TURN_MS)` | 460 ms |

**Invariants**
- **I6** aim at the target's card box (here inline via the measured `aspect`, since the discard flyer's rect is known).
- Local: the new deck is mounted **hidden** (opacity 0) so its slot exists to measure/land into; unhidden only
  after the flight. `gathered:true` collapses the scatter before the flyer takes over.

**End state & cleanup**
- Discard emptied; a new draw deck (`count` = former discard size) visible at its spot; `flyer` gone.

**Building blocks**
[`gatherToDeck`](./reference.md#presets) · [`nextFrames`/`wait`](./reference.md#travel-and-timing-helpers).

**Live reference**
`Deck animations` — play Git Branch + Sudo.

---

## Taking an opponent's card — deal grid, flip the pick, settle into the hand

**When to call**
Player triggers "take a random opponent card" → `deal()`. Phases `idle → deal → resolve`.

**Visual result**
Face-down cards fan out from an origin point into a centered grid (staggered); clicking one slides it
forward and flips it face up; after a pause the chosen card flies into the player's hand while the rest
shrink back to the origin.

**Elements / refs**
- `slotRefs[i]` — the deal-grid slots (each a face-down `Card`). `handRef` — the player fan (`useHandArrival`).
- State: `phase`, `pool: PoolCard[]`, `chosen: number | null`, `dealt: boolean`, `hand`.

**Sequence**
1. `deal()`: `setPool(sampleBase(count))`; `setChosen(null)`; `setDealt(false)`; `setPhase('deal')`; then a
   **double-rAF** → `setDealt(true)` (mount slots at `ORIGIN`, then transition to the grid).
2. Slot layout is CSS-transition driven by `slotStyle(i)`:
   - `!dealt` → `transform: ORIGIN` (`translate(-50%, -CARD_H/2 - 20) scale(0.35)`), `opacity: 0`.
   - dealt, phase `deal` → grid `translate(calc(-50% + pos.x), pos.y - CARD_H/2)`; unchosen slots stagger via
     `transitionDelay: i*45ms` (while `chosen === null`).
3. `pickCard(i)` (only in `deal`, `chosen === null`): `setChosen(i)` → the chosen `Card` flips face up
   (`faceDown={chosen !== i}`) and slides forward (`scale(1.12)`, `z 40`); `window.setTimeout(() => resolve(i), REVEAL_HOLD = 820)`.
4. `resolve(i)`: measure `slotRefs[i]` rect; `arrive([{ key: uid, card: pool[i].card, from: rect }], hand.length)` (the `useHandArrival` hook
   flies it into the fan); `setPhase('resolve')`. In `resolve`, `slotStyle` sends the chosen slot to `opacity:0`
   (the hook owns the flight) and the rest back to `ORIGIN` (`opacity:0`).
5. `useHandArrival` `onLanded(gap, landed)`: splice into `hand` at `gap`; `setPhase('idle')`; clear `chosen/dealt/pool`.

**Params & timings**
| Step | Mechanism | Duration |
|---|---|---|
| deal-in / return | CSS transition on the slot (`ORIGIN ↔ grid`), staggered `i*45ms` | (CSS) |
| flip the pick | `Card` `flipCard` on `faceDown` change | 420 ms |
| reveal hold before flight | `setTimeout(REVEAL_HOLD)` | 820 ms |
| chosen → hand | `useHandArrival` | `FLIGHT_MS = 480` |

**Invariants**
- The deal / reveal / return are **CSS transitions** on the slots (not `play()` presets); the flip is the
  `Card`'s own `flipCard`. Only the final hand insert uses a module (`useHandArrival`).
- Local: the double-rAF (like **I2**) lets slots paint at `ORIGIN` before transitioning to the grid; the
  reveal→flight gap is `REVEAL_HOLD`.

**End state & cleanup**
- Chosen card inserted into the hand at `gap`; pool cleared; `phase` back to `idle` (via the hook callback).

**Building blocks**
[`useHandArrival`](./reference.md#hand-arrival--cards-arrive-in-the-hand) · `Card` `flipCard` (auto). Grid geometry: `gridPositions`
(uses `DEAL_CARD_W`, `CARD_H`, `GAP_X/Y`, `COLS_MAX`); the `ORIGIN` transform.

**Live reference**
`Random opponent card` — `apps/playground/stories/interactive/PickOpponentCardStory.tsx`.

---

## Canonical hand — pick up a card and drag it (play / reorder), with a hover zoom

**When to call**
The hand is interactive when `onPlay` or `onReorder` is supplied (`dragEnabled`). A press arms the gesture:
movement past the threshold turns it into a drag, a release before it is a click (`onCardClick`, so
click-to-play arrow flows coexist with drag).

**Visual result**
The pressed card lifts onto a flyer that follows the cursor. Dragged inside the hand band it reorders
(neighbours open a gap); dragged out onto the table it plays (the consumer accepts, or the card glides back).
Hovering (not dragging) lifts the card and parts its neighbours, and a separate enlarged preview rises above
the hand.

**Elements / refs**
- `handRef` — the fan container. `flyerRef` — the single fixed drag flyer. `grab` ref `{fracX, fracY}`,
  `cursor` ref.
- State: `hoveredUid`, `drag: {uid, card} | null`, `preview: number | null` (reorder slot), `zoomView`,
  `zoomShown`.
- Geometry from `table/Hand/fan` (`slotPlacement`, `handStep`, `CARD_W`).

**Sequence**
1. `onSlotDown(i, el, e)`: without `dragEnabled` → `onCardClick` immediately. Else `e.preventDefault()` and arm
   window `mousemove`/`mouseup`: move past `DRAG_THRESHOLD` → `beginDrag(i, downX, downY)`; release before →
   `onCardClick` (a click).
2. `beginDrag`: grab point from where the card is **drawn**, not from its base slot — `slotPlacement(i, n)` less
   `HOVER_LIFT`, since the card under the cursor is the hovered one and hover draws it that much higher.
   Measured from the base, the card drops by exactly that the instant it leaves the fan. The grab fractions
   double as the deflection the tilt engine was running on (`frac − 0.5`: the same cursor over the same card
   box, one expressed as `0…1` and the other as `−0.5…0.5`), so they go into `drag.tiltFrom` and the flyer's
   face straightens out of the tilt it had instead of being born flat. Then `setHoveredUid(null)`; `setDrag`;
   `setPreview(inBand(downY) ? i : null)`.
3. Drag effect (a **layout** effect keyed on `drag` — **I10**: the flyer mounts with no `left/top` of its own,
   and a passive effect would place it only after the browser was free to paint that frame): `place()` sets the
   flyer `left/top` to `cursor - frac*CARD_W/H` on each `mousemove`; `preview = inBand ? slotUnderCursor(x) :
   null`. The lifted card renders `null` in the fan; the rest lay out with a gap at `preview`.
4. On `mouseup`: inBand → `settleInto(slotUnderCursor(x), () => onReorder(uid, to))`; out of band →
   `onPlay(uid, {x, y, rect})` — `true` = played (gone), else `settleInto(originalIndex)` (never vanishes).
5. `settleInto(target, commit?)`: hold the gap at `target`; take the shape of the landing from the fan —
   `insertPath(from, to, target, n)` (reference), the card coming into its slot **round from the left** along
   one curve with no corner in it. Play those positions as WAAPI keyframes over `SETTLE_MS` at `SETTLE_EASE`,
   turning to `rotate(base.rotate)` along the way, `fill: 'forwards'`. At `SWITCH_AT` of that clock — the apex
   of the sweep — drop the flyer's `zIndex` to the slot's `base.z`, so it goes UNDER its right neighbour where
   the two overlap least and while it is moving. After `SETTLE_MS` run `commit`, clear `drag`/`preview`.
6. Hover (no drag, `gapAt == null`): hovered slot `rotate → 0`, `y -= HOVER_LIFT`; neighbours `x += dir *
   NEIGHBOR_PUSH / distance`. No in-place scale, no top-layer jump.
7. Zoom preview (layout effect on `hoveredUid`): skipped when `faceDown || drag || !hoveredUid`. Else size a card
   to the free band above the hand (`h = clamp(handTop - ZOOM_TOP_AIR - ZOOM_GAP, ZOOM_MIN_H, ZOOM_MAX_H)`,
   `w = h * CARD_WH`), center it, `top = handTop - ZOOM_GAP - h`; one `requestAnimationFrame` → `zoomShown = true`.

**Params & timings**
| Thing | Value |
|---|---|
| drag threshold | `DRAG_THRESHOLD = 6` px |
| hover lift / neighbour push | `HOVER_LIFT = 28` / `NEIGHBOR_PUSH = 36` px |
| reorder / return landing | `SETTLE_MS = 460` ms at `SETTLE_EASE` (= `--ease-soft`), along `insertPath`; layer switch at `SWITCH_AT = 0.35` |
| band tolerance above hand | `BAND_PAD = 32` px |
| card width | `CARD_W = 150` (`CARD_WH = 368 / 515`) |
| zoom clamp / air / gap | `ZOOM_MIN_H = 240` … `ZOOM_MAX_H = 460`; `ZOOM_TOP_AIR = 32`, `ZOOM_GAP = 44` |
| zoom fade / rise | opacity 260 ms; `@keyframes zoom-rise` 260 ms (appear only) |
| disabled dim | `.faceWrap` filter 380 ms (`grayscale(0.7) brightness(0.55)`) |
| z-index | flyer 1200, zoom 1100 |

**Invariants**
- **The flyer's `transform-origin` is `bottom center`, matching `.slot`** — the settle rotation pivots exactly
  where the resting card does; otherwise the card micro-jumps on the last frame (worst off-centre).
- Hover keyed by **uid**, not index — a removed card does not hand its hover to whatever slid into its index.
- Pick-up geometry comes from where the card is **drawn** (hover lift included), so it does not move on being
  grabbed; the tilt it carried goes with it and eases out, because the flyer's face is a NEW instance and a new
  instance is born flat.
- A card enters the fan **from the left** and changes layer at the apex of that sweep — see `insertPath`
  (reference) for why an instant switch reads as a jump.
- A rejected play returns via `settleInto` — the card never disappears into nothing.

**End state & cleanup**
- Reorder → `onReorder(uid, toIndex)` (local, never networked). Play → the consumer owns the card. Rejected →
  back in its original slot. `drag`/`preview` cleared; hover suppressed during drag.

**Building blocks**
`table/Hand/fan` (`slotPlacement`, `handStep`, `insertPath`) · `useCardTilt`'s `from` (the tilt handover onto the
flyer's face) · `@keyframes zoom-rise` (Hand.module.css). No `play()` preset — the landing is WAAPI keyframes
built from `insertPath`, and the drag itself is inline `left/top` on the flyer.

**Live reference**
`Hand` — `apps/playground/stories/HandStory/HandStory.tsx` (and every interactive story that renders a hand).

---

## Error 503 (player turn) — draw, alarm, defend by drag, or be eliminated

**When to call**
From TurnDock `'draw'` → `drawFlow()`. Guard `if (busy || centerCard || eliminated) return`. The branch is
decided by which cards sit where (tech-bar toggles: Debugger in hand; Release / Release+Code Review / Monitoring
in the zone) — not by hard-coded per-flow cases.

**Visual result**
Error 503 flies from the deck to the centre and flips up for everyone, with a red edge glow from the table
edges. Then either Monitoring auto-neutralises it (brief centre → discard, no glow); or the player drags the
Debugger (hand) or a Release + its Code Review (zone) onto the 503 to cover it, and both go to the discard; or,
with no defence / a PASS, the hand (and on a PASS the zone too) sweeps to the centre and to the discard, the
player is out, and a full-screen elimination video plays for everyone.

**Elements / refs**
- `deckRef`, `centerRef`, `discardRef`, `flyerRef` (draw flyer), `dragRef` (defence flyer), `handWrapRef`,
  `relSlotRefs[key]`, `outRefs[key]` (discard-bound flyers), `barRef`.
- State: `handItems`, `rel: Partial<Record<SlotKey, {main, aux?}>>`, `centerCard`, `flyer`, `outs`, `discard`,
  `drag`, `alert`, `pending`, `eliminated`, `gif/gifOut`, `dock`, `busy`.

**Sequence**
1. `drawFlow()`: `setFlyer(503, faceDown)`, `nextFrames`, position at `cardAreaOf(deckRect)` →
   `play('drawToCenter', {from, to: centerRect})`; on finish cancel + pin (**I3/I4**); `wait(180)` → flip up;
   `wait(560)` → `setCenterCard(503)`, clear flyer.
2. **Monitoring present** → `setDock('push')`, `wait(750)`, `setCenterCard(null)`, `sweep([503], gather=false)`;
   no glow, Monitoring stays.
3. **No Monitoring** → `setAlert(true)`, `setPending(true)`, `setDock('reaction')`. `canDefend = Debugger in hand
   || rel.frontend || rel.backend`. If not → `wait(2500)` → `eliminate(false)`. Else hand off to the player.
4. **Defence drag** (`beginDrag`): capture the grab fraction, source centre and `startW`; one rAF loop eases
   `startW → CARD_W` over `ResizeMs = 200` while keeping the grab point under the cursor. On `mouseup`, hit-test
   the centre with `DROP_PAD`: inside → `resolveDefense`, outside → `returnDrag`. The Debugger uses the canonical
   `Hand.onPlay` (`handPlay`), accepted only for the Debugger dropped on the 503.
5. `resolveDefense`: cover the 503 (transition `left/top/width` 240 ms to `centerRect`/`CARD_W`), `wait(300)`;
   read each card's actual rect via `[data-main]`/`[data-aux]` anchors (nothing rotated → bbox = card, **no
   teleport**); remove the played card from its source; `sweep(items, gather=false)` in stack order **503, Code
   Review, Release**; `setDock('push')`.
6. `returnDrag`: transition back to the source slot (240 ms), shrink to `startW`, `wait(260)`, clear drag.
7. `eliminate(includeRelease)`: collect the hand's per-slot rects (`handSlotRects()`) + (on PASS) the release
   slots; clear hand/zone/centre; `sweep(items, gather=true)`; `setEliminated(true)`, `setDock('waiting')`;
   `playEliminationGif()`.
8. `sweep(items, gather)`: mount `outs`, position at source rects; if `gather` glide all to `centerRect` (300 ms)
   + `wait(560)`; then per card `play('centerToDiscard', toDiscardParams(from, cardAreaOf(discardRect),
   jitter()))` (**I7**), append to `discard` with the same scatter.
9. Elimination video: `playEliminationGif` picks a random bundled `./eliminate/*.mp4` and loops; `onGifEnded`
   replays until `ELIM_MIN_MS`, then fades out (360 ms) and resolves.

**Params & timings**
| Step | Duration |
|---|---|
| draw flip / hold | `wait(180)`, then `wait(560)` |
| Monitoring auto-neutralise hold | `wait(750)` |
| defenceless beat before KO | `wait(2500)` |
| drag resize ease | `ResizeMs = 200` (cubic) |
| cover / return glide | 240 ms + `wait(300)` / `wait(260)` |
| gather glide (elimination) | 300 ms + `wait(560)` |
| discard flight | `play('centerToDiscard')` (move 420) |
| elimination video | ≥ `ELIM_MIN_MS = 5000`, fade 360 ms |
| drop forgiveness | `DROP_PAD = 48` px |

**Invariants**
- **Nothing rotates at the centre** (flat cover, flat `RelStack`): a rotated pair's bbox ≠ the card, which
  teleports the cards on the discard hand-off. Flat → bbox = card → the flight continues from where they lie.
- Defence is a **drag with invisible hit areas** (no drop-target hints), hit-tested with `DROP_PAD` forgiveness —
  never a click/arrow.
- A Release drags **with its attached Code Review** (bound by position via `[data-main]`/`[data-aux]`, not
  "grouped").
- The edge glow lives in `.glowBounds`, offset by the measured tech-bar height (screen edge ≠ table edge).
- **I3/I4** on the draw flyer; **I7** for every scattered card.

**End state & cleanup**
- Defended → 503 + defence in the discard (order 503, CR, Release), `dock: push`. Eliminated → hand/zone in the
  discard, `eliminated: true`, `dock: waiting`, video played for all. `reset`/toggle → `applyScene`.

**Building blocks**
[`play('drawToCenter')`](./reference.md) · [`play('centerToDiscard')`](./reference.md) ·
`jitter`/`toDiscardParams`/`restTransform` · `EdgeGlow` · canonical `Hand` (`onPlay`).

**Live reference**
`Error 503` — `apps/playground/stories/interactive/Error503Story.tsx`.

---

## AI effects — trigger, pull the event, resolve by effect

**When to call**
The base deck is clicked (or the draw button) → `start()`. Guard `if (busy) return`. The chosen AI card (tech-bar
selector) and the zone/discard seeding decide the branch.

**Visual result**
The AI trigger flies from the base deck to a cause slot left of centre and flips up; the chosen AI card is pulled
from the events deck to the centre (larger) and flips up; after a table hold it resolves by effect — into the
release zone, back to the AI deck, to the discard, into the hand, or a full sub-scene (Inside choice, Good/Bad
Vibe).

**Elements / refs**
- `baseDeckRef`, `aiDeckRef`, `causeRef`, `effectRef` (centre), `discardRef`, `flyerRef`, `outRefs[key]`,
  `releaseSlotRefs[key]` (via `ReleaseZone.slotRef`), `handRef`.
- State: `release`, `hand`, `flyer`, `trigger`, `aiCard`, `outs`, `discard`, `alert`,
  `insideCandidates/insidePickIdx/insideRevealed`, `handPickMode`, `busy`. Refs: `turnInterrupted`, `halted`,
  Inside/hand-pick resolvers.

**Sequence**
1. `pullTo(card, fromRef, toRef)`: `setFlyer(faceDown)`, `nextFrames`, position at `cardAreaOf(fromCell)` →
   `play('drawToCenter', {from, to})`, pin (**I3/I4**); `wait(160)` → flip up; `wait(FLIP_MS + 140)`.
2. `start`: `pullTo(trigger → cause)` → `setTrigger`; `pullTo(chosen → effect)` → `setAiCard`; `dispatch`; if not
   `halted` → `setBusy(false)`.
3. `dispatch`: `ai-error-503` → `raise503()` (glow + halt); `ai-bad-vibe-coding` → `badVibe`;
   `ai-good-vibe-coding` → `goodVibe`; else `resolveEvent`.
4. `resolveEvent`: `wait(Hallucination ? HALLUCINATION_HOLD : TABLE_HOLD)`; Hallucination sets `turnInterrupted`;
   `resolveGeneric`.
5. `resolveGeneric`: compute placeable (Release/Monitoring into an empty matching slot), crush (matching release
   present), Inside releases (captured before the trigger lands); mount `outs` (trig, eff, +crushed) at their
   rects; in parallel — `triggerToDiscard` (`centerToDiscard` + `jitter`), and either `placeIntoSlot`
   (`playToReleaseZone`, card stays) or `returnAiToDeck` (flip back-up + `returnToDeck`), plus `destroyRelease`
   for a crush (AI release → flip + `returnToDeck`; ordinary release → `centerToDiscard`); append the trigger to
   the discard. Then Inside: single → `insideGrab` (discard → centre → hand); several → `insideChoose`.
6. `insideChoose`: remove candidates from the discard; render a hidden pick row; fly each from the discard to its
   row cell (`drawToCenter`, scaling up to hand-card width); reveal the row; await `ConfirmAction`; chosen →
   `useHandArrival` into the hand; the rest fly back to the discard (`centerToDiscard`, own scatter).
7. `goodVibe`: `resolveEvent` (Good Vibe → AI deck, trigger → discard); reset `turnInterrupted`; draw 2 per the
   makeup selector — plain card via `drawToHand` (`pullTo` → `useHandArrival`), AI trigger via
   `runAiTrigger(Hallucination)` (sets `turnInterrupted`), 503 via `draw503ToHalt`; break on `turnInterrupted ||
   halted` (Hallucination's interrupt skips the 2nd draw).
8. `badVibe`: `setHandPickMode(true)` and await a hand click (`Hand.onCardClick`); `resolveGeneric` (Bad Vibe →
   AI deck, trigger → discard, **no extra hold** — the pick wait already held it); the chosen card flies from its
   slot to the centre (`drawToCenter`), holds `SHOW_HOLD`, then to the discard (`centerToDiscard`).

**Params & timings**
| Thing | Value |
|---|---|
| flip | `FLIP_MS = 420` ms |
| table hold | `TABLE_HOLD = 2600` ms |
| Hallucination hold | `HALLUCINATION_HOLD = 5200` ms (×2) |
| shown-to-all hold | `SHOW_HOLD = 1500` ms |
| flights | `drawToCenter`, `playToReleaseZone`, `returnToDeck`, `centerToDiscard` |

**Invariants**
- **An AI event card never reaches the common discard** — it returns to the AI deck (`returnToDeck`). Only the
  trigger and a destroyed **ordinary** release go to the common discard.
- Hallucination raises a **real turn-interrupt flag** (`turnInterrupted`) that skips Good Vibe's second draw —
  not just a comment.
- Hand hover is muted during animations (`pointerEvents: busy && !handPickMode ? 'none'`), like the Git-card
  stories.
- **I3/I4** on every flyer; **I7** for scattered discards; Inside removes/returns candidates **by reference** so
  the trigger append does not shift them.

**End state & cleanup**
- Placed → the card stays in the zone slot. Crush → slot cleared, card to the AI deck / discard. Inside → release
  in the hand, the rest back in the discard. 503 → glow + `halted` (reset to continue). `reset` rebuilds from the
  toggles.

**Building blocks**
[`play('drawToCenter' / 'playToReleaseZone' / 'returnToDeck' / 'centerToDiscard')`](./reference.md) ·
`useHandArrival` · `ConfirmAction` · `ReleaseZone.slotRef` · `jitter`/`toDiscardParams`.

**Live reference**
`AI cards` — `apps/playground/stories/interactive/AiCardsStory.tsx`.

---

## Take a specific card — name it, then it flies out of the opponent's hand

**When to call**
The player names a card to demand from an opponent (`requestCard`) → `start()`, then `pickWanted(card)`. Phases
`idle → choose → picked → (reveal | miss)`. The outcome is forced in the showcase by the `inHand` toggle.

**Visual result**
A catalog grid (base cards, no triggers, face-up) appears at the centre and the opponent's face-down fan slides
in from the top. Clicking a grid card holds it (the rest leave); then either that card flies out of the opponent
fan to the centre, flips face up and drops into your hand (hit), or the fan shakes with a "not in hand" note and
leaves (miss).

**Elements / refs**
- `rootRef` (stage — the centre is measured against it, not `window`: the playground has a sidebar), `handRef`
  (your fan), `fanRef` (opponent fan wrapper — slots are its inner children), `revealRef` (the flying card).
- State: `phase`, `wanted`, `oppHand: PoolCard[]`, `handIn` (fan slide toggle), `chosenUid`, `reveal`,
  `centered`, `flipped`, `hand`.

**Sequence**
1. `start()`: `setOppHand(sampleBase(OPP_HAND))`; `setPhase('choose')`; `handIn=false` → double-rAF → `handIn=true`
   (the fan slides in).
2. `pickWanted(card)` (only in `choose`): `setWanted`; `setPhase('picked')`; `later(() => resolve(card),
   PICK_BEAT)`.
3. `resolve(card)`: **miss** (`!inHand`) → `setPhase('miss')`, `later(setHandIn(false), MISS_HOLD)`,
   `later(backToIdle, MISS_HOLD + 560)`. **hit** → plant the wanted card into a random opponent slot; read that
   slot's rect (**I1**); compute the delta to the **stage centre** (`cx/cy` from `rootRef`, not `window`);
   `chosenUid = that slot` (its face renders `null`, so only the flyer shows the card); `handIn=false` (the rest
   of the fan slides up and off); build `reveal` (`from` rect + `to` transform: translate to centre,
   `scale(REVEAL_W / r.width)`, `rotate(0)`); double-rAF → `centered=true` (a CSS transition drives the flight).
4. `onRevealEnd` (transform end, `centered && !flipped`): `flipped=true` (flip face up), `later(fall,
   REVEAL_HOLD)`.
5. `fall()`: measure the reveal rect; `arrive([{ key: uid, card, from: rect }], hand.length)` — the shared `useHandArrival` flies it into
   the fan; `onLanded` splices it into `hand` and `backToIdle()`.

**Params & timings**
| Step | Value |
|---|---|
| chosen holds / others leave | `PICK_BEAT = 620` ms |
| reveal centre width | `REVEAL_W = 220` px |
| centre hold before the drop | `REVEAL_HOLD = 820` ms |
| miss shake + note | `MISS_HOLD = 1620` ms (+560 to idle) |
| opponent fan / grid width | `OPP_HAND = 6`, `GRID_W = 100` |
| final drop | `useHandArrival` (`FLIGHT_MS = 480`) |

**Invariants**
- The centre is measured against the **stage** (`rootRef`), not `window` — the playground sidebar offsets the
  viewport centre.
- The chosen slot's face renders `null` while the flyer carries it, so the card is never shown twice.
- The flight is a **CSS transition** on the reveal node (not a `play()` preset); only the final hand-insert is a
  module.

**End state & cleanup**
- Hit → the card is in your hand, scene back to `idle`. Miss → nothing taken, back to `idle`. `restart` rebuilds
  the hand.

**Building blocks**
`useHandArrival` · `Hand` (`faceDown`, `renderFace`) · CSS transitions on `.reveal` / `.topHand`.

**Live reference**
`Specific opponent card` — `apps/playground/stories/interactive/PickSpecificCardStory.tsx`.

---

## Opponent takes your card — the victim's view (a card leaves your hand)

**When to call**
Mirror of the above, from the target's side (`giveCard`): the opponent names a card and it leaves YOUR hand.
`start()` → `pickWanted(card)`. Phases `idle → choose → picked → (take | miss)`; stages `from → center → up`.

**Visual result**
The opponent's broadcast catalog grid and their face-down fan slide in from the top. The picked card holds; then,
if you hold it, that card lifts out of your hand, flies to the centre, flips **face-down** (now theirs) and tucks
up behind the opponent fan; else a "you don't have that card" note shows and nothing leaves.

**Elements / refs**
- `rootRef` (stage), `handRef` (your fan — slots are inner children), `fanRef` (opponent fan — the take lands at
  its centre).
- State: `phase`, `wanted`, `oppHand`, `handIn`, `hand`, `take: {card, from, center, up}`,
  `stage: 'from' | 'center' | 'up'`, `flipped`.

**Sequence**
1. `start()` / `pickWanted(card)` — as the mirror (the opponent fan slides in; the pick holds `PICK_BEAT`).
2. `resolve(card)`: find the card in YOUR hand by id. **miss** (`< 0`) → `setPhase('miss')`, `later(backToIdle,
   MISS_HOLD)`. **hit** → read the source slot rect; compute two transforms — `center` (to the stage centre,
   `scale(REVEAL_W / r.width)`, `rotate(0)`) and `up` (to the opponent-fan centre, `scale(1)`, `rotate(180)`);
   remove the card from `hand` (the fan closes the gap); `stage='from'` → double-rAF → `stage='center'`.
3. `onTakeEnd` (transform end): `center && !flipped` → `flipped=true` (flip **face-down** — now the opponent's
   hidden card), `later(setStage('up'), CENTER_HOLD)`; `stage==='up'` → append the card to `oppHand`, clear
   `take`, `later(setHandIn(false), 640)`, `later(backToIdle, 1200)`.

**Params & timings**
| Step | Value |
|---|---|
| chosen holds / others leave | `PICK_BEAT = 620` ms |
| centre width | `REVEAL_W = 220` px |
| centre hold before flying up | `CENTER_HOLD = 820` ms |
| miss note | `MISS_HOLD = 1620` ms |
| fan leaves after landing | `later(…, 640)` then `backToIdle` at `1200` ms |

**Invariants**
- The taken card ends **face-down**, `rotate(180)` — it becomes the opponent's hidden card, matching their fan.
- The centre is measured against the **stage**, not `window` (**I1** + sidebar).
- Two-hop flight (`from → center → up`) via **CSS transitions**; `zIndex` drops to 30 on the way up so it tucks
  behind the opponent fan. No `useHandArrival` — the card leaves the hand, it does not settle into one.

**End state & cleanup**
- Hit → the card is gone from your hand and shown joining the opponent fan; back to `idle`. Miss → nothing leaves.

**Building blocks**
`Hand` (`faceDown`, `renderFace`) · CSS transitions on `.take` / `.topHand`.

**Live reference**
`Opponent takes your card` — `apps/playground/stories/interactive/OpponentTakesCardStory.tsx`.

---

## Git Cherry-pick — choose a card out of the whole discard

> **Status: prototype.** The rules-complete resolution is pending the #61 open-questions rework (deck splitting,
> sudo-to-top-of-deck, empty-discard handling). This recipe transcribes the current showcase.

**When to call**
Play Cherry-pick → `deal()`. Phases `idle → deal → choose → resolve → done`. base: 1 card → hand; sudo: 2 cards →
one to hand, the other onto the top of the draw deck (face-down; the first deck if several). Triggers are
unpickable in base; in sudo a trigger can only be the deck card (a non-trigger always takes the hand slot).

**Visual result**
The discard deals out of its pile into a large, readable selection grid (staggered); you click your pick(s). The
chosen card flies to the centre, enlarges, holds, then drops into your hand; a sudo second card flips face-down
and flies onto the draw deck; the unpicked cards return to the pile in their original order (no reshuffle).

**Elements / refs**
- `pileRef` (discard), `deckRef` (draw deck), grid slot refs, `handRef` (`useHandArrival`).
- State: `phase`, the discard pool, picks, `deckCount`, the size toggle `SIZES = [8, 54]` (no-scroll vs scroll).

**Sequence**
1. `deal()`: measure the pile rect (**I1**); `setPhase('deal')`; deal each discard card to its grid slot, staggered
   `DEAL_STEP` (capped at `STAGGER_CAP`), `DEAL_DUR` each; → `setPhase('choose')`.
2. Pick (base 1 / sudo 2) under the trigger rule above.
3. `resolve` (`setPhase('resolve')`): the hand card flies to the centre (`REVEAL_W`, `REVEAL_DUR`), holds
   `REVEAL_HOLD`, then `useHandArrival` into the fan; a sudo deck card `flipCard` face-down (`FLIP_DUR`), holds
   `DECK_HOLD`, then `play('returnToDeck', {from, to: deckRect})` (`DECK_DUR`); the rest return to the pile via
   `play('centerToDiscard', toDiscardParams(from, pileRect, scatterAt(...), !visible))`, staggered `RETURN_STEP`
   (`RETURN_DUR`), keeping order. → `setPhase('done')`.

**Params & timings**
| Step | Value |
|---|---|
| deal out / stagger | `DEAL_DUR = 360`, `DEAL_STEP = 16` (cap `STAGGER_CAP = 40`) |
| return to pile / stagger | `RETURN_DUR = 420`, `RETURN_STEP = 14` |
| flip before deck flight / hold | `FLIP_DUR = 420`, `DECK_HOLD = 360` |
| deck flight | `DECK_DUR = 480` (`returnToDeck`) |
| reveal → hand | `REVEAL_W = 220`, `REVEAL_DUR = 460`, `REVEAL_HOLD = 560` |
| grid / pile width | `GRID_W = 150`, `PILE_W = 132` |

**Invariants**
- Extracting cards **must not reshuffle** the discard — the rest keep their order (`scatterAt` is deterministic by
  card key, **I7**); `HEAP_SHOW` bounds how many pile cards render.
- **I1 / I3 / I4** on every flight.

**Building blocks**
`play('returnToDeck' / 'centerToDiscard')` · `scatterAt` / `restTransform` / `toDiscardParams` / `HEAP_SHOW` ·
`useHandArrival` · `Card` `flipCard`.

**Live reference**
`Git cards` → Cherry-pick — `apps/playground/stories/interactive/GitCards/CherryPick.tsx`.

---

## Git Rebase — look at the top 3 of a deck and reorder them secretly

> **Status: prototype.** Pending the #61 rework (per-player deck knowledge, open question 9).

**When to call**
Play Rebase → phases `idle → pick → deal → order → resolve → done`. base: one deck (with several, first `pick`
which). sudo: every draw deck at once (one row of 3 per deck, sharing one 1-2-3 numbering; 1 = the new top).

**Visual result**
The top 3 cards fly out of the deck into a numbered reorder row; you reorder them (full size — the area scrolls
rather than shrinking); then they flip face-down and fly back onto the deck in the chosen order.

**Elements / refs**
- Deck pile refs, reorder-row slot refs. State: `phase`, per-deck rows, the chosen order, `deckCount`.

**Sequence**
1. `pick` (only with several decks) → choose the deck. `deal`: cards fly out `DEAL_DUR`, staggered `DEAL_STEP`,
   settle `DEAL_HOLD` → `order` (interactive).
2. `order`: reorder the row (rows numbered 1-3 on top).
3. `resolve`: `flipCard` face-down (`FLIP_DUR`), hold `FLIP_HOLD`, then `play('returnToDeck', {from, to:
   deckCenter, duration: BACK_DUR})`, staggered `BACK_STEP` → `done`.

**Params & timings**
| Step | Value |
|---|---|
| deal out / stagger / settle | `DEAL_DUR = 520`, `DEAL_STEP = 80`, `DEAL_HOLD = 200` |
| flip before flying back / hold | `FLIP_DUR = 420`, `FLIP_HOLD = 260` |
| back to deck / stagger | `BACK_DUR = 600`, `BACK_STEP = 90` |
| geometry | `REORDER_W = 150`, `GAP = 30`, `ROWS_GAP = 24`, `CARD_RATIO = 1.4` |

**Invariants**
- The reorder is **secret** (deck knowledge is not modelled — #61 open question 9); the cards fly back face-down.
- **I1 / I3 / I4** on every flight.

**Building blocks**
`play('returnToDeck')` · `Card` `flipCard` · a CSS-transition reorder row.

**Live reference**
`Git cards` → Rebase — `apps/playground/stories/interactive/GitCards/Rebase.tsx`.

---

## System Upgrade — every other player discards one card to the centre

> **Status: prototype.** Pending the #61 rework.

**When to call**
Play System Upgrade → phases `idle → throw → (hold | choose) → resolve → done`. base: the thrown cards go to the
discard. sudo: the player first takes one thrown card into their hand, the rest go to the discard.

**Visual result**
Each opponent throws one card from their seat to the centre (staggered, growing from small to full size). base:
after a hold they all sweep to the discard. sudo: the player picks one — it reveals at the centre, enlarges,
holds, drops into the hand — and the rest go to the discard.

**Elements / refs**
- Seat refs (throw sources), `centerRef`, `pileRef` (discard), `handRef` (`useHandArrival`).
- State: `phase`, opponent count `OPP_COUNTS`, the thrown cards, `sudo`.

**Sequence**
1. `throw`: each opponent's card flies seat → centre, `THROW_DUR`, staggered `THROW_STEP`, scaling `THROW_SCALE →
   1`.
2. base → `hold` (`HOLD_MS`); sudo → `choose`.
3. `resolve`: a sudo pick reveals to the centre (`REVEAL_W`, `REVEAL_DUR`), holds `REVEAL_HOLD`, `useHandArrival`
   into the fan; the rest go to the discard via `play('centerToDiscard', toDiscardParams(from, to, scatterAt(...),
   !visible))`, staggered `CLEAR_STEP` (`RETURN_DUR`) → `done`.

**Params & timings**
| Step | Value |
|---|---|
| throw to centre / stagger / scale | `THROW_DUR = 460`, `THROW_STEP = 260`, `THROW_SCALE = 0.42` |
| base hold before discard | `HOLD_MS = 2500` |
| centre → discard / stagger | `RETURN_DUR = 420`, `CLEAR_STEP = 90` |
| sudo reveal → hand | `REVEAL_W = 220`, `REVEAL_DUR = 460`, `REVEAL_HOLD = 560` |
| widths | `CENTER_W = 150`, `PILE_W = 132` |

**Invariants**
- **I1 / I3 / I4** on every flight; `scatterAt` / `HEAP_SHOW` for the discard (**I7**).

**Building blocks**
`play('centerToDiscard')` · `scatterAt` / `restTransform` / `toDiscardParams` / `HEAP_SHOW` · `useHandArrival`.

**Live reference**
`Git cards` → System Upgrade — `apps/playground/stories/interactive/GitCards/SystemUpgrade.tsx`.

---

## Hand limit — discard the hand down to the limit

**When to call.** End of turn, the hand is over the limit. Guard: a pull-out is accepted only while
`hand.length > limit`; at or under it `Hand` rejects the drop and glides the card back.

**Visual result.** Discarded cards do **not** trickle into the heap one at a time. They build an open
**grid** at the centre — everyone reads the whole cost of the turn — and only when the last excess card
lands does the finished grid leave for the discard.

**Elements / refs.** The `Hand` fan; a grid of cells at the centre (`cellRefs`); the `Pile` discard
(`boxRef`); a flight overlay per card in transit.

**Sequence.**
1. The excess is known before anything moves (`hand.length − limit`), so the **grid shape is chosen
   upfront** — 1–4 one row, 5–6 two rows of 3, 7–8 two rows of 4, 9–10 two rows of 5, past 10 three
   rows. Every card therefore flies straight to **its own cell**, never to a growing pile.
2. Each pull-out: claim the next free cell, remove the card from the hand, `playToCenter` from the fan
   slot's card box into that cell. The flight entry carries the source rect (`at`) so the flyer paints
   on the card from its first frame — **[I10]**. Several run **concurrently** — a flight must never
   gate the next drag (discarding is "think, then dump fast").
3. **A card laid out is not yet discarded — it can be carried back.** Press one in the grid and it
   comes off onto a flyer at the cursor: the cell is released back into the free set and the card
   leaves `placed`, so the grid does not hold a hole where it was. While it travels the hand parts
   **at the pointer** — `gapAt` driven from `slotAt(clientX)` whenever the cursor is over the band
   (`BAND_PAD` above the fan, the same tolerance the hand itself uses), `gapSize` 1 — and the hand
   is told `carrying`, so it offers nothing else: no lift, no zoom preview.
   - Released over the band → `arrive([…], hand.length, slot)` with the slot the pointer named
     (**not** the middle — see the arrivals recipe). Handing the gap from the scene to the step is
     the same slot, so nothing shifts as one takes over from the other.
   - Released anywhere else → `playToCenter` back into the cell it came from. It goes home rather
     than snapping, because snapping reads as the drag having failed.
4. The grid is held open (`GRID_HOLD`).
5. The whole grid leaves through **`useDiscardExit`**: one entry per placed card, `node` = its cell
   element, `layer` = its slot, `delay` = `slot × CLEAR_STEP` — one by one, but as one movement.

**Params & timings.** grid card width 150 / 132 / 116 px by row count · `GRID_HOLD` 1500 ms ·
`CLEAR_STEP` 90 ms · flights `playToCenter` 480 ms · carry-back band `BAND_PAD` 32 px.

**Invariants.** **I1** measure the cell before it unmounts · **I8** the card, its slot and its source
rect come in as arguments (the sequence spans several awaits) — and the carry-back's drop slot is read
through a **ref**, since its handlers are the closure they began with · **I10** every concurrent flyer
carries its own mount rect · a `runId` guard drops flights from a previous deal.

**End state & cleanup.** Cells released, `placed` cleared, grid size back to 0, the cards lie in the
heap. A carried-back card is in the hand again and its cell is free — the cells are tracked as a
claimed SET rather than a count, or a card returning to the grid would take the next free cell instead
of the one it left.

**Live reference.** `Hand limit` (Cards group).

---

## Defending a release — the whole turn, play through defence

**When to call.** Turn start with a Release in hand. The turn is a chain: play → cost → attack window
→ answer.

**Visual result.** A Release pulled from the fan stands at the centre and does **not** land — by the
rules it costs one card, and the cost is shown open beside it. Only then does the Release settle into
its zone slot and the opponents' attack window opens.

**Elements / refs.** Stage / cost / centre / sudo / cover slots around the table centre (each
axis-aligned, the tilt on an inner `.pose` element so the slot rect stays the true card box); the
`ReleaseZone` (`slotRef`); opponent `Seat`s; the `Pile` discard; the `Hand`.

**Sequence.**
1. **Play** — the Release flies to the stage slot and waits. A press on nothing valid takes it back
   (see *cancel* below).
2. **Cost** — any hand card pays: it flies to the cost slot, is held open, then leaves via
   **`useDiscardExit`**. Only now does the Release fly into its zone slot (`playToReleaseZone`, SNAP).

   **On the board** this is the acting player's own view — the cost is picked out of the fan by a
   click, never a bar control (`_useBoardStaging.ts`'s `onCostPick`), and stays held open as the
   static `paidCost` render until the same runner that places the Release flies it out. Anyone else
   at the table sees it differently, because the engine pays the cost and places the Release in
   **one** reduction and emits nothing in between — no `released` preceded by a cost event of its
   own: the cost card flies in from the actor's own seat, holds (`SHOW_HOLD`), and leaves; only then
   does the Release itself fold in from that same seat and fly on into its zone slot. One runner
   behind both views — `comboBeat.tsx`'s `runRelease` — and, since Task 11 widened it, behind every
   Release's cost leg, not only a Code-Review-paired one's.
3. **Attack** — thrown from a seat: aimed with `cardBoxIn` at a card-sized box inside the seat, not at
   the whole cell (**I6**), landing already at its table tilt (**I7**). A sudo-backed attack travels as
   one `CardPair`.
4. **Answer** — a defence covers the attack; both leave as **one exchange** through `useDiscardExit`,
   each carrying its table layer so the heap keeps the order they lay in (**I9**).
   - The player's own **Sudo** takes its **own** slot with an arrow pointing out of it, then folds with
     the chosen defence into a pair — a frame-by-frame merge of the two elements already on screen, no
     duplicate and no teleport.
   - **Security Bug** does not burn the release: it crosses into the attacker's zone and morphs into
     its LOD reading **in flight** (opponents' cards read at a glance, not in full).
   - **Rollback** sends the attack back — plain to the thrower's hand, under Sudo into your own via
     `useHandArrival`; the sudo that backed it is spent and leaves normally.
5. **Cancel** — a press on nothing valid takes back whatever is staged (the Release awaiting its cost,
   or the Sudo awaiting its defence) through `useHandArrival`, into the middle of the fan. **On the
   board**, taking back a Release still waiting on its cost is not a local undo: `_useBoardStaging.ts`'s
   `cancel` dispatches the engine's own `cancelRelease` choice, and — in the same call, no `await` in
   between — the card flies home from the stage slot right away, optimistically: a rejection cannot
   strand it, since the projection puts the card back in the fan either way, whether the pending
   clears or not.

**Params & timings.** `SHOW_HOLD` 1200 ms · `LAND_HOLD` 700 ms · `MERGE_MS` 620 ms · poses: attack
`rot −4`, cover `rot 6, dx 16, dy −12`, sudo `rot −7`.

**Invariants.** **I1** measure every slot before the state clears · **I6** aim at card boxes, never at
rotated slot rects · **I8** the sequences span many awaits — refs, not closures · **I9** each card
carries its layer into the heap.

**Rules encoded.** Two Releases are playable, one per zone slot, and the next waits for the current
one's attack window to close — the dock's green state is that moment. The attack always answers the
Release played **this** turn. The player's Sudo is only offered when the hand actually holds a defence
it can enhance that also works against this attack — under a sudo-backed attack it can enhance nothing.

**Live reference.** `Defense Release` (interactive group). On the board: `_useBoardStaging.ts` and
`_useDefenseStaging.tsx` (`apps/frontend/src/pages/board/[gameId]/`) for the two gestures — playing,
costing and cancelling a Release, and answering an attack — and `features/board-beats/comboBeat.tsx`
(`runRelease`) with `features/board-beats/defenseBeat.tsx` (`runCovered`) for what runs once the
engine has answered.

---

## Entering a game — the interface arrives, then the table is dealt

**When to call.** The game screen opens: the deal is the first thing that happens in a match, and it
is two choreographies in a row, not one. Guard: the whole sequence is armed by a `started` ref —
StrictMode mounts twice and the intro must play once.

**Visual result.** The screen assembles itself in a readable order — navigation, the table's own
ambience, the piles, the players — and only then cards start leaving the deck. The player's five
gather in an open heap at the centre while each opponent's card sinks straight into their seat; the
whole heap goes into the fan closed, turns over, and only after that does the player's release zone
appear.

**Elements / refs.** The page rail; the HUD background layer; the two decks and the discard
(`Pile`); the opponent seats (`Seat`, one ref each); the turn dock; the release zone; the centre
(where the heap gathers); the hand. A `useFlyer` for the cards leaving the deck, a `useHandArrival`
for the heap going into the fan.

**Sequence — 1. the interface arrives.** Every beat is one `play('hudIn', el, …)`, separated by
`BEAT`. Nothing here measures anything: the blocks are in place, they only fade and shift in.
1. The rail slides in from its own edge (`dx: 44`, `RAIL_MS`).
2. The table layer with its grid — a plain fade (`dx/dy: 0`, `BG_MS`). No movement on purpose: the
   ambience does not arrive from a direction, it is switched on.
3. The decks from the left (`dx: -34`) and the discard from the right (`dx: 34`), the second one
   `PILE_STAGGER` behind — they come one after the other, not together.
4. The seats drop in from above (`dy: -28`), each `SEAT_STAGGER` after the previous, and the dock
   rises from below (`dy: 30`, `DOCK_DELAY`) in the same beat. The dock stands in its
   "opponent's turn" state, reading *game start*.

The release zone is **not** in this order — it is the last thing in the whole scene, and only the
player has one.

**Sequence — 2. the deal.** Round by round, the player first, `DEAL_STEP` between cards and
`ROUND_GAP` between rounds.
1. A player's card: `drawToCenter` from the deck's card box to the centre, landing on its own
   `scatterAt(round)` — and it **stays** there. One scatter drives both the flight and the rest, so
   the card lies exactly where it landed (the discard heap's own coupling, **I7**).
2. An opponent's card: `dealToSeat` into `cardBoxIn(seat, from.width * 0.7)` — a card-sized box
   INSIDE the seat (**I6**; the seat's rect is far wider than a card and the card would inflate to
   it) — and dissolves into the seat's counter, which IS their hidden hand.
3. The first round is the Debugger and is dealt **open**; everything after it travels face down.
4. What landed at the centre is collected into a **local array**, never read back off state: this
   closure never re-runs, so its `staged` would still be the empty array it was at mount (**I8**).
5. When all five have landed: `HEAP_HOLD`, then the centre is emptied **in the same commit** that
   starts the flight, and the whole heap goes into the fan with ONE `useHandArrival` call — each
   card handed its place in the heap as `from` and its own tilt as `rot`, all still `faceDown`.
6. `FLIP_HOLD`, then the hand turns over — the `Card`s play `flipCard` themselves off the prop.
7. `REVEAL_HOLD`, and only now `hudIn` brings in the release zone (`dy: 22`).

**Params & timings.** All in the glossary (§4, "The two ends of a match"): `RAIL_MS` 640 · `BG_MS`
900 · `PILE_MS` 620 / `PILE_STAGGER` 180 · `SEAT_MS` 560 / `SEAT_STAGGER` 140 / `DOCK_DELAY` 320 ·
`ZONE_MS` 620 · `BEAT` 320 · `DEAL_LEAD` 420 · `DEAL_STEP` 230 · `ROUND_GAP` 160 · `HEAP_HOLD` 640 ·
`FLIP_HOLD` 380 · `REVEAL_HOLD` 620.

**Invariants.** **I6** aim inside the seat, not at it · **I7** one scatter for the flight and the
rest · **I8** the heap is accumulated locally, not read from state after an await · **I10** each
flyer is raised at the deck's rect and paints there. Plus one local: a `cancelled` flag checked
after every `wait`, so restarting mid-deal does not leave a half-sequence running.

**End state & cleanup.** Five cards face up in the fan, the counters on the seats carry the
opponents' hands, the deck is down by what was dealt, the zone is on screen. Restart clears the
`started` ref, drops every flyer and re-runs the scene by `key`.

**Live reference.** `Game Deal` (interactive group).

---

## Ending a match — the winning release, the poppers, the window

**When to call.** The move that closes the third release slot. Guard: the scene runs once
(`busy`), and the release is accepted only into its own empty slot.

**Visual result.** The last release settles into the zone, the poppers go off in code symbols out
of both bottom corners, and the game-over window comes up **while the confetti is still in the
air** — the celebration is not a screen that replaces the table, it happens over it.

**Elements / refs.** The release zone (`slotRef` per slot); the hand; a `useFlyer` for the card
leaving the fan; a layer for the volleys; the `GameOver` window.

**Sequence.**
1. The release is pulled out of the fan and flown into its slot with `playToReleaseZone` (SNAP —
   every release lands with the same snap). The zone is now closed.
2. Three volleys are scheduled at `POPPERS` — `[0, 620, 1450]`ms, powers `[1, 0.7, 1.25]`. Each is
   its **own component**, mounted with its own pieces: the pieces are made once and started once in
   a **mount effect**. Starting them from a render-time ref callback is what killed the pieces
   already in the air — the callback re-fires on every render and `play` stacks a second animation
   on a node mid-flight.
3. A piece is a code glyph with its own colour token and step of the mono scale, thrown from one of
   the two bottom corners inward and up; its arc is `play('confettiFly', node, { dx, dy, peak, spin,
   dur })`. Power drives the count, the reach and the time in the air — that is what makes three
   volleys three events instead of one repeated.
4. At `OVER_AT` the `GameOver` window appears over the table, and the confetti keeps flying **over
   the window**.
5. Each volley is taken down `CONFETTI_MS` after it went off, by which time its pieces have flown
   their arcs out.

**Params & timings.** `POPPERS` `[0, 1] [620, 0.7] [1450, 1.25]` · `POP_PER_SIDE` 33 · `OVER_AT`
2400 · `CONFETTI_MS` 8500 · piece spread/reach/spin randomised per volley (see the glossary).

**Invariants.** **I5** a fresh node per flight · a local one that cost real time: **a volley must
be started from a mount effect, never from a ref callback** — otherwise every new volley kills the
previous one.

**In the playground only.** Both layers — the confetti and the window — are `inset: 0` of the
stage, which begins **below** the technical line: that line belongs to the playground, not to the
screen.

**Live reference.** `Game End` (interactive group).

---

## Turn dock — the state of the turn changes without the dock moving

**When to call.** The turn passes, the phase changes, a player draws — anything that changes what
the dock says. It is the one piece of the table that is always on screen, so it is also the one that
must never twitch.

**Visual result.** The frame stands still. Slots keep their size and place; only what is inside
them changes, by a plain fade. The key/name slot has **one fixed width** (≈ the widest key plus 18px
each side), so a longer nickname never resizes it and nothing beside it shifts.

**Sequence.**
1. Text — phase, key label, nickname — swaps through the `Swap` component: the live layer sits in
   flow, the outgoing one is absolutely overlaid on top of it, and the two are driven by
   `play('rollOut')` → `play('rollIn', el, { delay })`. The `delay` is what makes it sequential: the
   incoming text is held invisible (`fill: 'both'`) until the outgoing one has cleared, so the two
   never cross-fade into a blur.
2. **No movement anywhere** — that is the whole point of the pair. The slot is fixed, so the content
   has nowhere to travel to; a slide here would read as the dock itself moving.
3. The "drawn" badge appears and leaves through `Reveal`: `play('popIn')` / `play('popOut')`, fade
   plus scale in reserved space, so its neighbours do not shift when it comes and goes.
4. The button keeps its frame; only the label swaps (through `Swap`) and the accent morphs by a CSS
   transition. The ring and the dot stay put — the accent transitions on `stroke` / `--dot`, and the
   ring fills back to full on a phase change.

**Params & timings.** `rollOut` 220 ms · `rollIn` 300 ms with the delay that waits it out · `popIn`
260 ms (SNAP) · `popOut` 200 ms.

**Building blocks.** `TurnDock` (`Swap`, `Reveal`), `RingTimer`, `StatusDot` — see
[`reference.md`](./reference.md#self-animating-components).

**Live reference.** `Table` (the dock on the table screen); every interactive scene that carries a
dock shows it in context.

---

## Chat toasts — a reply surfaces in the corner, the column moves up

**When to call.** Somebody else says something while the chat panel is closed. Your own sends never
toast (you just wrote them) and neither do the feed's technical notes (their place is the history).
While the chat panel is open there are no toasts at all — the log is already in front of you.

**Visual result.** A plate appears at the bottom of the right-hand corner, lifting the plates
already there. Up to four stand at once; a fifth pushes the oldest out of the top. Each holds for
six seconds unless a pointer is over the stack, in which case nothing expires. Plates are of
different heights — the reply inside is shown whole, never clipped.

**Sequence.**
1. Arrival — `play('hudIn', el, { dy: 18, dur: 260 })` on mount. The same "a block arrives at its
   place", only short and from below.
2. Departure — `play('popOut')`, and **the plate takes itself off the stage**: the queue only marks
   it `leaving`, the plate awaits `anim.finished` and calls back. Dropping it on the timer instead
   would cut the animation in half.
3. Neighbours shift — FLIP through `play('flyFrom', el, { from: previousRect, duration: 240 })`. The
   plates have no common step to travel by, so their boxes are measured before and after the commit
   in `useLayoutEffect` and each moves by its own delta. A plate that has just arrived is skipped
   here: it has no previous place, it has its own arrival.
4. The column is pinned to its bottom edge, so the geometry falls out by itself — the oldest leaving
   from the top moves nobody, a middle one leaving lowers those above it.

**Params & timings.** `hudIn` 260 ms (dy 18) · `popOut` 200 ms · the shift 240 ms · the hold 6000 ms
· at most 4 plates · the column 280px wide.

**Building blocks.** `blocks/Toast` — the plate with its own arrival and departure, and `ToastStack`,
the queue that owns what is shown, for how long and in what order. The plate never knows what is
inside it: the reply is rendered by `Message` and handed in.

**Live reference.** The `Toast` page in Blocks (a live stack in its own corner), and the
`Table + chat` screen — the `incoming` button in the technical bar.

---

## What is missing goes to the backlog, not into a recipe

Recipes describe real code, never a plan. **Every animated moment in the playground has a recipe
above** — so a situation you cannot find here is one of two things, and both have the same address:

- it is **not built**, and a recipe would be a guess dressed as documentation;
- it is built but something about it is **unresolved** — no module for a movement you need, a value
  you cannot reach, a rule nobody has decided.

Either way: **do not invent a local solution and move on** — that is how one movement ends up
written three times in three scenes. Write it into [`backlog.md`](./backlog.md) with what it costs,
and raise it. A gap that is not written down is indistinguishable from a gap nobody noticed.

The one caveat standing: the Git cards (Cherry-pick / Rebase / System Upgrade) have **prototype**
recipes — the movements are real and transcribed, only their rules-complete resolution
([#61](https://github.com/MythHand/ReleaseBoardGameP2P/issues/61)) is pending. That is a rules
question, not an animation one.

> This file no longer runs on memory. `apps/playground/stories/docs.test.ts` reads the playground
> navigation and requires every scene in the **Cards** and **Interactive** groups to be named here
> as a live reference, in backticks — the convention every recipe already ends with. Add a scene
> and the test goes red until it has one. Two scenes are exempt by name, each with its reason next
> to it: the audit page describes the modules rather than being one, and the `Animations` catalogue
> is a preset per form, not a game moment.
