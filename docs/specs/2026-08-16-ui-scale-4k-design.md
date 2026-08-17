# Scaling the interface up to 4K — Design

Russian version: [`2026-08-16-ui-scale-4k-design.ru.md`](./2026-08-16-ui-scale-4k-design.ru.md).

The interface is sized for a 1920-wide viewport and reads small on a 4K monitor running at 100%
system scaling. This is the plan for giving the whole kit a single scale multiplier, the inventory
of what that touches, and the order that lets it land without a day where everything is broken.

**Status: proposal.** Nothing here is implemented. It is written to be argued with — the open
questions at the end are the parts where a second opinion is worth most.

---

## 1. What "4K" actually means here

CSS never sees the panel. It sees the viewport in CSS pixels, and that is what the plan must key on:

- A 4K display at **200% system scaling** reports **1920 CSS px**. That machine already looks
  correct and must not be touched.
- A 4K display at **100% scaling** reports **3840 CSS px**. That is the case being solved.
- The browser window is not the screen. A 3840-wide monitor with a half-width window is 1920.

So the trigger is **viewport width, continuously**, and never `devicePixelRatio` or
`@media (resolution)`. Keying on device pixels would double the size on exactly the machine that was
already right.

---

## 2. The codebase this lands in

Relevant facts, all verified rather than assumed:

- **Monorepo.** `@release/ui` is the component kit; `@release/web` (the app) and `@release/playground`
  (the sandbox) consume it from source. Vite + React 19, no SSR.
- **CSS Modules + design tokens.** No Tailwind (removed deliberately). Colours, fonts, timings and a
  few card metrics are CSS custom properties in `apps/ui/src/design/tokens.css`.
- **No `rem` anywhere.** Not one. The root `font-size` is never set.
- **No layout media queries anywhere.** Every `@media` in the kit — nine of them — is
  `prefers-reduced-motion`. There is no breakpoint machinery to extend, and none to fight.
- **All text goes through one scale.** `apps/ui/src/design/typography.module.css` holds the type
  bases; a project rule forbids hand-written `font-size` in components. This turns out to matter a
  lot (see §4).
- **Some layout is already relative.** 158 sites use `%`, `fr`, `flex` or container units. The card's
  corner radius is in `cqw` off `container-type: inline-size`. Card faces are drawn in code, not
  raster — they stay sharp at any size.

---

## 3. Inventory

### CSS

| where | px occurrences | files |
|---|---|---|
| `@release/ui` (the kit) | **733** | 56 |
| `@release/web` (the app) | 133 | 14 |
| `@release/playground` | 2427 | 50 |

Those 733 occurrences collapse to **93 distinct values**.

The playground's 2427 are **out of scope**: navigation, the technical bar and the kit pages are a
developer tool. What must scale is what renders inside a story's demo area, and that is kit code.

### The 733, split by magnitude

| size | count | what it is | disposition |
|---|---|---|---|
| ≤ 2px | **123** | borders, hairlines, thin shadows | **do not scale** — a doubled 1px border destroys the HUD's fineness |
| 3–8px | **136** | small plastic: radii, micro-gaps | decide per class of value |
| > 8px | **474** | box metrics: gaps, padding, sizes | **scale** |

The work is therefore ~474 values plus a policy call on 136 — and the cost is in the triage, not the
typing: the 123 that must be left alone are interleaved with the rest in the same files.

By property, the top of the list: `gap` 94, `padding` 59, `font-size` 55, `border` 46,
`inline-size` 43, `block-size` 32, `margin-block-start` 28, `box-shadow` 25, `border-radius` 21.

### JavaScript

77 numeric literals across ~20 files. Most are inert (icon sizes passed as props). The ones that
carry behaviour are concentrated in the table layer:

- `apps/ui/src/table/Hand/fan.ts` — `CARD_W = 150`, `SPREAD_DEG`, `ARC_DROP`, and the anchors of the
  `handStep(n)` parabola that spaces the hand's fan. **`CARD_W` is exported from the package index**,
  so changing it is a public API change.
- `apps/ui/src/table/Hand/Hand.tsx` — `CARD_H` (derived), `HOVER_LIFT 28`, `NEIGHBOR_PUSH 36`,
  `BAND_PAD 32`, the hand-zoom bounds `ZOOM_MIN_H 240` / `ZOOM_MAX_H 460`, `ZOOM_TOP_AIR`, `ZOOM_GAP`.
- `apps/ui/src/table/CardPreview/useCardPreview.tsx`, `apps/ui/src/cards/CardParallax/config.ts`,
  `apps/ui/src/animations/scatter.ts` (already expressed as *fractions* of card width — these
  survive scaling for free).

If CSS doubles and these do not, the hand's fan spacing, the insertion landing, the grab offset and
every flight path are wrong by the scale factor. This is the one genuinely dangerous area.

---

## 4. The lever

**Proposal: one custom property, `--ui-scale`, defined on `:root` with a default of `1`, consumed by
tokens and by converted declarations as `calc(N * var(--ui-scale))`.**

Two alternatives were considered and rejected:

**`zoom` (or `transform: scale`) on the app root.** One property, everything follows, no CSS
conversion at all. Rejected because it does not remove the dangerous half of the work: under `zoom`,
`getBoundingClientRect()` returns scaled coordinates while `CARD_W` and the fan's placement values
stay unscaled, so the hand computes in two coordinate systems at once. The JS work is a **fixed cost
under either lever** — `zoom` only saves the CSS, and it saves it by switching everything on at once
instead of file by file.

**Rewriting every length in `rem` with a fluid root `font-size`.** The canonical answer, and it has a
real advantage the multiplier lacks (see the open questions). Rejected as the primary mechanism
because it is the same conversion volume, it does not touch the JS constants either, and it cannot be
landed incrementally with a provable no-op.

### The highest-leverage single file

40 of the 55 `font-size` declarations live in `typography.module.css`, and the kit's typography rule
forces all text through it. Scaling that one file scales every piece of text in every package. The
remaining 15 are the rule's documented exceptions (glyphs, icons) and need a read-through, not a
rewrite.

---

## 5. Policy: what scales and what does not

This has to be written down before the first edit, or it drifts across contributors.

**Scales:** box metrics (width/height/gap/padding/margin above ~8px), type, corner radii, card
geometry, shadow offsets.

**Does not scale:**

- **Borders and hairlines** (≤2px). A 1px rule at 2× is a 2px rule, and the HUD's thinness is the look.
- **Input thresholds.** `DRAG_THRESHOLD = 6px` is about a human hand, not about layout. Doubling it
  makes picking up a card twice as sluggish.
- **Durations and easings.** 220ms does not become 440ms because the screen got bigger.
- **Reading delays** (e.g. the 90ms grace when leaving a preview slot) — also about the human.
- **Blur radii** — arguable; they do not scale linearly with size and should be decided as a class.

---

## 6. The property that makes this safe

At `--ui-scale: 1`, `calc(16px * var(--ui-scale))` **is** `16px`. A converted file renders
pixel-identically to before.

That turns the whole conversion into a sequence of provable no-ops. Review is "nothing on screen
changed", each area can ship as its own small PR, and there is never a single flip-everything commit.
The multiplier is switched on only after the conversion is complete — and if it stalls halfway, the
product is still shippable.

---

## 7. Stages

**1 — The lever and a way to turn it.** `--ui-scale: 1` in `tokens.css`, plus a switch in the
playground's technical bar. A few lines, but from here every later step can be **looked at** at 1×
and 2× without owning a 4K monitor.

**2 — Type.** One file, 40 values. Every text in the project scales. Verified on the playground's
`Typography` page.

**3 — Card geometry.** On its own, mixed with nothing. The only step where the no-op invariant does
not come for free, because it is a behavioural refactor: `CARD_W` stops being a module constant.
Guarded by `apps/ui/src/table/Hand/fan.test.ts`, which pins the *rule* rather than the arithmetic
(the insertion arc comes round from the left, bulges about half a step, collapses to a straight line
in the last slot) — assertions of that shape survive a change of scale and still catch a mistake.
Cross-checked live on the playground's `Interaction audit` page.

**4 — Spacing, area by area:** `primitives` → `blocks` → `table` → `screens`. Primitives first: they
sit under everything, so an error surfaces on many screens while few files have changed. ~500
substitutions across 56 files — mechanical, and splittable into as many PRs as wanted.

**5 — Hairlines, radii, shadows.** One decision per class, applied at the end when the whole picture
is visible.

---

## 8. Guards

- **The no-op invariant** (§6) is the review criterion for stages 2 and 4.
- **Stylelint** `declaration-property-value-disallowed-list` scoped to already-converted directories:
  a raw px in a converted area stops passing CI, so conversion cannot silently regress. The project
  already leans on machine-checked facts over conventions (there are tests asserting the animation
  docs match the code).
- **The playground is the visual surface.** Every area has a story; with the stage-1 switch, each
  converted area is inspected at 1× and 2× immediately.

---

## 9. What the multiplier does not solve

- **Six hard caps** that scaled content will collide with:
  `clamp(40px, 8vw, 120px)` (Stats), `clamp(40px, 7vw, 96px)` (Lobby), `min(640px, 92vw)` and
  `min(1040px, 95vw)` (Modal), `min(720px, 90vh)` (VideoPlayer). Short, known, hand-edited.
- **Raster art** softens when enlarged. The kit draws card faces in code; PNG survives on exactly one
  playground page.
- **The excluded values in §5** — excluded by policy, which is why the policy has to exist in writing.

---

## 10. Open questions

These are the decisions the plan deliberately leaves open.

**1. The ramp.** What function maps viewport width to scale? A continuous `clamp()` is the obvious
default, but the endpoints are a product decision: where does growth start, where does it cap, and is
the cap hard? Related: should height participate? A 3840×2160 monitor and a 3840×1080 ultrawide have
the same width and very different amounts of vertical room.

**2. Multiplier vs `rem` — the accessibility argument.** `calc(N * var(--ui-scale))` ignores the
user's browser font-size preference; a `rem`-based scale respects it. That is a genuine advantage of
the rejected alternative, and it is worth challenging the choice on those grounds. A hybrid is
possible — type in `rem` off a scaled root, everything else through the multiplier — at the cost of
two mechanisms instead of one.

**3. Automatic, manual, or both.** Browser zoom already solves this for the user who knows about it.
Is an automatic ramp the right call, or should the scale be an explicit setting? If both, which wins?

**4. How the JS learns the scale.** Options: read it from CSS with `getComputedStyle` once and on
resize; pass it through React context; or make the geometry take the card's measured width as an
argument. The last is the most honest (the fan would compute from what is actually rendered) and the
most invasive.

**5. Hairlines at 2×.** Keep 1px — physically thinner on a dense display, visually crisper — or scale
them so proportions hold? This changes the character of the HUD either way.

**6. Order.** The plan converts primitives first for early error surfacing. The opposite argument is
to convert one screen end-to-end first, to learn the real cost per file before committing to 56 of
them.
