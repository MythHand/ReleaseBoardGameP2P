# Typography component — design

- **Date:** 2026-06-29
- **Status:** Approved (design)
- **Package:** `@release/ui`

## Context

The typography scale already exists and is merged (#35): a two-layer **base + tk**
system in [`apps/ui/src/design/typography.module.css`](../../apps/ui/src/design/typography.module.css),
applied across `@release/ui` via CSS Modules `composes`, documented by the
Typography Rule in [CLAUDE.md](../../CLAUDE.md) and showcased on the playground
`Typography` page ([`TypographyPreview.tsx`](../../apps/ui/src/design/TypographyPreview.tsx)).

Two problems remain:

1. **The frontend (`@release/web`) can't reach the scale.** It is Tailwind-based
   and cannot `composes:` from the library's CSS Modules. So pages hand-roll
   ~80 ad-hoc Tailwind text utilities (`text-[15px] font-mono uppercase tracking-[0.16em]`, …)
   — the exact "ai-slop" [NO_TAILWIND.md](../../NO_TAILWIND.md) asks to remove.
2. **There is no single consumption API for text.** `composes` works inside the
   lib but is invisible to consumers and easy to diverge from.

## Decision

Introduce a `<Typography>` component in `@release/ui` and make it **the canonical
way to render text everywhere** — both the frontend and, over time, the
`@release/ui` internals (which migrate off `composes` onto the component).

`typography.module.css` **stays** as the stylesheet of record: all font / size /
weight / line-height / tracking values live there and remain the single source of
truth for *values*. What changes is *consumption* — components render
`<Typography>` instead of writing `composes:`. The component applies those exact
scale classes; it never hardcodes a px size or font family.

### Risk / dependency (acknowledged)

Making the component canonical reverses the `composes` consumption pattern dimbo
just merged (#35) and codified in the Typography Rule + NO_TAILWIND.md. The
lib-wide migration (M4+) un-winds `composes:` from every internal component and
**must be aligned with dimbo before it lands**. M1–M3 below do not touch his
merged internals, so the first plan is non-conflicting.

## Component API

```tsx
// Curated path (preferred, public)
<Typography variant="tag" className="text-cat-release opacity-85">…</Typography>

// Raw escape hatch (long-tail / exhaustive lib migration)
<Typography base="mono-strong" tk="tk-02" as="h3">…</Typography>
```

- **`variant?: TypographyVariant`** — curated semantic name (table below). Resolves
  to a fixed `{ base, tk? }` pair.
- **`base?: TypographyBase` + `tk?: TypographyTk`** — raw escape hatch, mapping 1:1
  to the scale class names in `typography.module.css`. For combos with no curated
  name (the long tail surfaced during lib migration).
- Exactly **one of `variant` or `base` is required** (enforced by a discriminated
  union type). `tk` is only valid alongside `base`.
- **`as?: ElementType`** — overrides the per-variant default tag.
- **`className?`, `children`, `...rest`** (HTML attrs). Color, margin, layout stay
  the consumer's responsibility via `className`.

Internally the component imports the scale module and joins classes manually
(matching the lib's existing no-`clsx` style):

```ts
const [base, tk] = variant ? VARIANTS[variant] : [baseProp, tkProp]
const className = [scale[base], tk && scale[tk], classNameProp].filter(Boolean).join(' ')
return createElement(as ?? defaultTag, { className, ...rest }, children)
```

`base`/`tk` prop values are typed as unions derived from the scale class names, so
typos fail at compile time and the type list mirrors the CSS.

### Curated variant set (starter — grounded in current frontend usage)

| variant | composes (base + tk) | default tag |
|---|---|---|
| `pageTitle` | `heading-3` + `tk-04` | `h1` |
| `sectionTitle` | `heading-8` + `tk-04` | `h2` |
| `panelTitle` | `subtitle` + `tk-02` | `h3` |
| `body` | `body-lg` | `p` |
| `footnote` | `body-sm` | `p` |
| `tag` | `label` + `tk-16` | `span` |
| `metaLabel` | `label-sm` + `tk-14` | `span` |
| `code` | `code` + `tk-20` | `span` |

Extensible: a new common combo → add one row. If the underlying *base* is missing,
it goes into `typography.module.css` first (per the Typography Rule), then gets a
curated name. Long-tail combos use the raw `base`/`tk` path rather than forcing a
name.

## Files

- `apps/ui/src/primitives/Typography/Typography.tsx` — component (no new CSS file;
  consumes the existing scale module)
- `apps/ui/src/primitives/Typography/index.ts` — re-export default + `TypographyProps`,
  `TypographyVariant`, `TypographyBase`, `TypographyTk`
- `apps/ui/src/primitives/Typography/Typography.test.tsx` — tests
- `apps/ui/src/index.ts` — add to barrel
- [`TypographyPreview.tsx`](../../apps/ui/src/design/TypographyPreview.tsx) — add a
  "Curated variants" section mapping each variant → its base+tk, so the showcase
  stays the live source of truth
- [CLAUDE.md](../../CLAUDE.md) — rewrite the Typography Rule around the component

## Milestones

**M1 — Build the component.** `<Typography>` (curated variants + raw `base`/`tk`
escape hatch, discriminated-union props), barrel export, `TypographyPreview`
"Curated variants" section, and tests.

**M2 — Rewrite the Typography Rule.** Update CLAUDE.md so the canonical guidance
is "render text via `<Typography>`" (curated variant, or raw `base`/`tk`), with
`composes` documented as legacy pending M4 migration. `typography.module.css`
remains the values source of truth.

**M3 — Pilot migration (frontend `start.tsx`).** Migrate the text nodes in
[`apps/frontend/src/pages/start.tsx`](../../apps/frontend/src/pages/start.tsx):
the two `tag` spans → `<Typography variant="tag" className="text-cat-release opacity-85">`,
the description `<p>` → `<Typography variant="body" className="m-0 mb-24 opacity-85">`.
Delete the Tailwind font/text/tracking utilities; keep color/margin/layout. (The
`start-play-cap` etc. are global-CSS nodes, not Tailwind utilities — out of pilot
scope.)

**M4+ — Lib-internal migration (separate plan, after dimbo alignment).** Phased,
per-component: replace `composes:` usages in `@release/ui` with `<Typography>`,
keeping only color/layout in each component's local CSS. The raw `base`/`tk` path
covers combos without a curated name.

The first implementation plan covers **M1–M3** only.

## Testing

`Typography.test.tsx`, matching the `Card` / `Input` / `Modal` test pattern:

- each curated variant renders its expected base (+tk) scale class and correct
  default tag
- the raw `base`/`tk` path renders the matching scale classes
- `as` override changes the element
- `className` is passed through alongside the scale classes
