# apps/ui — `@release/ui`

Shared component library — TypeScript + React + CSS Modules + design tokens; no i18n (all copy arrives via props). **Additive** to the root [CLAUDE.md](../../CLAUDE.md); cross-cutting monorepo rules live there and are not repeated here. This file owns the rules for things `@release/ui` is the source of truth for.

## Typography Rule

- **All text is set through the `<Typography>` component from `@release/ui`** — the single typography path for both the frontend (`@release/web`) and the library. Do not write `font-family` / `font-size` / `text-transform` / `letter-spacing` by hand, and do not use raw font/size/tracking declarations outside `composes` from the shared typography scale. Color / spacing / layout stay local (via `className`).
- Two ways to pick a style:
  - **Semantic variant** (preferred): `<Typography variant="tag">…</Typography>`.
  - **Raw `base` + `tk`** (long tail, when no variant fits): `<Typography base="mono-strong" tk="tk-02">…</Typography>`. Exactly one of `variant` / `base` is required; `tk` is valid only alongside `base`.
- **Source of values — the scale [`src/design/typography.module.css`](src/design/typography.module.css)** (base = family + size + weight + case; `tk-NN` = tracking). The component applies exactly those classes and hardcodes nothing. Missing a step — add the base/`tk` to the scale rather than bending text to a near match. Don't swap fonts (Fira Mono `--font-text` and JetBrains Mono `--font-mono` are distinct roles).
- **Live showcase — the playground `Typography` page** ([`TypographyPreview.tsx`](../playground/stories/foundations/TypographyPreview.tsx)): all bases, tk variations, and the curated component variants. Check it before working on text and keep it in sync on changes.
- **`composes` from the scale is legacy.** The library's internal components migrate from `composes` to `<Typography>` in phases (separate plan). New code goes through the component from the start.
- Allowed locally outside the component: glyphs / icons (`font-size` only), a `line-height` nuance for the rhythm of a specific spot, an inline weight accent (like `<b>`), and a contextual `text-transform` reset (when an element sits inside an `uppercase` parent).

## Color Rule

- **Colors are design tokens only.** In CSS Modules never hardcode a color literal — no `#hex`, `rgb()/hsl()`, or named colors. Reference the `var(--token)` custom properties from [`src/design/tokens.css`](src/design/tokens.css) (`var(--fg)`, `var(--bg)`, `var(--surface-1)`, `var(--brand-green)`, `var(--cat-attack)`…). Opacity variants compose on a token (`color-mix(in srgb, var(--fg) 18%, transparent)`), not a raw `rgb(255 255 255 / 18%)`.
- **Source of values — [`src/design/tokens.css`](src/design/tokens.css).** Missing a color → add a token there, don't inline a raw value. Tokens are the single surface consumed across all packages via `var(--*)`, so a literal here breaks theming downstream.

## Component Composition Rule

- **Prefer composition over polymorphism for primitives.** A primitive (`Button`, `Input`, …) renders one element and owns one responsibility. When you need extra behaviour on top — e.g. copy-to-clipboard with a transient "copied" label — add a sibling component that wraps the primitive and reuses its styles (`CopyButton` renders a `Button` and owns only the copy concern) rather than growing the behaviour onto the primitive itself.
- **Wrappers add behaviour; primitives stay unaware of them.** A wrapper like `CopyButton` or `MenuButton` composes `Button` and layers its own concern (clipboard, menu focus/roving) on top; the primitive carries no copy / menu knowledge.

## Card Components

The card face is code-composed (layered graphics + text), not a flat image, and shows up in two shapes. They are **not copies of each other** — they share one base and split by responsibility:

| Piece | Path | Owns | Used by |
|---|---|---|---|
| `ComposedFace` | `cards/CardParallax/ComposedFace.tsx` | The layers of a card face (background / panel / grid / illustration / category / title / desc). Pure render, no state — driven by an external deflection `p`. | Both cards below. |
| `useCardTilt` | `cards/useCardTilt.ts` | The tilt engine: pointer → deflection `p`, hover, and the whole-card `transform` (lift + scale + rotate). **The single source of the tilt math.** | Both cards below. |
| `Card` | `primitives/Card/Card.tsx` | The **full game card** — the interactive primitive: flip (face↔back), states (`playable`/`selected`/`disabled`), glow, click/keyboard. Renders its face via `CardFace`. | Table, hand, piles, Stats. |
| `CardParallax` | `cards/CardParallax/CardParallax.tsx` | The **display-only card** — just face + tilt, no flip/states/click. | Previews and the Rules hover-zoom overlay. |

- Mental model: **`Card` = «карта, с которой играют»** (interactive), **`CardParallax` = «карта, которую показывают»** (showcase). Both render the same `ComposedFace` with the same `useCardTilt` engine — hence one face, one tilt engine, no duplication.
- `CardFace` (`primitives/Card/CardFace.tsx`) is the swap point inside `Card`: composed face by default, flat PNG art as fallback or when `png` is forced (the playground **OG Card (PNG)** page — the one place PNG survives).
- Composed faces are localized (`CARD_CONTENT[id][lang]`); the language comes from `CardLangProvider` (`cards/cardLang.tsx`). A consumer wraps its card-bearing subtree in it; without a provider a face falls back to `ru`.
