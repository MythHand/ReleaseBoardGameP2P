# CLAUDE.md — Project Guide

## Overview

**Release любой ценой** — a P2P web version of the board card game.
Rules and card mechanics: [`docs/rules-board-game.md`](./docs/rules-board-game.md).

**Design specs live in [`docs/specs/`](./docs/specs/)** (`YYYY-MM-DD-<topic>-design.md`).

The app is in early scaffolding. Game logic (full game screens) is out of scope for this phase and lives in later specs. What exists today: the monorepo skeleton, the UI component library, and the Tailwind-themed frontend shell.

---

## Monorepo Layout

| Path | Package | Purpose |
|---|---|---|
| `apps/ui` | `@release/ui` | Shared component library — TypeScript + CSS Modules + design tokens; i18n-agnostic |
| `apps/playground` | `@release/playground` | Vite sandbox for developing and previewing UI components in isolation |
| `apps/frontend` | `@release/web` | Main web app — Vite + React + Tailwind v4 + react-i18next |
| `packages/translation` | `@release/translation` | i18next setup + locale catalogs (`en`/`ru`) + typed-key augmentation; consumed by `@release/web` |

Package manager: **pnpm** (workspace defined in `pnpm-workspace.yaml` as `apps/*` and `packages/*`).

---

## Stack Per App

### `@release/ui`
- TypeScript, React 18 (peer dep)
- CSS Modules for component styles
- Design tokens as CSS custom properties (`src/design/tokens.css`, `src/design/global.css`)
- Exports: `@release/ui` → `src/index.ts`, `@release/ui/tokens.css`, `@release/ui/global.css`
- No i18n dependency — all copy is received via props

### `@release/playground`
- Vite + React 18
- Consumes `@release/ui` from source via Vite alias (see UI Consumption below)
- No Tailwind — purely for component rendering

### `@release/web` (frontend)
- Vite + React 18 + TypeScript
- **Tailwind v4** via `@tailwindcss/vite` plugin
- Tailwind tokens bridged from UI design tokens via `@theme` in `src/index.css`
- react-i18next — translation catalogs under `src/locales/en/` and `src/locales/ru/`
- Consumes `@release/ui` from source via Vite alias

---

## Commands

```bash
# Install all workspace deps
pnpm install

# Run the frontend dev server (apps/frontend)
pnpm dev

# Run the playground dev server (apps/playground)
pnpm dev:playground

# Run frontend + playground together (so the frontend's /playground/ link
# proxies to the running playground app). Needed only when using that link.
pnpm dev:all

# Build all packages (pnpm -r build)
pnpm build

# Lint: Biome check (root) + Stylelint across all packages
pnpm lint

# Type-check all packages
pnpm typecheck

# Run all tests
pnpm test
```

The `lint` script runs `biome check .` (root-level) followed by `pnpm -r stylelint` (per-package Stylelint). Biome handles JS/TS formatting and linting. Stylelint handles CSS files.

---

## Styling Rule

Styling is **per-package** — the approach depends on which app the component lives in:

- **`@release/ui` (shared library): CSS Modules only.** Its CSS Modules stay as authored — do not rewrite them into Tailwind. The library must have **no Tailwind dependency** so it stays portable for any consumer.
- **`@release/web` (frontend app): Tailwind first.** Style frontend components with Tailwind utility classes in JSX. Do **not** add new `*.module.css` files to the frontend; use Tailwind utilities (and `@apply`/`@utility`/`@layer` in `index.css` for anything that can't be expressed inline). The shell may keep a small `App.module.css` for page layout, but new components are Tailwind.
- **`@release/playground` (sandbox): CSS Modules.** It renders `@release/ui` in isolation and has no Tailwind.
- Tailwind v4 (frontend only) is themed off the UI design tokens via the `@theme` bridge in `apps/frontend/src/index.css`, so utilities like `bg-surface-1`, `text-brand-green`, `text-cat-release` resolve to the same CSS variables defined in `apps/ui/src/design/tokens.css`. Add new token-backed utilities by extending that `@theme` block.
- Stylelint (`.stylelintrc.json`) allows Tailwind v4 at-rules (`@theme`, `@apply`, `@utility`, `@variant`, `@custom-variant`, etc.).

---

## i18n Rule

- **`@release/web`** uses react-i18next with `i18next-browser-languagedetector`.
- Translation catalogs live under `apps/frontend/src/locales/en/` and `apps/frontend/src/locales/ru/`.
- **No string literals in `.tsx` files** — all user-visible text must go through `t()` or translation keys.
- **`@release/ui`** is i18n-agnostic — it does not import or use i18next. All display copy is passed in as props by the consuming app.

---

## Architecture Rule

- Networking is **peer-to-peer over WebRTC**, signaled by **PeerJS** (hosted or self-hosted `peerjs-server`). There is no game backend.
- Topology is a **star through the host peer**: non-host peers hold one DataChannel to the host, who relays messages to the others.
- **Game state lives on the peers** (browsers). No game rules are evaluated or enforced by any server.
- All P2P code lives in `apps/frontend/src/network/`.

---

## UI Consumption (From Source)

Both `@release/web` and `@release/playground` import `@release/ui` directly from source — no build step required for the library. Vite aliases resolve at dev and build time:

| Import | Resolves to |
|---|---|
| `@release/ui` | `apps/ui/src/index.ts` |
| `@release/ui/global.css` | `apps/ui/src/design/global.css` |
| `@release/ui/tokens.css` | `apps/ui/src/design/tokens.css` |

These aliases are configured in each app's `vite.config.ts`. TypeScript path aliases in `tsconfig.json` mirror the same mappings.
