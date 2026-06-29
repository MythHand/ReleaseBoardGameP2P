# Release любой ценой

A peer-to-peer web version of the **Release любой ценой** board card game — a strategic
card game about the real grind of software development (bugs, surprise events, rivals'
attacks; release first to win).

The project is in early scaffolding: the monorepo skeleton, the shared UI component
library, and the Tailwind-themed frontend shell exist today. Full game screens and the
P2P networking layer (WebRTC via PeerJS) come in later phases.

Game rules and card mechanics: [`docs/rules-board-game.md`](./docs/rules-board-game.md).

## Monorepo layout

A pnpm workspace under `apps/*`:

| Path | Package | What |
|------|---------|------|
| `apps/ui` | `@release/ui` | Shared component library — TypeScript + CSS Modules + design tokens; i18n-agnostic |
| `apps/playground` | `@release/playground` | Vite sandbox for developing UI components in isolation (route per story) |
| `apps/frontend` | `@release/web` | Main web app — Vite + React + Tailwind v4 + react-i18next |

The frontend and playground consume `@release/ui` **from source** via a Vite/tsconfig alias —
no build step for the library.

## Requirements

- Node `>=24`
- [pnpm](https://pnpm.io) (`pnpm@9.15.0`, see `packageManager` in `package.json`)

## Quick start

```bash
pnpm install

pnpm dev            # frontend           → http://localhost:5173
pnpm dev:playground # component sandbox   → http://localhost:5174/playground/
pnpm dev:all        # frontend + playground together (the frontend's
                    # /playground/ link proxies to the running playground)
```

## Common commands

```bash
pnpm build      # build all packages (pnpm -r build)
pnpm typecheck  # type-check all packages
pnpm test       # run all tests
pnpm lint       # Biome (JS/TS) + Stylelint (CSS) across the workspace
pnpm format     # Biome format --write
```

## Stack

- **pnpm workspaces**, **TypeScript 5**, **Vite 6**, **React 19**
- **Tailwind v4** (frontend only), themed off the UI design tokens via `@theme`
- **react-i18next** (frontend) — English + Russian
- **PeerJS** — WebRTC signaling; game state lives on the peers
- **Biome** lints/formats JS/TS; **Stylelint** lints CSS; **Vitest** for tests

## Contributing / agent guidance

Architecture, per-app conventions, and the styling / i18n / signaling rules live in
[`CLAUDE.md`](./CLAUDE.md) — read it before making changes. In short: `@release/ui` stays
CSS-Modules + i18n-agnostic (copy via props); the frontend is Tailwind-first; the backend
holds no game rules.
