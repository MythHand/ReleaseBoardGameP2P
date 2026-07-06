# Recipes — animations by game situation

Each recipe is an **independent action**: an explicit trigger + guard, the exact ordered
sequence, the verbatim params/timings, the invariants that keep it stable, and the cleanup —
so it can be called at the right game moment and replay identically on repeat.

Read the shared model and the `I1…I8` invariants in [`README.md`](./README.md) first; recipes
reference those by number instead of repeating them.

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
    - **else (discard, the pair splits)** → `dRect = discardRef`; `jMain = jitter()`, `jAux = jitter()` — **[I7]**;
      `play('centerToDiscard', mainEl, { from: cRect, to: dRect, rotate: jMain.rot, dx, dy })` and the same
      for `auxEl` with `jAux`; `await Promise.all([...])`;
      `setDiscardPile([...p, { card: prt.card, ...jMain }, { card: src.card, ...jAux }])` (**two** single entries);
      `await nextFrames()`; `hideFlyer()`.
11. `setLog(...)`; `setPlaying(false)`.

**Params & timings**
| Step | Preset / animation | Duration | Easing |
|---|---|---|---|
| merge — main | inline `animate()` | 620 ms | EASE → `translate(0,0) scale(1)` |
| merge — aux (tuck) | inline `animate()` | 620 ms | SNAP → `translateY(-26%) rotate(-7deg)` |
| hold assembled pair | `wait(2100)` | 2100 ms | — |
| release → zone | `playToReleaseZone` | 480 ms | SNAP |
| discard (per card) | `centerToDiscard` | 420 ms | EASE + `jitter()` |

**Invariants**
- **I1** measure the three rects before mutating the hand. **I2** `nextFrames()` after mounting the
  pair and before the merge. **I3** cancel subtree animations on the reused flyer before
  repositioning. **I7** `jitter()` once per card, passed in **and** stored with the entry.
- Local: the flyer is a **persistent opacity-toggled** node with one `CardPair` (not mounted per
  flight) — hence the mandatory **[I3]** and `hideFlyer()` (opacity → 0) instead of unmount.
- The discard holds **singles**: a combo appends **two** entries, each with its own jitter.

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
`await flyCenterToDiscard(cards)` (each card a separate `centerToDiscard` + `jitter()`, landing as its
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
