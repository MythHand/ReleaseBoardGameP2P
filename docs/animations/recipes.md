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
   - opponent → pop the top of `oppDeck`, then compute `from` as a card-sized box **centered on
     the seat**: `w = 108`, `h = w * CARD_RATIO`, `left = seat.left + seat.width/2 - w/2`,
     `top = seat.top + seat.height/2 - h/2` (so the card does not inflate to the wide `Seat`).
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
| opponent source box | — | — | — | `w = 108px`, `h = w * 1.4`, centered on the seat |
| `jitter()` ranges | — | — | — | `rot ±14°`, `dx ±10px`, `dy ±8px` |

- Card height/width ratio = **1.4** (the constant is `CARD_RATIO` in this story).
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
[`playToCenter`](./reference.md#playtocenter) · [`centerToDiscard`](./reference.md#centertodiscard)
(both `move()` travel) · [`jitter()`](./reference.md#jitter) · [`nextFrames()`](./reference.md#nextframes).

**Live reference**
`Card play` — `apps/playground/stories/interactive/CardPlayStory.tsx`.

---

## Remaining recipes (same schema — to be written next)

Grounded in the `Interaction audit` scenarios and the interactive stories:

- **Playing a combo (pair)** — `useArrow`/`centerOf` aim → `CardPair` merge at the center →
  `playToReleaseZone` (SNAP) for a release, or the pair splits into two singles each with its
  own `centerToDiscard` + `jitter()`. _(Combo)_
- **Targeted arrow attack** — `useArrow` builds `from/to` from `centerOf`, tracks the cursor,
  starts/stops by play phase. _(Arrow, Combo)_
- **Drawing a card (single)** — `drawToCenter` deck→center back-up, then branch: player
  (`flipCard` + `useHandInsert`), opponent (`dealToSeat`), trigger/AI (`flipCard` reveal for
  all; AI also draws an effect via a `key={seq}` flyer). _(Draw card)_
- **Multi-draw** — batch of N through the single-draw scenario; an unresolved trigger
  (Error 503) stops the batch. _(Draw card)_
- **AI resolution (cards leaving)** — `resolveAi(trig, eff)` with cards passed as args **[I8]**;
  trigger → `centerToDiscard` + `jitter()`; effect flips in place then `returnToDeck`. _(Draw card)_
- **Splitting the deck** — `flyFrom` FLIP: the half is already in its new DOM place, animated
  "from" the previous rect. _(Deck animations)_
- **Merging decks (+ discard)** — parallel `absorbToDeck` (move + fade) into the first deck's
  rect, measured once **[I1]**. _(Deck animations)_
- **Discard → new deck** — gather the scattered discard → `gatherToDeck` → `flipCard` back-up on
  landing. _(Deck animations)_
- **Error 503 alarm** — `EdgeGlow` inside the table zone; `strong` before `Hand` in the DOM
  (under the hand) / `weak` after (over the hand, `pointer-events: none`). _(Draw card)_
- **Taking an opponent's card** — face-down deal grid → `flipCard` reveal of the chosen card →
  `useHandInsert`. _(Random opponent card)_
