# Release любой ценой

A peer-to-peer web version of the **Release любой ценой** board card game — a strategic
card game about the real grind of software development (bugs, surprise events, rivals'
attacks; release first to win).

The monorepo skeleton, the shared UI component library, the frontend shell, and the
P2P networking layer (WebRTC via PeerJS, with a self-hosted signaling server) exist
today. The in-game board screens come in later phases.

Game rules and card mechanics: [`docs/rules-board-game.md`](./docs/rules-board-game.md).

## Monorepo layout

A pnpm workspace under `apps/*` and `packages/*`:

| Path | Package | What |
|------|---------|------|
| `apps/ui` | `@release/ui` | Shared component library — TypeScript + CSS Modules + design tokens; i18n-agnostic |
| `apps/playground` | `@release/playground` | Vite sandbox for developing UI components in isolation (route per story) |
| `apps/frontend` | `@release/web` | Main web app — Vite + React + CSS Modules |
| `apps/peerserver` | `@release/peerserver` | Self-hosted PeerJS signaling server — Express + `ExpressPeerServer`, shipped as a Docker image |
| `packages/translation` | `@release/translation` | i18next setup + `en`/`ru` catalogs + typed keys; the app's single i18n surface |
| `packages/lint` | `@release/lint` | Shared Biome / Stylelint / TypeScript configs |

The frontend and playground consume `@release/ui` **from source** via a Vite/tsconfig alias —
no build step for the library.

### Signaling

`apps/peerserver` brokers the WebRTC handshake — peer-ID registration and SDP/ICE relay.
Game traffic itself flows peer-to-peer and never reaches it, so it holds no game state and
no game rules.

It is optional in development — see Quick start below. Configuration, the Docker image,
the production stack behind Caddy, and the TURN caveat are documented in
[`apps/peerserver/README.md`](./apps/peerserver/README.md).

## Requirements

- Node `>=24`
- [pnpm](https://pnpm.io) (`pnpm@9.15.0`, see `packageManager` in `package.json`)

## Quick start

```bash
pnpm install

pnpm dev            # frontend            → http://localhost:5173
pnpm dev:playground # component sandbox   → http://localhost:5180/playground/
pnpm dev:all        # frontend + playground together (the frontend's
                    # /playground/ link proxies to the running playground)
pnpm dev:p2p        # frontend + local signaling server on :9000
```

`pnpm dev` alone talks to the public PeerJS broker, which is enough for most work.
Use `pnpm dev:p2p` when you need to exercise signaling against your own server.

## Common commands

```bash
pnpm build      # build all packages (pnpm -r build)
pnpm typecheck  # type-check all packages
pnpm test       # run all tests
pnpm lint       # Biome (JS/TS) + Stylelint (CSS) across the workspace
pnpm format     # Biome format --write
```

## Stack

- **pnpm workspaces**, **TypeScript 6**, **Vite**, **React 19**
- **CSS Modules** for component styles, design tokens via `@release/ui/tokens.css`
- **i18next** via `@release/translation` — English + Russian; the app never imports
  `react-i18next` directly
- **PeerJS** — WebRTC signaling; game state lives on the peers
- **Express** + `peer` — the self-hosted signaling server (`apps/peerserver`)
- **Biome** lints/formats JS/TS; **Stylelint** lints CSS; **Vitest** for tests

## Contributing / agent guidance

Architecture, per-app conventions, and the styling / i18n / signaling rules live in
[`CLAUDE.md`](./CLAUDE.md) — read it before making changes. In short: `@release/ui` stays
CSS-Modules + i18n-agnostic (copy via props); the frontend uses CSS Modules + design tokens;
the signaling server holds no game rules.

## License

Licensed under the **GNU Affero General Public License v3.0 or later** (AGPL-3.0-or-later) —
see [`LICENSE`](./LICENSE).

Copyright (C) 2026 Dmitry Togulev ([@dimbo-design](https://github.com/dimbo-design)).

Building other projects on top of this is welcome — keep the attribution and, per the AGPL,
keep your version's source open (this closes the "fork, change a couple of lines, ship it
closed/hosted for profit" loophole).

> **TODO (before the final release):** add per-file SPDX headers
> (`// SPDX-License-Identifier: AGPL-3.0-or-later`) across the source. Not required for the
> license to apply, but recommended for AGPL — do a dedicated pass before release.
