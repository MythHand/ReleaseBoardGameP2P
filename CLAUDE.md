# CLAUDE.md — Project Guide

## Overview

**Release любой ценой** — a P2P web version of the board card game.
Rules and card mechanics: [`docs/rules-board-game.md`](./docs/rules-board-game.md).

**Design specs live in [`docs/specs/`](./docs/specs/)** (`YYYY-MM-DD-<topic>-design.md`).

The app is in early scaffolding. Game logic (full game screens) is out of scope for this phase and lives in later specs. What exists today: the monorepo skeleton, the UI component library, and the frontend shell.

---

## Monorepo Layout

| Path | Package | Purpose |
|---|---|---|
| `apps/ui` | `@release/ui` | Shared component library — TypeScript + CSS Modules + design tokens; i18n-agnostic |
| `apps/playground` | `@release/playground` | Vite sandbox for developing and previewing UI components in isolation |
| `apps/frontend` | `@release/web` | Main web app — Vite + React + CSS Modules + react-i18next |
| `apps/peerserver` | `@release/peerserver` | Self-hosted PeerJS signaling server (Express + `ExpressPeerServer`), shipped as a Docker image to GHCR |
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
- CSS Modules only — purely for component rendering

### `@release/web` (frontend)
- Vite + React 18 + TypeScript
- CSS Modules for component styles, design tokens via `@release/ui/tokens.css`
- react-i18next — translation catalogs under `src/locales/en/` and `src/locales/ru/`
- Consumes `@release/ui` from source via Vite alias

### `@release/peerserver`
- TypeScript (NodeNext ESM), Express 4, `peer` (PeerServer)
- Env config: `PORT` / `PEER_PATH` / `PEER_KEY`; `/health` endpoint
- Docker image via `apps/peerserver/Dockerfile`; published to GHCR by `.github/workflows/peerserver.yml` on `peerserver-v*` tags
- Dev: `pnpm dev:p2p` runs it alongside the frontend

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

Styling is uniform across all packages: **CSS Modules + design tokens.**

- Every styled component/page has a co-located `*.module.css`. Colors, fonts,
  gradients, timings come from the design tokens in
  [`apps/ui/src/design/tokens.css`](./apps/ui/src/design/tokens.css) via
  `var(--*)` — never hardcode a color (`#hex`, `rgb()`, named). Missing a
  color → add a token there first.
- All text is set through the `<Typography>` component from `@release/ui`
  (semantic `variant`, or raw `base` + `tk` for the long tail) — no
  hand-written font declarations and no `composes` from the scale in module
  CSS. Full rule: [apps/ui/CLAUDE.md](./apps/ui/CLAUDE.md#typography-rule).
- Spacing/sizing are plain px values; use logical properties
  (`padding-inline`, `margin-block-start`) — stylelint enforces this.
- **No Tailwind anywhere** — removed in
  [#47](https://github.com/MythHand/ReleaseBoardGameP2P/issues/47); stylelint
  rejects its at-rules. For the screens the ui-kit also ships
  (`screens/Start`, `screens/Lobby`), the ui-kit styles are the visual source
  of truth — check the playground before restyling the frontend.

---

## Code Comments Rule

- **Write code comments in English.** Do not add Russian comments to source files (existing Russian comments are legacy).

---

## i18n Rule

- **`@release/web`** uses react-i18next with `i18next-browser-languagedetector`.
- Translation catalogs live under `apps/frontend/src/locales/en/` and `apps/frontend/src/locales/ru/`.
- **No string literals in `.tsx` files** — all user-visible text must go through `t()` or translation keys.
- **`@release/ui`** is i18n-agnostic — it does not import or use i18next. All display copy is passed in as props by the consuming app.

---

## Animations Rule

- Анимации собираются **из модулей**, а не пишутся полётами вручную. Словарь и хелперы — в `apps/ui/src/animations/`: пресеты через `play('name', el, params)` плюс `move`, `jitter`, `wait`, `nextFrames`. Нужен новый кусочек — оформляй его модулем, потом используй.
- **Источник состояния работы с анимациями — страница плейграунда `Interaction audit`** (`apps/playground/stories/AnimationAuditStory`): какие модули готовы (со статусами), какие сценарии из них собраны, и что требует доработок. Перед работой над анимациями сверяй актуальные статусы там; при изменениях вписывай их обратно в эту страницу.

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
