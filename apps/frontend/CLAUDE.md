# apps/frontend — `@release/web`

Operative rules for editing the frontend. **Additive** to the root [CLAUDE.md](../../CLAUDE.md) — styling (Tailwind-only), i18n (no string literals), and `@release/ui` consumption rules live there and are not repeated here. Architecture rationale: [docs/specs/2026-06-23-frontend-architecture-design.md](../../docs/specs/2026-06-23-frontend-architecture-design.md).

## Feature-Sliced layout (`src/`)

Layers, top to bottom — a module may import only from layers **below** it:

| Layer | Holds |
|---|---|
| `app/` | Composition root: entry (`main.tsx`), generated router (`router.ts`), providers (`SessionProvider`), app-wide libs (`viewTransition`) |
| `pages/` | generouted route modules — thin wrappers over `@release/ui` + features |
| `features/` | User-facing use-cases (hooks over the session/network) |
| `entities/` | Domain models + adapters (`lobby`, `game`, `player`, `card`) |
| `shared/` | Reusable, domain-agnostic (`LanguageSwitch`, helpers) |
| `network/` | Fixed P2P/transport segment (the API layer). Only `entities`/`features` consume it; **nothing else imports `peerjs`**. |

Translations are **not** in `src/` — they live in the `@release/translation` workspace package (i18next init + `en`/`ru` catalogs + typed-key augmentation). `app/main.tsx` imports `@release/translation` to initialise i18n; components get `useTranslation()` **from `@release/translation`** (it re-exports the react-i18next binding). The frontend does not depend on `react-i18next` directly — `@release/translation` is the single i18n surface.

## Rules

- **One-way imports.** A module imports only from layers below it (plus `network` via `entities`/`features`). Use the `~` alias for `src` (`~/app`, `~/entities/...`).
- **Routing is file-based (generouted).** The folder tree under `pages/` mirrors the URL: `_app.tsx` = root layout, `_layout.tsx` = nested layout, `[param].tsx` = dynamic segment, `index.tsx` = the segment's index. Files prefixed `_` (e.g. `_LobbyPage.tsx`) and anything inside a `_`-prefixed directory are ignored by the router. **`app/router.ts` is generated (generouted `output`) — never edit it by hand.**
- **Page tests live in `__tests__/`.** generouted's runtime `<Routes />` eagerly imports every `pages/**/[A-Za-z0-9...]*.{jsx,tsx}` module via a hardcoded `import.meta.glob` (its negation only spares `_`-prefixed files/dirs — *not* `*.test.tsx`). A test file left beside a page is imported at runtime and crashes the dev server (`it is not defined`). So co-locate page tests under a `__tests__/` folder (excluded by generouted's `!/src/pages/**/_*/**`), not next to the page.
- **Errors surface through the root boundary.** `_app.tsx` exports `Catch` (generouted wires it as the top-level route `ErrorBoundary`); it renders `shared/ui/ErrorScreen`. Page render/loader errors land there instead of a blank screen.
- **All visuals come from `@release/ui`.** Pages add layout/Tailwind only — never new visual components, never `*.module.css`.
- **Where new code goes:** a new screen → a thin `pages/` route file + its logic in `features/`/`entities/`; a new interaction → `features/`; a new domain model → `entities/`.
