# Extending — add a new preset or module

When nothing in [`reference.md`](./reference.md) fits. Guiding principle (stated in `presets.ts`):
**don't stock speculative presets** — add one only when a real call site needs it. The dictionary
grows with real needs, not future guesses.

---

## Where things live

- **Presets** — `apps/ui/src/animations/presets.ts` (the `PRESETS` registry), the internal `move` /
  `durationOf` helpers, the exported `enterPose` and the shake characters `SHAKE_SHAPES`.
- **Scatter** — `apps/ui/src/animations/scatter.ts` (`scatterAt` / `jitter` / `restTransform` /
  `toDiscardParams` / `HEAP_SHOW`; the ranges are `ROT` and the **fractions** `DX_FRAC` / `DY_FRAC`
  — offsets scale with the card width, the tilt does not).
- **Timing** — `apps/ui/src/animations/timing.ts` (`wait`, `nextFrames`).
- **Public surface** — `apps/ui/src/animations/index.ts` re-exports `play`, `presetNames`,
  `PRESETS`, `enterPose`, `SHAKE_SHAPES`, the whole scatter model and the timing helpers. `move` and
  `durationOf` stay inside on purpose: a flight goes through a named preset, never through the base.
- **Toolkit modules** — under `apps/ui/src/primitives/` (`Arrow`, `Card/geometry`, `CardPair` with
  its `PAIR_AUX` pose).

---

## Add a preset

A preset is one of two shapes (both in `PRESETS`):

- **Data preset** `{ keyframes, options }` — a self-contained animation with no params (e.g. `shake`).
  `play` runs `el.animate(keyframes, { ...options, ...params })`.
- **Function preset** `(el, params) => Animation | null` — when it needs params (from/to, direction, …).
  Return `null` on missing inputs (as `move` does when `from`/`to` are absent).

Steps:
1. Add an entry to `PRESETS` with a clear, game-moment name (a verb-ish phrase like `playToCenter`,
   `returnToDeck`). Reuse `EASE` / `LAND` / `SNAP` — `LAND` when a CARD settles onto a place (its travel across the
   table has to be visible), `SNAP` only when a small element APPEARS in its slot with no path to
   show; for a travel, build on `move(el, params, duration, easing)`
   rather than hand-writing keyframes.
2. For a variable duration, read it via `durationOf(p, fallback)` so call sites can override `duration`.
3. Call it: `const anim = play('yourName', el, params); if (anim) await anim.finished`.
4. No extra export needed — `play` resolves the name from `PRESETS`.

Naming: the **callable** goes in `reference.md`; any **value/constant** it introduces goes in the
glossary. Durations are parameters, not names (see the glossary).

---

## Add a helper / toolkit module

- A timing helper → `timing.ts` (like `wait` / `nextFrames`). A card geometry/value helper →
  `@/primitives/Card/geometry` (like `cardAreaOf` / `cardBoxIn`). Keep functions **pure** (rect in → rect out).
- Export it from the module's index (and `animations/index.ts` if it belongs to the animation surface) so
  call sites and `reference.md` can find it.

---

## Follow the invariants

Any new flight obeys **I1–I10** (see [`README.md`](./README.md)): measure before mutate; `nextFrames`
before start; cancel leftover animations on a reused node; pin the flyer after landing; `key={seq}` for a
reused flyer `Card`; aim at the card box (**I6**); precompute variance and pass it in (**I7**); pass data
as arguments inside async sequences (**I8**); make a card's layer a value it carries, never DOM order
(**I9**); render the flyer at the coordinates it mounts with (**I10**). The last two are the flight
ones — a new flight that skips them lands in the wrong order or flashes at the bottom of the page.

---

## When nothing fits and you cannot decide it alone

Adding a preset is the easy case. The hard one is a movement whose rule nobody has settled, a value
you need but cannot reach, or a fix you can only make locally. Do **not** solve that one in place:
write it into [`backlog.md`](./backlog.md) — the gap, what it costs, and the smallest thing that
would close it — and raise it. A local workaround is invisible; a backlog entry can be scheduled.

---

## Keep the sources in sync

- Add the new preset/helper to `reference.md`; add any new tuning value to the `glossary.md`; if it's a
  game moment, add a `recipes.md` recipe.
- Update the playground **`Interaction audit`** page (the live status map, per the project Animations Rule)
  and add/adjust a story, so the animation has a visual source of truth. The **no-reinterpretation rule**
  requires a live reference — a preset with no on-screen showcase can't be verified.
- **Three of those asks are enforced, so skipping them turns CI red rather than going unnoticed:** a
  preset with no row in `reference.md` (`apps/ui/src/animations/docs.test.ts`); a module on the audit
  page not mentioned in `reference.md`, and a scene in the Cards / Interactive groups not named as a
  live reference in `recipes.md` (both `apps/playground/stories/docs.test.ts`). A scene that genuinely
  owes no recipe is exempted **by name, with its reason**, in that file — not by quietly deleting the
  expectation.
- The one thing no test can see is a module that reached NEITHER the audit page nor the docs, since
  every check compares two places with each other. That is why the audit page comes first: put it
  there and the tests will drag it the rest of the way.

---

## Swapping the executor

`play` currently runs the native Web Animations API (`el.animate`). Call sites use **names**, not the
engine — a different executor can replace the internals of `play` / the presets without touching any
recipe. Keep that boundary: recipes and game logic call `play('name', …)`, never the animation engine directly.
