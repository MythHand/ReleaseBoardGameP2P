# Recipes — animations by game situation

Each recipe is an **independent action**: an explicit trigger + guard, the exact ordered
sequence, the verbatim params/timings, the invariants that keep it stable, and the cleanup —
so it can be called at the right game moment and replay identically on repeat.

Read the shared model and the `I1…I9` invariants in [`README.md`](./README.md) first; recipes
reference those by number instead of repeating them.

**Where a movement has a step, the recipe names the step — it does not restate its mechanics.**
Three movements are shared and live in one place each ([`reference.md`](./reference.md#the-three-movement-steps)):
`useHandInsert` (a card settles into the hand), `useDiscardExit` (cards leave the table for the
discard), `useHandReturn` (the staging goes back into the hand). A recipe says *which step and what
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
- `flyerRef` — the **single** fixed flyer node that carries the card during both flights.
- State: `center: CardData | null`, `discard: DiscardEntry[]`, `flyer`, `busy`.

**Sequence**

_Phase A — to center_ (trigger handler `playFromPlayer` / `playFromOpponent`, then `flyToCenter`):
1. Guard `busy || center`. Capture the **source rect** `from` and update the source — on the same
   tick, in this exact order (as in the code):
   - player → `setPlayerHand(remove the item)`, **then** `from = handEl.getBoundingClientRect()`.
     React defers the unmount, so measuring the still-mounted node on the same tick is valid.
   - opponent → pop the top of `oppDeck`, then `from = cardBoxIn(seatRect, FIXED_CARD_W)` — the
     shared helper returns a card-sized box centered on the seat (so the card does not inflate to
     the wide `Seat`). `FIXED_CARD_W = 108` is this showcase's fixed card width; a real build would
     measure the actual card instead.
2. `flyToCenter(card, from)`: `setBusy(true)`; measure `to = centerRef.getBoundingClientRect()`.
3. `setFlyer(card)`; `await nextFrames()` — **[I2]**.
4. Position the flyer at the source: `flyer.style.left/top/width = from.left/top/width`.
5. `const anim = play('playToCenter', flyer, { from, to })`; `if (anim) await anim.finished`.
6. `setCenter(card)`; `setFlyer(null)`; `setBusy(false)`. The card now rests in the center.

_Phase B — center → discard (separate trigger):_
1. Guard `busy || !center`; `setBusy(true)`; `const card = center`.
2. Measure `from = centerRef` rect, `to = discardRef` rect — **[I1]**.
3. `const j = jitter()` — **once**, **[I7]**.
4. `setCenter(null)`; `setFlyer(card)`; `await nextFrames()` — **[I2]**.
5. Position the flyer at `from`.
6. `const anim = play('centerToDiscard', flyer, { from, to, rotate: j.rot, dx: j.dx, dy: j.dy })`;
   `if (anim) await anim.finished`.
7. `setDiscard(d => [...d, { card, ...j }])` — store the **same** `j` so the static card in the
   pile matches the landed pose — **[I7]**.
8. `setFlyer(null)`; `setBusy(false)`.

**Params & timings**

| Step | Preset | Duration | Easing | Extra |
|---|---|---|---|---|
| A: hand/seat → center | `playToCenter` | 480 ms | EASE | — |
| B: center → discard | `centerToDiscard` | 420 ms | EASE | `rotate/dx/dy` from `jitter()` |
| opponent source box | — | — | — | `cardBoxIn(seat, FIXED_CARD_W)`, `FIXED_CARD_W = 108`, centered on the seat |
| `jitter()` ranges | — | — | — | `rot ±14°`, `dx ±10px`, `dy ±8px` |

- Card height/width ratio = **1.4** (`CARD_RATIO`, shared from `@/primitives/Card`).
- Hold between A and B is **user-driven** (the card waits in the center until it resolves). For
  an auto-resolving variant, insert `await wait(ms)` between the phases (e.g. `CENTER_HOLD = 420`
  in Deck animations).

**Invariants**
- Global: **I1** (measure before mutate), **I2** (`nextFrames` before each flight), **I7**
  (`jitter()` once, passed into the preset **and** stored with the entry).
- Local — **the center is a one-card gate**: the `busy || center` guard makes the action safe to
  re-trigger; a card must leave the center (Phase B) before another can enter.
- A **single flyer** carries the card for the whole arc. Commit to `center`/`discard` state only
  after `anim.finished`, then drop the flyer.

**End state & cleanup**
- After A: `center = card`, flyer gone, `busy = false`.
- After B: a new `DiscardEntry { card, rot, dx, dy }` appended; `center = null`; flyer gone;
  `busy = false`. State is clean for the next play.

**Building blocks**
[`playToCenter`](./reference.md#presets) · [`centerToDiscard`](./reference.md#presets)
(both `move()` travel) · [`cardBoxIn`](./reference.md#card-geometry-helpers) ·
[`jitter()`](./reference.md#travel-and-timing-helpers) · [`nextFrames()`](./reference.md#travel-and-timing-helpers).

**Live reference**
`Card play` — `apps/playground/stories/interactive/CardPlayStory.tsx`.

---

## Playing a combo (pair) — two hand cards → merge at center → release zone or discard

**When to call**
Phases `idle → partner → target` (`onCardDown`, guard `if (playing) return`):
- **idle:** if `isComboSource(item.card)` → `setSource`, `aim(centerOf(ref), { x, y })`, `setPhase('partner')`.
- **partner:** pick a 2nd card; if `item.uid !== source.uid && validComboTarget(source.card, item.card)` →
  if `cardCanTarget(item.card)` → `setPartner`, `aim(...)`, `setPhase('target')`; else `runPlay(src, item)` now.
  Otherwise `cancel()`.
- **target:** click a target zone → `runPlay(source, partner, label)`.
A `window` mousedown while `active` cancels the aim.

**Visual result**
An arrow points from the source card; on play both cards fly from their hand spots to the table
center and fold into a pair (helper tucked under the main at an angle), the pair holds at the
center, then a **release** flies into its zone slot, or **anything else** splits into two singles
that scatter into the discard.

**Elements / refs**
- `refs[uid]` — hand-card spots (source/partner measured here).
- `centerRef` — merge target; `slotRefs[key]` — release-zone slots (`key = prt.card.name.toLowerCase()`).
- `discardRef` — discard slot.
- `flyRef` — the **persistent** flyer div (opacity-toggled, not unmounted) holding a `CardPair` with
  `[data-main]` / `[data-aux]` children.
- State: `phase`, `source`, `partner`, `flyPair`, `released`, `discardPile`, `playing`; `useArrow()`.

**Sequence** (`runPlay(src, prt, targetLabel?)`)
1. `setPlaying(true)`; `cancel()` (drops the arrow).
2. Measure — **[I1]**: `mainHand = refs[prt.uid]`, `auxHand = refs[src.uid]`, `cRect = centerRef`.
3. `setHand(remove src & prt)`.
4. `setFlyPair({ main: prt.card, aux: src.card })`; `await nextFrames()` — **[I2]**.
5. `el = flyRef`. **Cancel all subtree animations**: `for (const a of el.getAnimations({ subtree: true })) a.cancel()`
   — **[I3]** (the flyer node is reused; a leftover `fill:forwards` would overwrite the new transforms).
6. Pin the flyer to the center: `el.style.left/top/width = cRect`; `el.style.transform = 'none'`.
7. `mainEl = el.querySelector('[data-main]')`, `auxEl = '[data-aux]'`. Compute
   `enterMain = enterTransform(mainHand, cRect)` and `enterAux = enterTransform(auxHand, cRect)`
   (translate-by-centers + scale-by-width placing each card at its hand spot in the center's coord
   system). Set `mainEl/auxEl.style.transform = enter*`; `el.style.opacity = '1'`; `await nextFrames()` — **[I2]**.
8. **Merge at the center** — bespoke inline `animate()`, **not a preset**:
   - `mainEl`: `[enterMain → 'translate(0,0) scale(1)']`, **620 ms**, EASE, `fill:'forwards'`.
   - `auxEl`: `[enterAux → 'translateY(-26%) rotate(-7deg)']`, **620 ms**, SNAP, `fill:'forwards'`.
   - `await Promise.all([a1.finished, a2.finished])`.
9. `await wait(2100)` — hold the assembled pair at the center (visible to all).
10. Branch on `prt.card.category`:
    - **release** → `toRect = slotRefs[key]`; `play('playToReleaseZone', el, { from: cRect, to: toRect })`
      (the whole pair, SNAP); await; `setReleased(key → { card: prt.card, aux: src.card })`;
      `await nextFrames()`; `hideFlyer()`.
    - **else (discard)** → hand the pair to **`useDiscardExit`** — one entry with `aux` + `el` (the
      flyer), and it becomes **two** singles, each flying from where that half actually stands.
      **Order matters:** call the step **first**, while the pair is still on screen (it measures both
      halves as it starts), and only then clear the staging and hide the flyer — the centre slot
      renders the source whenever the pair is gone, so hiding first puts the source card back on the
      table for the whole flight.
11. `setLog(...)`; `setPlaying(false)`.

**Params & timings**
| Step | Preset / animation | Duration | Easing |
|---|---|---|---|
| merge — main | inline `animate()` | 620 ms | EASE → `translate(0,0) scale(1)` |
| merge — aux (tuck) | inline `animate()` | 620 ms | SNAP → `translateY(-26%) rotate(-7deg)` |
| hold assembled pair | `wait(2100)` | 2100 ms | — |
| release → zone | `playToReleaseZone` | 480 ms | SNAP |
| discard (per card) | `useDiscardExit` | 420 ms | EASE + its own scatter |

**Invariants**
- **I1** measure the three rects before mutating the hand. **I2** `nextFrames()` after mounting the
  pair and before the merge. **I3** cancel subtree animations on the reused flyer before
  repositioning. **I7** is the step's job now — one scatter per card, flight and rest from the same value.
- Local: the flyer is a **persistent opacity-toggled** node with one `CardPair` (not mounted per
  flight) — hence the mandatory **[I3]** and `hideFlyer()` (opacity → 0) instead of unmount.
- The discard holds **singles**: a pair reaches it as **two** entries — the step splits it.
- Cancel goes through **`useHandReturn`**: the whole staging back into the middle of the fan at once
  (a lone card from the centre slot, a merged pair by its two anchors).

**End state & cleanup**
- Release: `released[key] = { card, aux }`; flyer hidden. Discard: two `DiscardEntry` appended;
  flyer hidden. `playing = false`; `log` set.

**Building blocks**
[`playToReleaseZone`](./reference.md#presets) · [`centerToDiscard`](./reference.md#presets) ·
[`jitter()`](./reference.md#travel-and-timing-helpers) · [`nextFrames()`](./reference.md#travel-and-timing-helpers) ·
[`wait()`](./reference.md#travel-and-timing-helpers) · [`useArrow`/`centerOf`](./reference.md#arrow-toolkit) ·
`CardPair`. The merge is a **bespoke inline `animate()`**, not a registered preset.

**Live reference**
`Combo` — `apps/playground/stories/ComboStory/ComboStory.tsx`.

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

## Card to hand — settle a card into the fan (`useHandInsert`)

**When to call**
The base "a card settles into the hand" step, reused wherever a card ends up in the player's hand
(draw, take-opponent). Standalone trigger (showcase): click a source card → `click(i)`. Guard:
`if (flyingCard || used[i]) return`. Then `insert(card, sourceRect, hand.length)`.

**Visual result**
The hand fan opens a gap; the card flies from its source spot into that gap, scaling to the hand-card
size and rotating to the slot's angle; it rides above the fan briefly, then tucks under the fan's right
half and lands at the slot's bottom-center.

**Elements / refs**
- `handRef` — the `Hand` fan container (the hook measures it and reads `@/table/Hand/fan` geometry).
- `sourceRefs[i]` — source card spots (the flight origin).
- `useHandInsert(handRef, onInserted)` → `{ gapAt, overlay, insert, reset, flyingCard }`.
- State: `hand`; the hook owns `gapAt`, `flying`, `started`, `tucked`.

**Sequence** (`insert(card, source, handLength)`, inside the hook)
1. Guard `if (flying) return`. `gap = round(handLength / 2)` (≈ fan center); `place = slotPlacement(gap, handLength + 1)`
   — the target slot in a fan of `handLength + 1` slots (the single source of fan geometry).
2. Measure the hand rect `hr` — **[I1]**. Target the slot **bottom-center**:
   `targetBcX = hr.left + hr.width/2 + place.x`, `targetBcY = hr.bottom + place.y`. Compute `dx/dy` from the
   source's bottom-center, `rot = place.rotate`, `scale = CARD_W / source.width`.
3. `setGapAt(gap)` (the fan opens the gap); `setFlying({ card, z: place.z, from: source, to: \`translate(dx,dy) rotate(rot) scale(scale)\` })`;
   `setStarted(false)`, `setTucked(false)`.
4. **Double-rAF** — **[I2]** → `setStarted(true)` (the overlay transitions to `to`); start a `START_HIGH_MS` timer → `setTucked(true)`.
5. The overlay div: `zIndex = tucked ? place.z : TRAVEL_Z`; `transform = started ? to : 'none'`; the move is a CSS
   transition on `.flying` (`FLIGHT_MS`).
6. `onTransitionEnd` (`settle`): if the finished property is `transform` and `gapAt != null` →
   `onInserted(card, gapAt)` (the consumer splices the card into `hand` at `gap`) → `reset()` (clear gap/flying/started/tucked).

**Params & timings**
| Aspect | Value |
|---|---|
| flight | CSS transition on `.flying`, `FLIGHT_MS = 480` |
| high-layer hold | `START_HIGH_MS = 140` (then z drops from `TRAVEL_Z = 500` to the slot's z) |
| target size | `scale = CARD_W / source.width` (`CARD_W = 150`, the fan's card width) |
| slot | `slotPlacement(gap, handLength + 1)` from `@/table/Hand/fan` — `x`, `y`, `rotate`, `z` |

**Invariants**
- **I1** measure the hand rect (and the source rect) before starting. **I2** double-rAF before flipping `started`
  on, so the overlay paints at the source before transitioning (else it jumps).
- Local: this is **CSS-transition based, not a `play()` preset**. The gap (`gapAt`) and the flight are one
  coordinated move — the fan must render `handLength + 1` slots so the landing slot exists. The high→tuck
  z-swap (`TRAVEL_Z` → `place.z`) makes the card ride over the fan, then slip under its right half. Landing is
  detected by the `transitionend` of `transform`.

**End state & cleanup**
- `onInserted` splices the card into `hand` at `gap`; the hook `reset()`s (`gapAt = null`, flying cleared). The
  fan is whole again with the new card.

**Building blocks**
[`useHandInsert`](./reference.md#hand-insert) (**playground-local** — see the README "Current state" note) ·
`@/table/Hand/fan` (`slotPlacement`, `CARD_W`) · `Hand` (renders the `gapAt`).

**Live reference**
`Card to Hand` — `apps/playground/stories/interactive/CardToHandStory.tsx`.

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
- `seatRefs[oppId]` — opponent seats. `handRef` — the player fan (via `useHandInsert`). `discardRef`, `aiRef`.
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
     measure the flyer rect → `setFlyer(null)` → `insert(card, rect, hand.length)` (`useHandInsert`). returns `true`.
   - **non-trigger, opponent** → `toOpponent(drawer)`: `wait(160)` → `to = cardBoxIn(seatRect, fromRect.width * 0.7)` →
     `play('dealToSeat', el, { from: fromRect, to })` (fades in) → bump `handCount` → `setFlyer(null)`. returns `true`.

**Params & timings**
| Step | Preset | Duration | Note |
|---|---|---|---|
| deck → staging | `drawToCenter` | 480 ms | back-up; `from = cardAreaOf(deckCell)` |
| flip reveal | `flipCard` (auto, on `faceDown` change) | 420 ms | JS waits `220 + 560` around it |
| player → hand | `useHandInsert` | `FLIGHT_MS = 480` | see the hand-insert reference entry |
| opponent → seat | `dealToSeat` | 460 ms | +fade; `to = cardBoxIn(seat, w*0.7)` |

**Invariants**
- **I2** `nextFrames` before the flight. **I3/I4** cancel + pin the flyer after `drawToCenter` (identity)
  so the next leg starts from where it visually is. **I5** `key={seq}` on the flyer — a new flight is a
  fresh `Card`, so the `faceDown` flip doesn't spin mid-flight on a reused node. **I6** aim at the deck's
  card area. **I8** the card travels as an argument through the async chain.
- Local: `revealForAll`/`toPlayerHand` **wait out the flip** (`220`/`560`) — a deliberate cascade around
  the `Card`'s auto-`flipCard`.

**End state & cleanup**
- Player: card inserted at `gap` (via `onInserted` splice); flyer gone. Opponent: `handCount+1`; flyer gone.
  Trigger: `centerCard = card` stays; flyer gone.

**Building blocks**
[`drawToCenter`](./reference.md#presets) · [`dealToSeat`](./reference.md#presets) · `flipCard` (auto) ·
[`useHandInsert`](./reference.md#hand-insert) · [`cardAreaOf`/`cardBoxIn`](./reference.md#card-geometry-helpers) ·
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
     rect; `setFlyer({ card: top, faceDown:false })`; `setDiscard(cards:[])`; `await nextFrames()`; position the
     flyer at the discard rect; return it.
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
- `slotRefs[i]` — the deal-grid slots (each a face-down `Card`). `handRef` — the player fan (`useHandInsert`).
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
4. `resolve(i)`: measure `slotRefs[i]` rect; `insert(pool[i].card, rect, hand.length)` (the `useHandInsert` hook
   flies it into the fan); `setPhase('resolve')`. In `resolve`, `slotStyle` sends the chosen slot to `opacity:0`
   (the hook owns the flight) and the rest back to `ORIGIN` (`opacity:0`).
5. `useHandInsert` `onInserted(card, gap)`: splice into `hand` at `gap`; `setPhase('idle')`; clear `chosen/dealt/pool`.

**Params & timings**
| Step | Mechanism | Duration |
|---|---|---|
| deal-in / return | CSS transition on the slot (`ORIGIN ↔ grid`), staggered `i*45ms` | (CSS) |
| flip the pick | `Card` `flipCard` on `faceDown` change | 420 ms |
| reveal hold before flight | `setTimeout(REVEAL_HOLD)` | 820 ms |
| chosen → hand | `useHandInsert` | `FLIGHT_MS = 480` |

**Invariants**
- The deal / reveal / return are **CSS transitions** on the slots (not `play()` presets); the flip is the
  `Card`'s own `flipCard`. Only the final hand insert uses a module (`useHandInsert`).
- Local: the double-rAF (like **I2**) lets slots paint at `ORIGIN` before transitioning to the grid; the
  reveal→flight gap is `REVEAL_HOLD`.

**End state & cleanup**
- Chosen card inserted into the hand at `gap`; pool cleared; `phase` back to `idle` (via the hook callback).

**Building blocks**
[`useHandInsert`](./reference.md#hand-insert) · `Card` `flipCard` (auto). Grid geometry: `gridPositions`
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
2. `beginDrag`: grab point from the **base fan** (`slotPlacement(i, n)`, not the enlarged hover pose, so pick-up
   does not offset); `setHoveredUid(null)`; `setDrag`; `setPreview(inBand(downY) ? i : null)`.
3. Drag effect (keyed on `drag`): `place()` sets the flyer `left/top` to `cursor - frac*CARD_W/H` on each
   `mousemove`; `preview = inBand ? slotUnderCursor(x) : null`. The lifted card renders `null` in the fan; the
   rest lay out with a gap at `preview`.
4. On `mouseup`: inBand → `settleInto(slotUnderCursor(x), () => onReorder(uid, to))`; out of band →
   `onPlay(uid, {x, y, rect})` — `true` = played (gone), else `settleInto(originalIndex)` (never vanishes).
5. `settleInto(target, commit?)`: hold the gap at `target`; drop the flyer's `zIndex` to the slot's `base.z` (so
   it tucks BETWEEN cards); transition `left/top/transform` over `SETTLE_MS`, landing at the slot bottom-center
   with `rotate(base.rotate)`; after `SETTLE_MS` run `commit`, clear `drag`/`preview`.
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
| reorder / return glide | `SETTLE_MS = 340` ms, `var(--ease-out)` |
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
- Pick-up geometry comes from the **base fan**, not the enlarged hover pose.
- A rejected play returns via `settleInto` — the card never disappears into nothing.

**End state & cleanup**
- Reorder → `onReorder(uid, toIndex)` (local, never networked). Play → the consumer owns the card. Rejected →
  back in its original slot. `drag`/`preview` cleared; hover suppressed during drag.

**Building blocks**
`table/Hand/fan` (`slotPlacement`, `handStep`) · `@keyframes zoom-rise` (Hand.module.css). No `play()` preset —
the flight is a CSS transition on the flyer.

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
   `useHandInsert` into the hand; the rest fly back to the discard (`centerToDiscard`, own scatter).
7. `goodVibe`: `resolveEvent` (Good Vibe → AI deck, trigger → discard); reset `turnInterrupted`; draw 2 per the
   makeup selector — plain card via `drawToHand` (`pullTo` → `useHandInsert`), AI trigger via
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
`useHandInsert` · `ConfirmAction` · `ReleaseZone.slotRef` · `jitter`/`toDiscardParams`.

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
5. `fall()`: measure the reveal rect; `insert(card, rect, hand.length)` — the shared `useHandInsert` flies it into
   the fan; `onInserted` splices it into `hand` and `backToIdle()`.

**Params & timings**
| Step | Value |
|---|---|
| chosen holds / others leave | `PICK_BEAT = 620` ms |
| reveal centre width | `REVEAL_W = 220` px |
| centre hold before the drop | `REVEAL_HOLD = 820` ms |
| miss shake + note | `MISS_HOLD = 1620` ms (+560 to idle) |
| opponent fan / grid width | `OPP_HAND = 6`, `GRID_W = 100` |
| final drop | `useHandInsert` (`FLIGHT_MS = 480`) |

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
`useHandInsert` · `Hand` (`faceDown`, `renderFace`) · CSS transitions on `.reveal` / `.topHand`.

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
  behind the opponent fan. No `useHandInsert` — the card leaves the hand, it does not settle into one.

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
- `pileRef` (discard), `deckRef` (draw deck), grid slot refs, `handRef` (`useHandInsert`).
- State: `phase`, the discard pool, picks, `deckCount`, the size toggle `SIZES = [8, 54]` (no-scroll vs scroll).

**Sequence**
1. `deal()`: measure the pile rect (**I1**); `setPhase('deal')`; deal each discard card to its grid slot, staggered
   `DEAL_STEP` (capped at `STAGGER_CAP`), `DEAL_DUR` each; → `setPhase('choose')`.
2. Pick (base 1 / sudo 2) under the trigger rule above.
3. `resolve` (`setPhase('resolve')`): the hand card flies to the centre (`REVEAL_W`, `REVEAL_DUR`), holds
   `REVEAL_HOLD`, then `useHandInsert` into the fan; a sudo deck card `flipCard` face-down (`FLIP_DUR`), holds
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
`useHandInsert` · `Card` `flipCard`.

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
- Seat refs (throw sources), `centerRef`, `pileRef` (discard), `handRef` (`useHandInsert`).
- State: `phase`, opponent count `OPP_COUNTS`, the thrown cards, `sudo`.

**Sequence**
1. `throw`: each opponent's card flies seat → centre, `THROW_DUR`, staggered `THROW_STEP`, scaling `THROW_SCALE →
   1`.
2. base → `hold` (`HOLD_MS`); sudo → `choose`.
3. `resolve`: a sudo pick reveals to the centre (`REVEAL_W`, `REVEAL_DUR`), holds `REVEAL_HOLD`, `useHandInsert`
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
`play('centerToDiscard')` · `scatterAt` / `restTransform` / `toDiscardParams` / `HEAP_SHOW` · `useHandInsert`.

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
   slot's card box into that cell. Several run **concurrently** — a flight must never gate the next
   drag (discarding is "think, then dump fast").
3. The grid is held open (`GRID_HOLD`).
4. The whole grid leaves through **`useDiscardExit`**: one entry per placed card, `node` = its cell
   element, `layer` = its slot, `delay` = `slot × CLEAR_STEP` — one by one, but as one movement.

**Params & timings.** grid card width 150 / 132 / 116 px by row count · `GRID_HOLD` 1500 ms ·
`CLEAR_STEP` 90 ms · flights `playToCenter` 480 ms.

**Invariants.** **I1** measure the cell before it unmounts · **I8** the card, its slot and its source
rect come in as arguments (the sequence spans several awaits) · a `runId` guard drops flights from a
previous deal.

**End state & cleanup.** Cells released, `placed` cleared, grid size back to 0, the cards lie in the heap.

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
     `useHandInsert`; the sudo that backed it is spent and leaves normally.
5. **Cancel** — a press on nothing valid takes back whatever is staged (the Release awaiting its cost,
   or the Sudo awaiting its defence) through `useHandInsert`, into the middle of the fan.

**Params & timings.** `SHOW_HOLD` 1200 ms · `LAND_HOLD` 700 ms · `MERGE_MS` 620 ms · poses: attack
`rot −4`, cover `rot 6, dx 16, dy −12`, sudo `rot −7`.

**Invariants.** **I1** measure every slot before the state clears · **I6** aim at card boxes, never at
rotated slot rects · **I8** the sequences span many awaits — refs, not closures · **I9** each card
carries its layer into the heap.

**Rules encoded.** Two Releases are playable, one per zone slot, and the next waits for the current
one's attack window to close — the dock's green state is that moment. The attack always answers the
Release played **this** turn. The player's Sudo is only offered when the hand actually holds a defence
it can enhance that also works against this attack — under a sudo-backed attack it can enhance nothing.

**Live reference.** `Defense Release` (interactive group).

---

## Not yet built (situations without a recipe)

Recipes describe real code, never a plan. The three situations that used to stand here —
`discardForRelease`, `defend`, `handLimit` — are built and have recipes above (**Defending a release**,
**Hand limit**), so nothing is currently without one.

(Git Cherry-pick / Rebase / System Upgrade have **prototype** recipes above; only their rules-complete resolution
— the #61 open questions — is pending.)
