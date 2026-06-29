# apps/ui — `@release/ui`

Shared component library — TypeScript + React + CSS Modules + design tokens; no Tailwind, no i18n (all copy arrives via props). **Additive** to the root [CLAUDE.md](../../CLAUDE.md); cross-cutting monorepo rules live there and are not repeated here. This file owns the rules for things `@release/ui` is the source of truth for.

## Typography Rule

- **All text is set through the `<Typography>` component from `@release/ui`** — the single typography path for both the frontend (`@release/web`) and the library. Do not write `font-family` / `font-size` / `text-transform` / `letter-spacing` by hand, and do not use Tailwind text utilities. Color / spacing / layout stay local (via `className`).
- Two ways to pick a style:
  - **Semantic variant** (primary): `<Typography variant="tag">…</Typography>`.
  - **Raw `base` + `tk`** (long tail, when no variant fits): `<Typography base="mono-strong" tk="tk-02">…</Typography>`. Exactly one of `variant` / `base` is required; `tk` is valid only alongside `base`.
- **Source of values — the scale [`src/design/typography.module.css`](src/design/typography.module.css)** (base = family + size + weight + case; `tk-NN` = tracking). The component applies exactly those classes and hardcodes nothing. Missing a step — add the base/`tk` to the scale rather than bending text to a near match. Don't swap fonts (Fira Mono `--font-text` and JetBrains Mono `--font-mono` are distinct roles).
- **Live showcase — the playground `Typography` page** ([`src/design/TypographyPreview.tsx`](src/design/TypographyPreview.tsx)): all bases, tk variations, and the curated component variants. Check it before working on text and keep it in sync on changes.
- **`composes` from the scale is legacy.** The library's internal components migrate from `composes` to `<Typography>` in phases (separate plan). New code goes through the component from the start.
- Allowed locally outside the component: glyphs / icons (`font-size` only), a `line-height` nuance for the rhythm of a specific spot, an inline weight accent (like `<b>`), and a contextual `text-transform` reset (when an element sits inside an `uppercase` parent).

## Component Composition Rule

- **Prefer composition over polymorphism for primitives.** A primitive (`Button`, `Input`, …) renders one element and owns one responsibility. When you need extra behaviour on top — e.g. copy-to-clipboard with a transient "copied" label — add a sibling component that wraps the primitive and reuses its styles (`CopyButton` renders a `Button` and owns only the copy concern) rather than growing the behaviour onto the primitive itself.
- **Wrappers add behaviour; primitives stay unaware of them.** A wrapper like `CopyButton` or `MenuButton` composes `Button` and layers its own concern (clipboard, menu focus/roving) on top; the primitive carries no copy / menu knowledge.
