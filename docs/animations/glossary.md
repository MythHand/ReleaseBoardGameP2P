# Glossary — animation properties & tuning values

The **properties and values** you work with when driving animations: the parameters you pass into
`play(...)`, the easing tokens, and the tuning constants (geometry, timing, holds). The callable
modules that consume these (presets, helpers, hooks) are catalogued in
[`reference.md`](./reference.md); the game-situation sequences are in [`recipes.md`](./recipes.md).

Values are transcribed from code (paths per section). If a number here disagrees with the code,
the code wins — fix this file.

---

## 1. Easing tokens — `apps/ui/src/animations/presets.ts`

| Name | Value | Used by |
|---|---|---|
| `EASE` | `cubic-bezier(0.4, 0, 0.2, 1)` | every preset except `playToReleaseZone` |
| `SNAP` | `cubic-bezier(0.2, 0.9, 0.1, 1)` | `playToReleaseZone` (snap landing) |

---

## 2. Parameters passed to `play(...)`

The words that flow into a preset as `params`.

| Param | Type | Meaning |
|---|---|---|
| `from` / `to` | `Rect` = `{ left, top, width, height }` | source / target geometry for a travel preset |
| `rotate` | number (deg) | final rotation of the flyer at landing |
| `dx` / `dy` | number (px) | extra final offset (land in the exact pose, no post-jump) |
| `fade` | boolean | dissolve opacity during the flight (baked into `absorbToDeck` / `dealToSeat`) |
| `duration` | number (ms) | override the preset's default time (variable-time presets) |
| `faceDown` | boolean | `flipCard` direction (the `Card` auto-plays `flipCard` when this prop changes) |

> Two rect shapes: travel presets use `{ left, top, width, height }`; `Point` (arrows) uses `{ x, y }`.
>
> `seq` (seen in recipes) is **not** a `play()` argument — it is the flyer's React `key`, bumped per
> flight so React mounts a fresh `Card` instead of reusing one (**I5**).

---

## 3. Geometry & layout values

| Name | Value | Where | What |
|---|---|---|---|
| `CARD_RATIO` | `1.4` (height / width) | `@/primitives/Card` | card art proportion. Reciprocal of the `--card-aspect` CSS token (`368 / 515`, width / height) — keep JS names off "aspect" to avoid the opposite convention. |
| `CARD_W` | `150` | `@/table/Hand/fan` | canonical hand-card width (the real source) |
| `SOURCE_CARD_W` | `140` | `CardToHandStory` | preview source-card width |
| `DEAL_CARD_W` | `150` | `PickOpponentCardStory` | deal-grid card width |
| `FIXED_CARD_W` | `108` | `CardPlayStory` | fixed showcase card width — a stopgap: this scene renders the hand by hand, not via `@/table/Hand`, so there is no real card to measure |
| `ROT` / `DX` / `DY` | `14` / `10` / `8` | `scatter.ts` | `jitter` ±ranges: `rot ±14°`, `dx ±10px`, `dy ±8px` |
| `TRAVEL_Z` | `500` | `useHandInsert` | z-index of the high travel layer during a hand-insert flight |

Card widths differ per view by design — not duplicates.

---

## 4. Timing values

All in ms. Durations and holds are **tuned parameters, not duplicates** — some intentionally key off
another animation's timing (a deliberate cascade, e.g. `wait(FLIP_MS + 150)` waits out a flip before
the next step). Treat them as verified choreography; change them only with a live check in the
playground.

| Name | Value | Where | Beat |
|---|---|---|---|
| `START_HIGH_MS` | `140` | `useHandInsert` | how long the high layer is held before tucking under the fan |
| `FLIGHT_MS` | `480` | `useHandInsert` | hand-insert flight — **must equal the `.flying` CSS transition** |
| `FLIP_MS` | `420` | `DrawCardStory` | mirror of the `flipCard` preset — JS waits the in-place flip |
| `SPLIT_MS` | `520` | `DeckAnimationsStory` | the `flyFrom` split fly-out duration |
| `MERGE_MS` | `520` | `DeckAnimationsStory` | each deck's `absorbToDeck` flight on merge |
| `GATHER_MS` | `360` | `DeckAnimationsStory` | gather the scattered discard before it flies |
| `TURN_MS` | `460` | `DeckAnimationsStory` | flip a card back-up in place (discard→deck / merge prep) |
| `AI_HOLD` | `4000` | `DrawCardStory` | table hold while the AI effect is read |
| `REVEAL_HOLD` | `820` | `PickOpponentCardStory` | pause after flip, before scatter |
| `SPLIT_HOLD` | `600` | `DeckAnimationsStory` | pause after split, before touching discard |
| `CENTER_HOLD` | `420` | `DeckAnimationsStory` | card rests at center before leaving to discard |
| `STEP_HOLD` | `360` | `DeckAnimationsStory` | standard short beat between deck steps |

---

## 5. Data / content constants

Not animation tuning, listed for completeness: `BASE`, `AI_DECK`, `NON_TRIGGER`, `ORDINARY_POOL`,
`DECK_COUNTS`, `SOURCES`, `RELEASE_SLOTS`, `DISCARD_N`, `COLS_MAX`, `GAP_X` / `GAP_Y`, `CARD_H`,
`ORIGIN`, `INITIAL_HAND`, card ids (`BRANCH`, `MERGE`, `SUDO`), trigger ids (`ERROR_503`,
`AI_TRIGGER`).

---

> Changing any tuned value is a code change — verify it live in the playground and judge it by the
> on-screen result (the no-reinterpretation rule in [`README.md`](./README.md)).
