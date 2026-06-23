# Frontend architecture (Feature-Sliced Design) — Design

**Date:** 2026-06-23
**Project:** ReleaseBoardGameP2P ("Release любой ценой")
**Scope:** The frontend application architecture for `@release/web` — folder structure (a pragmatic Feature-Sliced Design subset), routing for all game screens, and the session/connection ownership that lets the lobby→board transition keep the P2P connection alive. Game-rules evaluation and visual components are out of scope (the rules engine is deferred; all visuals come from `@release/ui`).

> This spec covers **app structure, routing, and session ownership only**. It builds on the [P2P networking design](./2026-06-22-p2p-networking-design.md), consuming `apps/frontend/src/network/` unchanged. The game-rules engine is a separate, later spec.

## Goal

Give `@release/web` a clear, one-directional architecture so screens, use-cases, and domain models have obvious homes, and so the lobby and game screens share a single live P2P connection. Today the app has a flat `screens/` + `components/` layout and two routes (`/`, `/lobby`); this introduces a Feature-Sliced layout and the full route tree (start, help, lobby, board, stats) wired to the existing `@release/ui` components and `network/useLobby` layer.

## Decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Build scope | **Architecture + wiring only** — FSD skeleton, routing, screens wired to `@release/ui` + network. `entities/game` is a typed placeholder, no rule logic. |
| 2 | FSD flavour | **Pragmatic subset** — layers `app / pages / features / entities / shared`. No `widgets` layer (composed screen pieces already ship from `@release/ui`). |
| 3 | Import direction | One-way by convention: `app → pages → features → entities → shared`, plus `network` as the API/transport segment consumed by entities/features. |
| 4 | Network layer | **Stays at `apps/frontend/src/network/`** (unchanged). It is the FSD API/transport segment; nothing outside it imports `peerjs`. |
| 5 | Visual components | **All from `@release/ui`.** No new visual components, no `*.module.css` in the frontend (Tailwind only, per project styling rule). |
| 6 | Route base | **App root.** Game routes are NOT under `/playground/` — that prefix stays the component showcase (`apps/playground`), left untouched. |
| 7 | Routing mechanism | **File-based routing via a Vite plugin** (recommended: `generouted` for an app-router feel; `vite-plugin-pages` as fallback). The `pages/` layer adopts the plugin's file/folder convention; the folder tree mirrors the URL. |
| 8 | Session ownership | **`SessionProvider` as the root layout** (`pages/_app.tsx`) above all routes; it holds the transport via `useLobby`, so the DataChannel survives navigation. |
| 9 | Lobby→board transition | **Native View Transitions API** (`navigate(..., { viewTransition: true })` + CSS), zero extra runtime deps, `prefers-reduced-motion` respected. |
| 10 | Game page | **`board`** — route `/board/:gameId`, `BoardPage` renders `@release/ui <Table>`. Distinct from the `entities/game` domain slice. |
| 11 | `/help` | **Top-level sibling route** (`/help`), not nested under `/start`. |
| 12 | Stats | **Co-located nested route** `/board/:gameId/stats`, rendered through a `BoardPage` `<Outlet/>` (panel/overlay over the board). `gameId` carries from the lobby room id. |

## Module layout

```
apps/frontend/src/
  app/                       # composition root
    providers/
      SessionProvider.tsx    # lifts useLobby into context; connection survives navigation
    lib/viewTransition.ts    # startViewTransition + prefers-reduced-motion guard
  pages/                     # FILE-BASED route tree (plugin convention); thin wrappers over @release/ui
    _app.tsx                  # root layout: SessionProvider + <Outlet/>
    index.tsx                 # / → redirect to /start
    start.tsx                 # /start              → @release/ui <Start>
    help.tsx                  # /help               → top-level sibling
    lobby.tsx                 # /lobby              → create / join entry
    lobby.[lobbyId].tsx       # /lobby/:lobbyId     → joined room view
    board/
      [gameId]/
        index.tsx             # /board/:gameId      → BoardPage (@release/ui <Table>)
        stats.tsx             # /board/:gameId/stats → StatsPage (@release/ui <Stats>)
  features/                  # use-cases: thin orchestration over the network layer
    create-lobby/ join-lobby/ lobby-roster/ start-game/
    (play-card/ … = placeholder dirs, deferred to the engine spec)
  entities/
    lobby/                   # adapter exposing network/useLobby to the UI
    game/                    # PLACEHOLDER: typed GameState interfaces only, no logic
    player/  card/           # thin models over the @release/ui CARDS catalogue
  shared/
    (cn helper, shared types/config)
  network/                   # UNCHANGED — API/transport segment (see P2P spec)
  i18n.ts  index.css  main.tsx   # entry points (main.tsx mounts the plugin's <Routes>)
```

The exact file-naming follows the chosen plugin's convention (above uses `generouted`-style `[param]` segments and `_app.tsx` root layout); `vite-plugin-pages` differs in detail but the folder tree still mirrors the URL. Heavier logic stays in `features/`/`entities/`; route modules in `pages/` stay thin (compose `@release/ui` + feature hooks + session). Existing `src/screens/` and `src/components/` are migrated into this layout (`screens/HomeScreen` → `pages/start.tsx`, `screens/LobbyScreen` → `pages/lobby.tsx`, `components/LanguageSwitch` → `shared`). Co-located tests move with them.

> **FSD deviation (intentional):** the `pages` layer is not flat slices here — it nests to mirror the URL (Next.js-style co-location), as required by file-based routing. All other layers keep the one-way import discipline.

## Routing

```
/                       → redirect to /start
/start                  → /start
/help                   → /help                 (top-level sibling)
/lobby                  → /lobby                 (create / join entry)
/lobby/:lobbyId         → /lobby/:lobbyId        (joined room view)
/board/:gameId          → /board/:gameId         (BoardPage → @release/ui <Table>)
/board/:gameId/stats    → /board/:gameId/stats   (nested <Outlet/> over the board)
```

Routes are generated from the `pages/` folder by the plugin. The generated tree is wrapped by the `_app.tsx` root layout (`SessionProvider` + `<Outlet/>`), so every screen shares one live connection. `react-router@8`, `BrowserRouter`, no `/playground` basename. `gameId` is the room/lobby id (the host peer id), carried over from `/lobby/:lobbyId`.

## Session ownership & transition

- `SessionProvider` calls `useLobby()` **once** in the `_app.tsx` root layout and exposes it through a `useSession()` context hook. The transport ref lives here — above the route outlet — so navigating lobby→board never unmounts the hook or tears down the DataChannel.
- **Host start:** the `start-game` feature triggers the session start and `navigate('/board/' + gameId, { viewTransition: true })`. Guests receive `GAME_STARTED` over the wire (per the P2P spec) and navigate to `/board/:gameId` the same way.
- The slide is CSS via `::view-transition-old/new` (root or a named group), guarded by `@media (prefers-reduced-motion: reduce)`. No animation dependency.

## Pages vs. UI

Pages own layout (Tailwind) and data (from `useSession`, i18n) and hand it to `@release/ui` screen components. They contain no presentational component definitions and no CSS Modules — consistent with the project styling and i18n rules (all copy via `t()`).

## Testing

- Co-located `*.test.tsx` per page: each route renders the expected `@release/ui` screen.
- A `SessionProvider` test: the connection persists across a simulated lobby→board navigation (no transport re-create).
- Existing `network/` tests are untouched.

## Open questions

- **Plugin × `react-router@8` compatibility.** `generouted`/`vite-plugin-pages` track react-router's data-router APIs; the project is on `react-router@8`. Verify the chosen plugin supports v8 (and that `viewTransition` navigation works through the generated router) during implementation planning; if `generouted` lags v8, fall back to `vite-plugin-pages` (router-agnostic — it emits a route array we feed into our own `BrowserRouter`).

## Out of scope (other specs / later)

- Game-rules engine (card resolution) — fills `entities/game` and the placeholder `features/*`.
- Host-transfer runtime, deck-keeper, reconnection beyond `TURN_RESOLVED` (see P2P spec open questions).
- Any change to `apps/playground` (showcase) or `apps/ui`.
