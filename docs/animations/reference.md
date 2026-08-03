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

---

## Discard scatter

`apps/ui/src/animations/scatter.ts` — the single source of "how a card lands in and rests in the discard heap".
The flight (`toDiscardParams`) and the rest (`restTransform`) read the **same** `Scatter`, so a card lands
exactly where it lies — no position swap on the last frame (invariant **I7**). The ± ranges are in the glossary.

| Name | Signature | What it does |
|---|---|---|
| `Scatter` | `{ rot, dx, dy }` | one card's heap pose (tilt + offset) |
| `Rect` | `{ left, top, width, height }` | the geometry travel presets take |
| `scatterAt` | `scatterAt(key, width?)` → `Scatter` | **deterministic** scatter by a card key (stable across re-renders and peers) — use for a persistent heap |
| `jitter` | `jitter(width?)` → `Scatter` | a **one-off random** scatter — use for a card just tossed in |
| `restTransform` | `restTransform(s)` → `string` | the CSS `transform` for a card at rest in the heap |
| `toDiscardParams` | `toDiscardParams(from, to, s, fade?)` → `MoveParams` | params for `play('centerToDiscard', …)` that land the card exactly on `restTransform(s)` |
| `HEAP_SHOW` | `6` | how many top cards render; the rest are hidden/faded |

---

## Hand — the interactive fan

`apps/ui/src/table/Hand/Hand.tsx`. A **self-animating** component: it owns hover (lift + neighbour spread + a
separate zoom preview), the pick-up/drag gesture (drag out → play, drag inside → reorder), the click/drag
threshold, per-card dim, and the settle-back glide. A consumer supplies data and intent callbacks; it does not
drive any of the motion. Legality is the consumer's (engine's) answer — the Hand only reflects it via `stateAt`.

| Prop | Type | What it does |
|---|---|---|
| `items` | `HandItem[]` (`{ uid, card }`) | the fan, in order |
| `faceDown?` | `boolean` | render backs (opponent fan); disables the zoom preview |
| `gapAt?` | `number \| null` | open an insert gap at this slot (paired with `useHandInsert`) — the fan lays out as `n + gapSize` and spreads **before** the card lands |
| `gapSize?` | `number` (default `1`) | how many cards the gap holds. `> 1` when several cards return at once (cancelling a combo assembly), so they land in ready room instead of on top of the neighbours |
| `onCardClick?` | `(index, el, e) => void` | a click (no drag) — coexists with drag via the threshold |
| `accentAt?` | `(index) => string \| undefined` | a glow colour for a slot (arrow target) |
| `stateAt?` | `(index) => HandCardState` | `'idle' \| 'playable' \| 'selected' \| 'disabled'` — mirrors the engine's `playable`/`frozen`; `disabled` dims via the Hand's own transitioned filter |
| `onPlay?` | `(uid, drop: HandPlayDrop) => boolean` | card dragged OUT of the hand; return `true` to accept (played), else it glides back |
| `onReorder?` | `(uid, toIndex) => void` | card dragged WITHIN the hand — local reorder, never networked |
| `renderFace?` | `(item, ctx: HandFaceContext) => ReactNode` | override the default flat `Card` face |
| `HandPlayDrop` | `{ x, y, rect? }` | where a played card was released |

Drag mode turns on when `onPlay` or `onReorder` is supplied. Tuning constants (`HOVER_LIFT`, `NEIGHBOR_PUSH`,
`SETTLE_MS`, `DRAG_THRESHOLD`, `BAND_PAD`, the zoom clamps) are in the glossary.

### Hand geometry — `apps/ui/src/table/Hand/fan.ts`

The single source of fan geometry; `Hand` and `useHandInsert` compute slots from the **same** formula.

| Name | Signature | What it does |
|---|---|---|
| `slotPlacement` | `slotPlacement(slot, total)` → `{ x, y, rotate, z }` | a slot's offset/tilt/z in a fan of `total` cards |
| `handStep` | `handStep(n)` → `number` | horizontal pitch between cards for a hand of `n` (also re-exported from `@/table/Hand`) |
| `CARD_W` | `150` | the canonical hand-card width |

---

## Self-animating components

Import and use declaratively — the animation is built in.

| Component | Path | Self-animation |
|---|---|---|
| `Card` | `@/primitives/Card` | plays `flipCard` on a `faceDown` change |
| `EdgeGlow` | `@/primitives/EdgeGlow` | `<EdgeGlow visible? intensity? color? className? />` — inward edge veil, CSS opacity fade; `intensity: 'strong' \| 'weak'`. The consumer owns the bounds/layer (container + mount point). |
| `ConfirmAction` | `@/table/ConfirmAction` | `<ConfirmAction open? label disabled? onConfirm? caption? className? />` — the shared "confirm the selection" bar; slides up/down on `open`, pins to the bottom of its positioned container. Used by pick flows (Inside choice, Git cards). |
| `ReleaseZone` | `@/table/ReleaseZone` | `slotRef?(key, el)` exposes each slot's node so a consumer can measure it and fly a card into that slot (AI Release / Monitoring landing). A position hook only — no visual effect. |
| `Arrow` | `@/primitives/Arrow` | see the Arrow toolkit above (`useArrow`) |
