# Animations — how to wire game logic to the visuals

AI-facing guide to the card/table animation system. The **playground is the showcase**
(the live, canonical look of every animation — `apps/playground/stories/...`); **these
docs are the how-to** — how to call the same functions from real game logic and get the
exact, debugged result, without re-inventing or losing the tuned nuances.

Read in this order:

1. **This file** — the mental model + the global invariants every recipe relies on.
2. **[`recipes.md`](./recipes.md)** — by game situation ("a card was played", "a card was
   drawn"…): the ordered sequence + params + gotchas to reproduce it. **Start here for a task.**
3. **[`reference.md`](./reference.md)** — flat catalog of presets, helpers and toolkit
   modules (signatures, params, defaults). Look up a name here.
4. **[`extending.md`](./extending.md)** — add a new preset/module when nothing fits.
5. **[`glossary.md`](./glossary.md)** — the reference catalog of every animation name and tuning
   number (presets, helpers, parameters, per-scene constants) in one place.

The live status map of what exists is the playground **`Interaction audit`** page
(`apps/playground/stories/AnimationAuditStory`). Keep it and these docs in sync on changes.

---

## No reinterpretation — reproduce exactly (hard rule)

The playground animations are already debugged and verified on screen. When you use or document
a module: **reproduce it exactly as implemented — no interpretation, no "functionally
equivalent" substitution, no per-place analog.** Use the real preset/module, with its real
params and its real order.

- Docs **transcribe what the code actually does** — numbers, order, names — verbatim, not a
  cleaner-looking alternative.
- "Functionally the same" is an assumption, not a verified fact; a plausible-equivalent can
  silently break timing or rendering.
- Any change to an animation must be **verified live in the playground** and judged by the
  on-screen result before it is considered correct. Never swap blindly.

---

## Mental model (30 seconds)

- A **game event** (card played, drawn, combo resolved) triggers an **animation** by calling
  one function: `play('presetName', el, params)`.
- `play` looks the name up in a **registry** (`PRESETS`, in `apps/ui/src/animations/presets.ts`)
  and runs it. The executor today is the native **Web Animations API (WAAPI)** — it is a
  swappable implementation detail; call sites use names, not the engine.
- Presets are **atoms**. Real moments are **scenarios/recipes** — short ordered sequences of
  atoms plus DOM measurement and timing glue.
- `play(...)` returns an `Animation | null`. Sequence steps with `await anim.finished`.

Minimal shape of any "fly A → B" step:

```ts
const from = sourceEl.getBoundingClientRect()      // measure BEFORE mutating the DOM
const to = targetEl.getBoundingClientRect()
setFlyer(card)                                     // mount the moving element
await nextFrames()                                 // let it paint (two rAFs)
flyerEl.style.left = `${from.left}px`              // position the flyer at the source
flyerEl.style.top = `${from.top}px`
flyerEl.style.width = `${from.width}px`
const anim = play('playToCenter', flyerEl, { from, to })
if (anim) await anim.finished                      // wait for the flight
```

### Vocabulary

- **preset** — a named animation in the registry, called via `play('name', el, params)`.
- **flyer / staging element** — a single `position: fixed/absolute` node that carries the
  moving card during a flight; it is positioned by inline `left/top/width` and animated.
- **rect** — a `DOMRect` from `getBoundingClientRect()`; the geometry the travel presets use.
- **atom** — a preset/helper/toolkit module (one responsibility).
- **scenario / recipe** — a game moment assembled from atoms (see `recipes.md`).

---

## Global invariants

These hold across **every** recipe. Recipes reference them by number (I1…I8) instead of
repeating them. Break one and the animation "works on paper" but jumps, double-flips, or
teleports on screen.

- **I1 — Measure rects before mutating the DOM.** Capture `getBoundingClientRect()` for
  `from`/`to` before you mount or move anything. When many elements fly to one target,
  measure the **target once**; only the sources differ.
- **I2 — `nextFrames()` before starting a flight.** Wait two `requestAnimationFrame`s so a
  just-mounted node has painted; starting on the same frame makes it jump from the origin.
- **I3 — Cancel leftover animations before repositioning.** WAAPI `fill: 'forwards'` keeps
  the final transform on the element. Before you set new inline styles / start a new flight,
  cancel the old ones (`for (const a of el.getAnimations()) a.cancel()`; use
  `{ subtree: true }` for a container with nested cards) — or the residual transform
  overwrites yours → chaos.
- **I4 — Pin the flyer after landing (identity).** After a flight, set the flyer's inline
  `left/top/width` to the landing rect and clear its transform, so the **next** flight starts
  from where it visually is, not from the old origin.
- **I5 — `key={seq}` on the flyer.** Bump a per-flight counter and key the flyer node by it,
  so React does not reuse the same `Card` element across flights. Reuse + a `faceDown` change
  spins a spurious flip mid-flight.
- **I6 — Aim at the card area, not the cell center.** A `Pile` renders a label under the card,
  so the cell rect is taller than the card. Target the upper card box:
  `{ left, top, width, height: width * CARD_RATIO }` (`CARD_RATIO = 1.4`, the card's height/width).
  Otherwise the landing drifts down and the card teleports when the real pile appears. Use the
  shared helpers `cardAreaOf` / `cardBoxIn` from `@/primitives/Card` (see the glossary §5).
- **I7 — Precompute variance and pass it in.** For scatter/rotation (`jitter()`), compute it
  **once** and pass `rotate/dx/dy` into the preset, so the card lands in its final pose with
  no post-animation jump. Store the same values with the resulting entry.
- **I8 — Pass data as arguments, not from state, inside an async sequence.** A long sequence
  reads stale state after `await`; pass the cards/rects it needs as function args (avoids the
  stale-closure bug on click).

---

## Notes for reproduction

- Numbers (durations, holds, offsets) and preset choices in the recipes are **verbatim from
  the tuned code** — do not round or "simplify" them.
- Each recipe ends with a **Live reference** (a playground story). That story is the visual
  source of truth: if a reproduction looks different, the recipe is being read wrong, not the
  showcase.
- Recipes are written as **independent actions** with an explicit trigger, guard, and cleanup,
  so they can be called at the right game moment and replay stably on repeat.
