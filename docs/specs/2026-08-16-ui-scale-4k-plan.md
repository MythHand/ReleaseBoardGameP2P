# Scaling the interface up to 4K — Plan

Russian version: [`2026-08-16-ui-scale-4k-plan.ru.md`](./2026-08-16-ui-scale-4k-plan.ru.md).

Implements [`2026-08-16-ui-scale-4k-design.md`](./2026-08-16-ui-scale-4k-design.md)
(Russian: [`…-design.ru.md`](./2026-08-16-ui-scale-4k-design.ru.md)).

**One correction to the design.** Its §4 puts the multiplier in the declarations
(`calc(24px * var(--ui-scale))`, ~474 sites). This plan puts it in the **tokens** instead: components
reference a name (`gap: var(--space-6)`), and the arithmetic lives once, in `tokens.css`. The two are
not alternatives — the token layer is where the multiplier applies, and the multiplier is what makes
the token layer adaptive. Everything else in the design stands.

---

## Principles

Three rules govern every stage. They are what makes this safe to stop halfway.

**P1 — The no-op invariant.** At `--ui-scale: 1`, `calc(24px * var(--ui-scale))` **is** `24px`. Any
PR that only introduces the multiplier must render pixel-identically. Its review criterion is
"nothing on screen changed".

**P2 — Normalisation and activation never share a PR.** Collapsing 93 distinct values into ~25 steps
*will* move some pixels (a 22px gap becomes 24px). That is a visible design change and must be
reviewed as one. Mixed with a no-op PR, there is no way to tell an intended rounding from a typo.

**P3 — Every stage ships on its own.** Stopping after any stage leaves a working, shippable product.
There is no commit that switches everything at once.

---

## What blocks what

The open questions in the design's §10 are **not** all blockers:

| question | blocks |
|---|---|
| §10.1 the ramp function | **only stage 6** |
| §10.2 multiplier vs `rem` for text | **stage 1** (decides whether type is in the token set) |
| §10.3 automatic vs a user setting | only stage 6 |
| §10.4 how JS learns the scale | **stage 4** |
| §10.5 hairlines at 2× | **stage 1** (decides whether hairlines get a non-scaling token) |
| §10.6 conversion order | stage 2 |

So stages 1–5 — the bulk of the work — need two answers, not six. The ramp can be argued about while
the conversion runs.

---

## Stage 0 — Decisions

**Deliverable:** answers to §10.2 and §10.5 recorded in the design doc.

- **§10.2.** Does text join the token set and scale with the multiplier, or does it move to `rem` off
  a scaled root so the browser's font-size preference survives? This decides whether
  `typography.module.css` is touched in stage 1 or in a separate hybrid track.
- **§10.5.** Do hairlines stay 1px at any scale? If yes (the design's recommendation), they get their
  own non-scaling token so that "this was left alone deliberately" is visible in the code.

**Done when:** both are written down. Nothing else in the plan starts before this.

---

## Stage 1 — The token vocabulary

Grow `apps/ui/src/design/tokens.css` with the categories it does not have today. It currently holds
colours, fonts, timings, z-index and a few card metrics — **no spacing, no sizes, no radii**, which
is exactly the 474 values that need to scale.

**Work:**

1. Extract the distinct values (93 across the kit) and their frequencies.
2. Propose a step set — expect ~25 after rounding. Categories:
   - `--space-*` — gap / padding / margin (the largest group: `gap` 94, `padding` 59, margins ~40)
   - `--size-*` — explicit `inline-size` / `block-size` (~75)
   - `--radius-*` — corner radii (21)
   - `--hairline` — the non-scaling 1–2px group (123 occurrences), per the §10.5 decision
   - `--shadow-*` — offsets scale, blur decided as a class
3. Write the tokens. **No consumer changes.** Definitions are plain px at this stage — the multiplier
   arrives in stage 3.

**Verification:** none needed — nothing renders differently, because nothing consumes them yet.

**Size:** one file. The cost is the analysis, not the typing.

**Note:** the step set is a design decision with a life beyond this project — 93 arbitrary values
collapsing to 25 named steps is a consistency win even if the 4K work is cancelled. That is what
de-risks the whole plan: stages 1–2 pay for themselves independently.

---

## Stage 2 — Normalisation, area by area

Replace literals with token references. **This is the stage where pixels move** (P2), so it is
reviewed visually, area by area.

**Order** (design §10.6 — argue it in stage 0 if you disagree):

1. `primitives` — 199 occurrences. First because everything sits on top of them: a wrong step shows
   up on many screens while few files have changed.
2. `blocks` — 108
3. `table` — 184
4. `screens` — 161
5. `boot` — 29, `cards` — 9

**Per area:**

- Substitute literals for tokens; the ~123 hairlines get `--hairline`, not a `--space-*` step.
- Anything that genuinely does not fit a step: either the step set gains one (rare, and it must be
  justified) or the value is deliberately rounded — and the rounding is named in the PR body.
- Turn on stylelint `declaration-property-value-disallowed-list` **for that directory** so a raw px
  cannot come back into a converted area.

**Verification:** the area's playground stories, compared against the previous build. Differences are
expected here — the reviewer's job is to confirm each one is a rounding and not a mistake.

**Size:** ~690 substitutions across 56 files, split into as many PRs as wanted. Mechanical.

---

## Stage 3 — The multiplier

**Work:**

1. `--ui-scale: 1` on `:root` in `tokens.css`.
2. Token definitions become `calc(N * var(--ui-scale))` — one file, ~25 lines. `--hairline` and the
   timing/threshold tokens deliberately do **not**.
3. A control in the playground's technical bar that sets `--ui-scale` on the story's stage subtree
   (custom properties inherit, so this needs no plumbing through components).

**Verification:** P1 — at scale 1 the build is pixel-identical. Then, for the first time, everything
converted so far can be **looked at** at 1.5× and 2× without owning a 4K monitor.

**Size:** two files. This is the smallest stage and the one that makes every later step observable.

---

## Stage 4 — Card geometry and the JS bridge

The one stage where P1 does not come for free: this is a behavioural refactor, not a substitution.

**The problem.** `apps/ui/src/table/Hand/fan.ts` holds `CARD_W = 150` as a module constant, with the
`handStep(n)` parabola anchored in pixels off it and `insertPath` measuring its reach in fan steps.
`Hand.tsx` adds `CARD_H`, `HOVER_LIFT 28`, `NEIGHBOR_PUSH 36`, `BAND_PAD 32` and the hand-zoom bounds
`ZOOM_MIN_H 240` / `ZOOM_MAX_H 460`. If CSS scales and these do not, the fan's spacing, the insertion
landing, the grab offset and every flight path are wrong by the scale factor.

**Work:**

1. Answer §10.4 first: JS reads `--card-w` via `getComputedStyle` (once, and on resize); or takes the
   card's measured width as an argument; or receives the scale through React context. The design
   notes the second is the most honest and the most invasive.
2. Make the fan's geometry a function of the card width rather than a module constant. The parabola
   anchors become ratios.
3. Express the dependent constants relative to the card width — `scatter.ts` already does this
   (`DX_FRAC` / `DY_FRAC` are fractions), so the shape to copy exists in the codebase.
4. **`CARD_W` is exported from the package index** — removing or changing it is a public API change.
   Audit consumers before touching it.

**Verification:**

- `apps/ui/src/table/Hand/fan.test.ts` pins the *rule*, not the arithmetic (the insertion arc comes
  round from the left, bulges about half a step, collapses to a straight line in the last slot).
  Assertions of that shape survive a change of scale and still catch a mistake.
- The playground's `Interaction audit` page, plus hands-on drag / insert / hand-limit carry-back at
  1× and 2×.

**Size:** ~7 files, ~25 constants, of which the fan and the hand are the only ones carrying
behaviour. Small in lines, large in risk — it ships alone.

---

## Stage 5 — The leftovers

**5a — The caps.** Six hard limits that scaled content will collide with:
`clamp(40px, 8vw, 120px)` (Stats), `clamp(40px, 7vw, 96px)` (Lobby), `min(640px, 92vw)` and
`min(1040px, 95vw)` (Modal), `min(720px, 90vh)` (VideoPlayer). As tokens they come under the lever
automatically and stop being scattered literals — this is why the design's §9 shrinks once the token
layer exists.

**5b — The 15 type outliers.** `font-size` declarations outside `typography.module.css` — the
documented exceptions (glyphs, icons). A read-through, not a rewrite.

**5c — Shadows and blur.** One decision per class, taken here where the whole picture is visible.

**5d — `@release/web`.** The app has 133 px in 14 files of its own. It inherits every token for free,
but its own literals need the same stage-2 treatment. Separate track, separate owner.

---

## Stage 6 — Activation

Needs §10.1 and §10.3 from the design.

**Work:** `--ui-scale` stops being `1` and becomes a function of viewport width — a single `clamp()`,
no media queries (the kit has none today and should keep it that way). If §10.3 lands on a user
setting, this is where it is wired.

**QA matrix — the point being that width, not the device, is the variable:**

| case | expected |
|---|---|
| 1280 / 1920 CSS px | unchanged from today |
| 2560 CSS px | mid-ramp |
| 3840 CSS px | full scale |
| 4K panel at 200% system scaling (= 1920 CSS px) | **unchanged** — the trap this whole design exists to avoid |
| 3840 monitor, half-width window | scales as 1920, not as 3840 |
| ultrawide 3840×1080 | §10.1's height question, answered live |

---

## Out of scope

- **The playground's own chrome** — 2427 px across 50 files. Navigation, the technical bar and the
  kit pages are a developer tool; only what renders inside a story's demo area is kit code.
- **Input thresholds, durations, reading delays** — excluded by the design's §5 policy, not by
  oversight. `DRAG_THRESHOLD = 6px` is about a human hand; 220ms does not become 440ms because the
  screen got bigger.
- **Raster art** — softens when enlarged, and survives on exactly one playground page. Card faces are
  drawn in code and scale cleanly.

---

## Risk register

| risk | stage | early signal | mitigation |
|---|---|---|---|
| A rounding in stage 2 is actually a mistake | 2 | visual diff on the area's story | P2 keeps it reviewable; one area per PR |
| A raw px creeps back into a converted area | 2 | CI | stylelint disallowed-list, enabled per directory as it converts |
| Fan geometry breaks at scale ≠ 1 | 4 | `fan.test.ts` red, or the insertion arc visibly wrong | ship stage 4 alone; test pins the rule, not the numbers |
| `CARD_W` removal breaks a consumer | 4 | typecheck | audit the index export before touching it |
| Scaled content hits an unscaled cap | 5a | visible at 2× once stage 3 lands | the six caps are known and listed |
| The ramp doubles a 4K@200% machine | 6 | QA matrix row 4 | key on viewport width, never `devicePixelRatio` |

---

## Volume, in one table

| stage | files | values | risk |
|---|---|---|---|
| 0 — decisions | 1 doc | — | — |
| 1 — vocabulary | 1 | ~25 tokens defined | none (no consumers) |
| 2 — normalisation | 56 | ~690 substitutions | medium, but split arbitrarily |
| 3 — multiplier | 2 | ~25 definitions | none (P1) |
| 4 — geometry | ~7 | ~25 constants | **high** |
| 5 — leftovers | ~20 | ~25 | low |
| 6 — activation | 1 | 1 | medium (QA matrix) |
