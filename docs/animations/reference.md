# Reference — presets, helpers & toolkit modules

The callable API of the animation system: **what you can call and how** — each entry with its
signature, params and defaults. The *values* those params take (easing tokens, ratios, tuning
constants, holds) live in [`glossary.md`](./glossary.md); the game-situation sequences that combine
these modules live in [`recipes.md`](./recipes.md).

Signatures are transcribed from code (paths per section). If a signature here disagrees with the
code, the code wins — fix this file.

---

## Presets

`PRESETS` in `apps/ui/src/animations/presets.ts`. Call by name: `play('name', el, params)`.
All are `fill: 'forwards'` except `shake`. Durations in ms; `EASE` / `SNAP` are defined in the
glossary; the param words (`from`, `to`, `rotate`, `dx`, `dy`, `fade`, …) are in the glossary too.

| Preset | Duration | Easing | Fade | Params | Purpose |
|---|---|---|---|---|---|
| `flipCard` | 420 | EASE | — | `{ faceDown }` | flip face ↔ back (used by `Card` itself) |
| `flyFrom` | `duration` ?? **520** | EASE | — | `{ from, duration }` | FLIP: element already in place, animate *from* its old rect |
| `playToCenter` | 480 | EASE | — | `{ from, to, rotate?, dx?, dy? }` | play a non-release card to the table center |
| `playToReleaseZone` | 480 | **SNAP** | — | `{ from, to, … }` | play a release into its zone slot (snap) |
| `centerToDiscard` | 420 | EASE | — | `{ from, to, rotate, dx, dy }` | move a played card center → discard |
| `gatherToDeck` | `duration` ?? **520** | EASE | — | `{ from, to, duration? }` | a pile flies to a target deck and lands |
| `absorbToDeck` | `duration` ?? **520** | EASE | **yes** | `{ from, to, duration? }` | a deck flies into another and dissolves (merge) |
| `drawToCenter` | `duration` ?? **480** | EASE | — | `{ from, to, duration? }` | a card leaves the draw deck to the center |
| `dealToSeat` | `duration` ?? **460** | EASE | **yes** | `{ from, to, duration? }` | a card goes center → a player seat and dissolves |
| `returnToDeck` | `duration` ?? **480** | EASE | — | `{ from, to, duration? }` | a card returns center → deck (pair of `drawToCenter`) |
| `shake` | 380 | EASE | — | — | left–right shake ("field not filled"), returns to origin |

---

## Travel and timing helpers

`apps/ui/src/animations/`.

| Name | File | Signature | What it does |
|---|---|---|---|
| `move` | `presets.ts` | `move(el, { from, to, rotate=0, dx=0, dy=0, fade=false }, duration=460, easing=EASE)` | the travel base under every "flight" preset: translate-by-centers + scale-by-width + rotate/dx/dy (+ optional fade). Its `duration=460` default is never hit — every preset passes an explicit duration. |
| `durationOf` | `presets.ts` | `durationOf(p, fallback=520)` | reads `p.duration`, else the fallback. The `520` default is the fallback for the variable-time presets. |
| `play` | `play.ts` | `play(name, el, params={})` → `Animation \| null` | registry dispatch; warns on unknown name; no-op without `el`/WAAPI |
| `presetNames` | `play.ts` | `presetNames()` → `string[]` | the registry keys |
| `jitter` | `scatter.ts` | `jitter()` → `{ rot, dx, dy }` | random scatter for the discard, precomputed once (the ±ranges are in the glossary) |
| `wait` | `timing.ts` | `wait(ms)` → `Promise` | `setTimeout` promise — holds a beat between phases |
| `nextFrames` | `timing.ts` | `nextFrames()` → `Promise` | double `requestAnimationFrame` — let a new node paint before a flight |

---

## Arrow toolkit

`apps/ui/src/primitives/Arrow/`.

| Name | Signature | What it does |
|---|---|---|
| `Arrow` | `<Arrow from={Point} to={Point} color? />` | quadratic-Bézier aiming arrow in viewport coords |
| `centerOf` | `centerOf(el)` → `Point` | element center in viewport coords (`clientX/Y`) |
| `useArrow` | `useArrow()` → `{ from, to, active, aim, stop }` | holds arrow endpoints, tracks the cursor while active; `aim(origin, at?)` starts, `stop()` ends |
| `Point` | `{ x, y }` | viewport point (the arrow's coordinate shape) |

---

## Card geometry helpers

`apps/ui/src/primitives/Card/geometry.ts`. Build a card-sized target rect to aim a flight at the
card (not at a wider cell/seat) — invariant **I6**. The `CARD_RATIO` value is in the glossary.

| Name | Signature | What it does |
|---|---|---|
| `cardAreaOf` | `cardAreaOf(cell)` → `Rect` | trim a Pile cell to its **top** card box (keep left/top/width, height = width·`CARD_RATIO`) |
| `cardBoxIn` | `cardBoxIn(rect, width)` → `Rect` | a card box of `width`, **centered** in `rect` (e.g. a Seat). Pass a width measured from the real card element where possible. |

---

## Hand-insert

`apps/playground/stories/interactive/useHandInsert.tsx` — the "card settles into the hand" step
(CSS-transition based, not a `play()` preset). Its tuning constants are in the glossary.

| Name | Signature | What it does |
|---|---|---|
| `useHandInsert` | `useHandInsert(handRef, onInserted)` → `{ gapAt, overlay, insert, reset, flyingCard, FLIGHT_MS }` | opens a gap in the fan and flies a card into the slot; `insert(card, source, handLength)` starts it, `onInserted(card, gapIndex)` fires on landing |
| `InsertSource` | `{ left, top, width, height }` | the source rect the card flies from |
