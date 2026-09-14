# Release любой ценой

A peer-to-peer web version of the **Release любой ценой™** board card game — a strategic
card game about the real grind of software development (bugs, surprise events, rivals'
attacks; release first to win).

The monorepo skeleton, the shared UI component library, the frontend shell, and the
P2P networking layer (WebRTC via PeerJS, with a self-hosted signaling server) exist
today. The in-game board screens come in later phases.

Game rules and card mechanics: [`docs/rules/rules-board-game.md`](./docs/rules/rules-board-game.md).

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

## Origin & attribution

"Release любой ценой" was inspired by the card game
[Deploy or Die](https://www.deployordie.com/)
([deployordie/card-game](https://github.com/deployordie/card-game)), which gave us the core
idea and the general mechanics framework. From there it grew into a separate game: all card
and rule texts are in our own words, the card set and mechanics were reworked, and the balance
and deck size are designed for 2–6 players (instead of 2–4).

Deploy or Die® is a trademark of Kreativní Laboratoř s.r.o.; "Release любой ценой" is not
affiliated with its rights holders.

Thanks to the Deploy or Die team for the inspiration! The copyright notice and MIT license text
from the Deploy or Die repository are preserved in
[`LICENSE-deployordie`](./LICENSE-deployordie).

## License

The repository holds several kinds of material, each under its own terms. Which file falls
under which is mapped path by path in [`REUSE.toml`](./REUSE.toml); the licence texts are in
[`LICENSES/`](./LICENSES).

| What | Where | Licence |
|------|-------|---------|
| **Source code**, and everything not listed below | the rest of the repository | [AGPL-3.0-or-later](./LICENSE) |
| **The game** — card art, card texts, rules text, the rules owner's answers, the early retelling of the game | `apps/ui/src/assets/cards/`, `apps/ui/src/cards/content.ts`, `packages/translation/src/locales/*/rules.json`, `docs/rules/`, `docs/specs/*-rules-decisions.md`, `docs/understanding.md` | [CC BY-NC-SA 4.0](./LICENSES/CC-BY-NC-SA-4.0.txt) |
| **Name and logos** — the logos of Release любой ценой and MythHand, the favicons and app icons made from them, the start-screen photo, the logo's sound in the loader | `apps/ui/src/assets/brand/`, `apps/ui/src/brand/*.svg`, `apps/ui/src/assets/favicons/`, `apps/frontend/public/*.png`, `apps/ui/src/assets/home/photo.jpg`, `apps/ui/src/assets/audio/logo-theme.wav` | All rights reserved, except in the cases its terms allow — [terms](./LICENSES/LicenseRef-AllRightsReserved.txt) |
| **Fonts** — Onest, JetBrains Mono, Fira Mono | `apps/ui/src/assets/fonts/` | [SIL OFL 1.1](./LICENSES/OFL-1.1.txt) — each family's `OFL.txt` beside it |
| **Third-party media** | the files marked so in `REUSE.toml` | their own — listed there with their source |

Copyright (C) 2026 the authors named below for each part, and file by file in `REUSE.toml`.

**The code** is by Dmitry Togulev ([@dimbo-design](https://github.com/dimbo-design)) and Andrey
Konnov ([@ditayler](https://github.com/ditayler)). Building other projects on top of this is
welcome — keep the attribution and, per the AGPL, keep your version's source open.

**The game** is by Dmitry Togulev and Alexey Shtyrnyaev. The art, the card texts and the rules
may be shared and adapted for non-commercial use, with attribution and under the same licence.
Commercial use — printing and selling the cards, or putting the art or the texts into a paid
product — is not covered by this licence. We count playing the game inside a company or another
organisation — at work, team-building included — as commercial use too. On top of the licence,
we permit this one case: the **unmodified** game may be run inside a company or another
organisation for its own staff. Setting up the environment it runs in does not count as
modifying it; what does is defined in
[`TRADEMARKS.md`](./TRADEMARKS.md#what-counts-as-a-modified-version).

**Name and logos.** The names Release любой ценой and MythHand, the MythHand logo, the icons
made from the logos, the start-screen photo and the logo's sound belong to Dmitry Togulev; the
Release любой ценой logo belongs to him and Alexey Shtyrnyaev. These files may be used only as
they are and only in the cases below; any other modified version replaces them with its own. How
the names and logos may be used, and the terms for mods: [`TRADEMARKS.md`](./TRADEMARKS.md).

| Case | Allowed? |
|------|----------|
| Run it for yourself, changed or not, where no one else can reach it — to try it, or to prepare a change | yes |
| Run or share an unmodified copy, non-commercially | yes |
| Run an unmodified copy inside a company or another organisation for its own staff, team-building included | yes — the one case we permit on top of the licences |
| Run a modified copy inside a company or another organisation — any change to the code, the rules, the cards, the texts or the logos | no — the code on its own falls under the AGPL, but not together with our cards, texts, names and logos |
| Run or share a modified copy publicly, non-commercially | yes — keeping our name and logos only as a mod, on the terms in [`TRADEMARKS.md`](./TRADEMARKS.md#mods); otherwise under a name and logos of its own, crediting the original as the licences require |
| Anything commercial | no — except the source code on its own, without the cards, texts, names and logos |

Third-party notice: Deploy or Die — MIT License, see [`LICENSE-deployordie`](./LICENSE-deployordie).
