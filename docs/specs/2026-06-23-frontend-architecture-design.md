# Frontend architecture (Feature-Sliced Design) — Design

**Date:** 2026-06-23
**Project:** ReleaseBoardGameP2P ("Release любой ценой")
**Scope:** The frontend application architecture for `@release/web` — folder structure (a pragmatic Feature-Sliced Design subset), routing for all game screens, and the session/connection ownership that lets the lobby→table transition keep the P2P connection alive. Game-rules evaluation and visual components are out of scope (the rules engine is deferred; all visuals come from `@release/ui`).

> This spec covers **app structure, routing, and session ownership only**. It builds on the [P2P networking design](./2026-06-22-p2p-networking-design.md), consuming `apps/frontend/src/network/` unchanged. The game-rules engine is a separate, later spec.

## Goal

Give `@release/web` a clear, one-directional architecture so screens, use-cases, and domain models have obvious homes, and so the lobby and game screens share a single live P2P connection. Today the app has a flat `screens/` + `components/` layout and two routes (`/`, `/lobby`); this introduces a Feature-Sliced layout and the full route tree (start, help, lobby, table, stats) wired to the existing `@release/ui` components and `network/useLobby` layer.

## Decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Build scope | **Architecture + wiring only** — FSD skeleton, routing, screens wired to `@release/ui` + network. `entities/game` is a typed placeholder, no rule logic. |
| 2 | FSD flavour | **Pragmatic subset** — layers `app / pages / features / entities / shared`. No `widgets` layer (composed screen pieces already ship from `@release/ui`). |
| 3 | Import direction | One-way by convention: `app → pages → features → entities → shared`, plus `network` as the API/transport segment consumed by entities/features. |
| 4 | Network layer | **Stays at `apps/frontend/src/network/`** (unchanged). It is the FSD API/transport segment; nothing outside it imports `peerjs`. |
| 5 | Visual components | **All from `@release/ui`.** No new visual components, no `*.module.css` in the frontend (Tailwind only, per project styling rule). |
| 6 | Route base | **App root.** Game routes are NOT under `/playground/` — that prefix stays the component showcase (`apps/playground`), left untouched. |
| 7 | Session ownership | **`SessionProvider` above the routes** holds the transport via `useLobby`; the DataChannel survives navigation. |
| 8 | Lobby→table transition | **Native View Transitions API** (`navigate(..., { viewTransition: true })` + CSS), zero new dependencies, `prefers-reduced-motion` respected. |
| 9 | `/help` | **Top-level sibling route** (`/help`), not nested under `/start`. |
| 10 | Stats | **Nested route** `/table/stats` rendered through a `TablePage` `<Outlet/>` (panel/overlay over the table). |

## Module layout

```
apps/frontend/src/
  app/                       # composition root
    App.tsx                  # <Routes> tree (replaces flat src/App.tsx)
    providers/
      SessionProvider.tsx    # lifts useLobby into context; connection survives navigation
      SessionLayout.tsx      # route element: SessionProvider + <Outlet/>
    config/
      routes.ts              # route path constants (single source of truth)
  pages/                     # one folder per route; thin wrappers over @release/ui
    start/  StartPage.tsx     → @release/ui <Start>
    help/   HelpPage.tsx
    lobby/  LobbyPage.tsx     → @release/ui <Lobby> + useSession()
    table/  TablePage.tsx     → @release/ui <Table> + <Outlet/> (stats)
    stats/  StatsPage.tsx     → @release/ui <Stats>
  features/                  # use-cases: thin orchestration over the network layer
    create-lobby/ join-lobby/ lobby-roster/ start-game/
    (play-card/ … = placeholder dirs, deferred to the engine spec)
  entities/
    lobby/                   # adapter exposing network/useLobby to the UI
    game/                    # PLACEHOLDER: typed GameState interfaces only, no logic
    player/  card/           # thin models over the @release/ui CARDS catalogue
  shared/
    lib/viewTransition.ts    # startViewTransition + prefers-reduced-motion guard
    (cn helper, shared types/config)
  network/                   # UNCHANGED — API/transport segment (see P2P spec)
  i18n.ts  index.css  main.tsx   # unchanged entry points
```

Existing `src/screens/` and `src/components/` are migrated into the layout above (`screens/HomeScreen` → `pages/start`, `screens/LobbyScreen` → `pages/lobby`, `components/LanguageSwitch` → `shared`). Co-located tests move with them.

## Routing

```
/                    → redirect to /start
/start               StartPage
/help                HelpPage          (top-level sibling)
/lobby               LobbyPage         (create / join entry)
/lobby/:lobbyId      LobbyPage         (joined room view)
/table               TablePage
/table/stats         StatsPage         (nested <Outlet/> over the table)
```

All routes are children of a single `<SessionLayout>` route whose element renders `SessionProvider` + `<Outlet/>`, so every screen shares one live connection. `react-router@8` (`BrowserRouter`, no `/playground` basename).

## Session ownership & transition

- `SessionProvider` calls `useLobby()` **once** and exposes it through a `useSession()` context hook. The transport ref lives here — above the router — so navigating lobby→table never unmounts the hook or tears down the DataChannel.
- **Host start:** the `start-game` feature triggers the session start and `navigate('/table', { viewTransition: true })`. Guests receive `GAME_STARTED` over the wire (per the P2P spec) and navigate to `/table` the same way.
- The slide is CSS via `::view-transition-old/new` (root or a named group), guarded by `@media (prefers-reduced-motion: reduce)`. No animation dependency.

## Pages vs. UI

Pages own layout (Tailwind) and data (from `useSession`, i18n) and hand it to `@release/ui` screen components. They contain no presentational component definitions and no CSS Modules — consistent with the project styling and i18n rules (all copy via `t()`).

## Testing

- Co-located `*.test.tsx` per page: each route renders the expected `@release/ui` screen.
- A `SessionProvider` test: the connection persists across a simulated lobby→table navigation (no transport re-create).
- Existing `network/` tests are untouched.

## Out of scope (other specs / later)

- Game-rules engine (card resolution) — fills `entities/game` and the placeholder `features/*`.
- Host-transfer runtime, deck-keeper, reconnection beyond `TURN_RESOLVED` (see P2P spec open questions).
- Any change to `apps/playground` (showcase) or `apps/ui`.
