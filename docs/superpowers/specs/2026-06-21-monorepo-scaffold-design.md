# Monorepo restructure + 3-app scaffold — Design

**Date:** 2026-06-21
**Project:** ReleaseBoardGameP2P ("Release любой ценой")
**Scope:** Restructure the single-app repo into a pnpm-workspace monorepo, migrate the existing visual layer to TypeScript, and scaffold three apps (playground, frontend, backend) plus project docs.

> This spec covers **scaffolding + restructure + TS migration only**. It does **not** build the game itself — game logic, P2P networking, and game screens are later specs.

## Goal

Turn the current root-level Vite/React (JavaScript) app into a workspace with a shared UI library and three runnable apps, with tooling (Biome, Stylelint, Tailwind, Vitest) and onboarding docs (CLAUDE.md / AGENTS.md) in place. All work lands on a migration branch.

## Decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Fate of root `src/` | Move into a shared workspace package `@release/ui`; root `src/` removed |
| 2 | TypeScript | Migrate the entire UI package to TS now |
| 3 | Styling | Keep CSS Modules as authored; expose design tokens to Tailwind via `@theme` |
| 4 | Backend role | P2P signaling / lobby server only — no game rules server-side |
| 5 | Backend framework | Fastify (HTTP) + `ws` (WebSocket), TypeScript |
| 6 | Layout | All under `apps/`; `@release/*` scope |
| 7 | Docs | `CLAUDE.md` full guide; `AGENTS.md` is a pointer to it |
| 8 | Process | Land on a migration branch, not the current branch |
| 9 | i18n | Frontend uses react-i18next (English + Russian); no string literals in TSX |

## Target structure

```
ReleaseBoardGameP2P/
├─ package.json            # workspace root — scripts + devDeps only, no app code
├─ pnpm-workspace.yaml     # packages: apps/*
├─ biome.json              # JS/TS lint + format (root)
├─ tsconfig.base.json      # shared TS config, extended per package
├─ CLAUDE.md
├─ AGENTS.md               # → pointer to CLAUDE.md
├─ docs/
│  ├─ rules-board-game.md
│  └─ superpowers/specs/2026-06-21-monorepo-scaffold-design.md
└─ apps/
   ├─ ui/          # @release/ui          — migrated src/, TS, CSS Modules + tokens, Stylelint
   ├─ playground/  # @release/playground  — Vite, depends on @release/ui
   ├─ frontend/    # @release/web         — Vite+TS+React+Tailwind, depends on @release/ui
   └─ backend/     # @release/server      — Fastify + ws, TS
```

The current root Vite app (`index.html`, `vite.config.js`, `src/main.jsx`, `src/app/App.jsx`) becomes `apps/frontend`. Everything reusable in `src/` (primitives, table, screens, boot, cards, animations, design tokens) moves to `apps/ui`. Root `src/` is gone.

## Components

### `@release/ui` — shared library
- **TS migration**: all `.jsx`→`.tsx`, `.js`→`.ts`; add prop interfaces; type the card catalogue/categories with real types (the game logic will lean hardest here, so typing it well pays off).
- **Styling unchanged**: every `.module.css` stays as authored; `tokens.css` remains the single source of truth for design tokens.
- **Public API**: exports primitives (Card, Arrow, Pile, Button, Modal), table components (Hand, Table, ReleaseZone, Seat, MoveHistory, ModesInfo), screens (Start), boot (Loader/Logo/audio), the card catalogue/categories, the animation dictionary, and the design tokens entry (`tokens.css` / `global.css`).
- **Assets**: the `public/assets/` card images move into `apps/ui/assets` and are imported/re-exported so any consuming app resolves them through Vite — no duplicated `public/` tree per app.
- **Tests**: Vitest + one smoke test (e.g. Card renders).

### `apps/playground` — `@release/playground`
- The existing Storybook-like sandbox, migrated to TS, now a standalone Vite + React app.
- Imports `@release/ui` (replaces the old `@/` alias into root `src/`).
- Story registry stays; each story renders an isolated UI component/scene.

### `apps/frontend` — `@release/web`
- The real game app. Vite + TS + React + Tailwind v4.
- Imports `@release/ui`.
- **Tailwind**: `@theme` pulls in the design tokens so utilities like `bg-surface-1` / `text-cat-release` resolve to the existing CSS variables. CSS Modules from `@release/ui` render untouched; Tailwind covers the frontend's own layout/pages.
- **Lint split**: Biome → `.ts/.tsx/.js`; Stylelint → `.css/.module.css`.
- **i18n (react-i18next)**: English + Russian. Message catalogs as JSON under `apps/frontend/src/locales/{en,ru}/*.json`, keyed by feature/namespace. All user-facing copy lives in catalogs — **no string literals in `.tsx`**; components read text via `useTranslation()`. Language switch + detection wired in the frontend.
- **Shared UI text**: `@release/ui` stays i18n-agnostic — components that render copy receive their strings via **props**, and the frontend passes translated strings in. The library never imports react-i18next. Existing Russian literals in `ui` (boot lines, Start screen) get lifted to props as they're touched.
- Starts from the migrated `App` shell; the full game UI comes in a later spec.

### `apps/backend` — `@release/server`
- Fastify (HTTP) + `ws` (WebSocket), TypeScript.
- **Role**: P2P signaling / lobby only. Create/join a session, broker WebRTC offer/answer (or relay codes) between peers, track live sessions in memory. **No game rules server-side** — game state lives on the peers.
- **Endpoint sketch** (refined during implementation):
  - `POST /sessions` — create a session, returns id/join code
  - `POST /sessions/:id/join` — join an existing session
  - `GET /sessions/:id` — session status / participants
  - `ws /sessions/:id/signal` — signaling channel for peer connection setup
- **Tests**: Vitest + a session create/join smoke test.

## Tooling baseline
- **pnpm workspaces**, Node 20+. Root scripts fan out across packages (`pnpm -r dev`, `pnpm -r build`, `pnpm -r lint`).
- **Biome** — lint + format for TS/JS across all packages (root `biome.json`).
- **Stylelint** — CSS / CSS Modules linting.
- **Tailwind v4** — frontend only, theming off the shared tokens.
- **react-i18next** — frontend only (English + Russian); JSON catalogs, no literals in TSX. UI package stays i18n-agnostic (text via props).
- **Vitest** — test runner across packages; scaffolded with config + one smoke test per package. Full coverage is later work.
- **TypeScript** — `tsconfig.base.json` at root, extended per package.

## Docs
- **CLAUDE.md** — full project guide: monorepo layout, the 3 apps + UI package, stack per app, pnpm workspace commands (dev/build/lint), the styling rule (CSS Modules stay; Tailwind only for frontend layout, themed off tokens; do not rewrite CSS Modules into Tailwind), the i18n rule (react-i18next in the frontend, English + Russian, no string literals in TSX, UI package text via props), the P2P/signaling architecture, and a pointer to `docs/rules-board-game.md`.
- **AGENTS.md** — short pointer to CLAUDE.md so cross-tool agents (Cursor, Codex, etc.) pick up the same guidance without a second maintained copy.

## Process
- All changes land on a migration branch (e.g. `migration/monorepo-scaffold`), not the current branch.

## Out of scope (later specs)
- Game logic / rules engine.
- P2P networking implementation (WebRTC client, state sync between peers).
- Game screens beyond the migrated shell.
- Full test coverage (only smoke tests are scaffolded here).
- CI/CD pipeline.
