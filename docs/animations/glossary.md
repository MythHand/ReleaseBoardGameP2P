# Glossary — animation names, params & tuning constants

The reference catalog of every name and number in the animation system: the **shared vocabulary**
(§1–6 — presets, helpers, toolkit modules, parameters) and the **story-local tuning constants**
(§7 — per-scene numbers). Look a name up here; the mechanics live in [`recipes.md`](./recipes.md)
and [`reference.md`](./reference.md).

Values are transcribed from the code (paths in each section). If a number here disagrees with the
code, the code wins — fix this file.

---

## 1. Easing tokens — `apps/ui/src/animations/presets.ts`

| Name | Value | Used by |
|---|---|---|
| `EASE` | `cubic-bezier(0.4, 0, 0.2, 1)` | every preset except `playToReleaseZone` |
| `SNAP` | `cubic-bezier(0.2, 0.9, 0.1, 1)` | `playToReleaseZone` (snap landing) |

---

## 2. Presets — the registry (`PRESETS`, `apps/ui/src/animations/presets.ts`)

Called by name: `play('name', el, params)`. All are `fill: 'forwards'` except `shake`.

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

## 3. Travel & timing helpers — `apps/ui/src/animations/`

| Name | File | Signature / value | What it is |
|---|---|---|---|
| `move` | `presets.ts` | `move(el, { from, to, rotate=0, dx=0, dy=0, fade=false }, duration=460, easing=EASE)` | the travel base under every "flight" preset: translate-by-centers + scale-by-width + rotate/dx/dy (+ optional fade). Its `duration=460` default is never hit — every preset passes an explicit duration. |
| `durationOf` | `presets.ts` | `durationOf(p, fallback=520)` | reads `p.duration`, else the fallback. The `520` default is the fallback for the variable-time presets. |
| `play` | `play.ts` | `play(name, el, params={})` → `Animation \| null` | registry dispatch; warns on unknown name; no-op without `el`/WAAPI |
| `presetNames` | `play.ts` | `presetNames()` → `string[]` | the registry keys |
| `jitter` | `scatter.ts` | `jitter()` → `{ rot, dx, dy }` | random scatter for the discard, precomputed once |
| `ROT` / `DX` / `DY` | `scatter.ts` | `14` / `10` / `8` | `jitter` ranges: `rot ±14°`, `dx ±10px`, `dy ±8px` |
| `wait` | `timing.ts` | `wait(ms)` → `Promise` | `setTimeout` promise — holds a beat between phases |
| `nextFrames` | `timing.ts` | `nextFrames()` → `Promise` | double `requestAnimationFrame` — let a new node paint before a flight |

---

## 4. Arrow toolkit — `apps/ui/src/primitives/Arrow/`

| Name | Signature | What it is |
|---|---|---|
| `Arrow` | `<Arrow from={Point} to={Point} color? />` | quadratic-Bézier aiming arrow in viewport coords |
| `centerOf` | `centerOf(el)` → `Point` | element center in viewport coords (`clientX/Y`) |
| `useArrow` | `useArrow()` → `{ from, to, active, aim, stop }` | holds arrow endpoints, tracks the cursor while active; `aim(origin, at?)` / `stop()` |
| `Point` | `{ x, y }` | viewport point |

---

## 5. Card geometry — `apps/ui/src/primitives/Card/geometry.ts`

Shared card-box math, used to aim flights at a card (not at a wider cell/seat). See invariant **I6**.

| Name | Signature / value | What it is |
|---|---|---|
| `CARD_RATIO` | `1.4` (height / width) | card art proportion. Reciprocal of the `--card-aspect` CSS token (`368 / 515`, width / height) — keep JS names off "aspect" to avoid the opposite convention. |
| `cardAreaOf` | `cardAreaOf(cell)` → `Rect` | trim a Pile cell to its **top** card box (keep left/top/width, height = width·ratio) |
| `cardBoxIn` | `cardBoxIn(rect, width)` → `Rect` | a card box of `width`, **centered** in `rect` (e.g. a Seat). Pass a width measured from the real card element where possible. |

---

## 6. Hand-insert — `apps/playground/stories/interactive/useHandInsert.tsx`

The "card settles into the hand" step (CSS-transition based, not a `play()` preset).

| Name | Value / signature | What it is |
|---|---|---|
| `useHandInsert` | `useHandInsert(handRef, onInserted)` → `{ gapAt, overlay, insert, reset, flyingCard, FLIGHT_MS }` | opens a gap, flies a card into the fan slot |
| `TRAVEL_Z` | `500` | z-index of the high travel layer during flight |
| `START_HIGH_MS` | `140` | how long the high layer is held before tucking under the fan |
| `FLIGHT_MS` | `480` | flight duration — **must equal the `.flying` CSS transition** |
| `InsertSource` | `{ left, top, width, height }` | the source rect the card flies from |
| `CARD_W` | imported from `@/table/Hand/fan` | the fan's canonical hand-card width (target size) |

---

## 7. Parameter vocabulary — the words that flow through `play(...)`

| Param | Type | Meaning |
|---|---|---|
| `from` / `to` | `Rect` = `{ left, top, width, height }` | source / target geometry for a travel preset |
| `rotate` | number (deg) | final rotation of the flyer at landing |
| `dx` / `dy` | number (px) | extra final offset (land in the exact pose, no post-jump) |
| `fade` | boolean | dissolve opacity during the flight (baked into `absorbToDeck` / `dealToSeat`) |
| `duration` | number (ms) | override the preset's default time (variable-time presets) |
| `faceDown` | boolean | `flipCard` direction |
| `seq` | number | per-flight key so React does not reuse the flyer `Card` (see **I5**) |

> Two rect shapes: travel presets use `{ left, top, width, height }`; `Point` (arrows) uses `{ x, y }`.

---

## 8. Story-local tuning constants

Per-scene numbers, all under `apps/playground/stories/interactive/`.

### 8.1 Card widths per view

| Name | Value | File | What |
|---|---|---|---|
| `CARD_W` | `150` | `@/table/Hand/fan` | canonical hand-card width (the real source) |
| `SOURCE_CARD_W` | `140` | `CardToHandStory` | preview source-card width |
| `DEAL_CARD_W` | `150` | `PickOpponentCardStory` | deal-grid card width |
| `FIXED_CARD_W` | `108` | `CardPlayStory` | fixed showcase card width (opponent box + hand `Card`) — a stopgap: this scene renders the hand by hand, not via `@/table/Hand`, so there is no real card to measure |

Values differ per view by design — not duplicates.

### 8.2 Flip / split durations

| Name | Value | File | What |
|---|---|---|---|
| `FLIP_MS` | `420` | `DrawCardStory` | mirror of the `flipCard` preset — JS waits the in-place flip |
| `SPLIT_MS` | `520` | `DeckAnimationsStory` | the `flyFrom` split fly-out duration |

### 8.3 Holds / pauses (`wait(...)` beats)

| Name | Value | File | Beat |
|---|---|---|---|
| `AI_HOLD` | `4000` | `DrawCardStory` | table hold while the AI effect is read |
| `REVEAL_HOLD` | `820` | `PickOpponentCardStory` | pause after flip, before scatter |
| `SPLIT_HOLD` | `600` | `DeckAnimationsStory` | pause after split, before touching discard |
| `CENTER_HOLD` | `420` | `DeckAnimationsStory` | card rests at center before leaving to discard |
| `STEP_HOLD` | `360` | `DeckAnimationsStory` | standard short beat between deck steps |

> **Durations (`*_MS`) and holds are tuned parameters, not duplicates.** Some intentionally key off
> another animation's timing — a deliberate cascade (e.g. `wait(FLIP_MS + 150)` waits out a flip
> before the next step). Treat these numbers as verified choreography; change them only with a live
> check in the playground.

### 8.4 Data / content constants

Not animation tuning, listed for completeness: `BASE`, `AI_DECK`, `NON_TRIGGER`, `ORDINARY_POOL`,
`DECK_COUNTS`, `SOURCES`, `RELEASE_SLOTS`, `DISCARD_N`, `COLS_MAX`, `GAP_X` / `GAP_Y`, `CARD_H`,
`ORIGIN`, `INITIAL_HAND`, card ids (`BRANCH`, `MERGE`, `SUDO`), trigger ids (`ERROR_503`,
`AI_TRIGGER`).

---

> Changing any tuned value or animation is a code change — verify it live in the playground and judge
> it by the on-screen result (the no-reinterpretation rule in [`README.md`](./README.md)).
