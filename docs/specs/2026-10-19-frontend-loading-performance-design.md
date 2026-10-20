# Frontend loading performance — Design

**Date:** 2026-10-19

**Application:** `@release/web`

**Status:** Implemented locally on 2026-10-19; validation and implementation rulings are recorded in [the performance report](../performance/2026-10-19-frontend-loading.md).

## Intent and success criteria

The agreed goals are to show the first screen sooner for a new visitor and
reduce repeat downloads after application updates. This is a loading and cache
isolation change, not an in-game rendering optimization project.

Success means:

- A cold visit to `/` or `/start` fetches the start screen without fetching the
  engine, PeerJS, voice runtime, board, statistics, forms, or rules text.
- Initial transferred JS/CSS and median first-screen FCP/LCP improve relative
  to a fresh production baseline under identical browser/network conditions.
- A board-only source change preserves the URLs and contents of unrelated
  start-screen resources and stable third-party chunks. Small entry/manifest
  changes caused by updated chunk references are allowed and reported.
- Existing create, join, restore, navigation, localization, and session lifetime
  behavior remains intact.

No percentage improvement is promised before measuring the baseline. The
existing `dist` directory is not a baseline: its files predate current source.

## Current structure and causes

- `app/main.tsx` imports eager routes from `@generouted/react-router`.
- `pages/_app.tsx` mounts `SessionProvider`, `FollowGameStart`, and `AppModals`
  for every page.
- `SessionProvider` imports `useLobby`, which statically reaches the engine,
  transport, voice, and session restoration code.
- `AppModals` statically imports create/join forms and rules.
- Translation initialization merges both languages' common and rules JSON.
  The source common catalogs total 40,543 bytes; rules total 37,690 bytes.
  These are source sizes, not compressed transfer sizes.
- `shared/lib/persistence.ts` imports engine parsing, so importing its session
  reader is not a sufficiently lightweight bootstrap boundary.
- The UI component barrel exports start, lobby, and table components together.
  Its resulting CSS/asset retention must be measured rather than assumed.
- The deployment workflow publishes the frontend to GitHub Pages under a base
  path, with an HTML 404 fallback for direct navigation.

## Loading architecture

### Initial shell and route composition

Keep `/`, `/start`, the root shell, and required start visuals/styles eager.
Do not add a dynamic-import waterfall before rendering the start screen.
Lazy-load lobby, board, statistics, and help route implementations.

Retain file-based route discovery, route types, basename support, direct links,
and root error handling. Do not hand-edit generated `app/router.ts`.
The installed generouted lazy entry makes all regular pages lazy; switching
entrypoints alone therefore does not satisfy this mixed eager/lazy design.
The implementation plan must select a composition method that preserves the
eager start route without importing the other route implementations eagerly.

### Session bootstrap and lifetime

Place a lightweight session activation coordinator above the route outlet.
It must not statically import the runtime implementation, engine, or PeerJS.
Context definitions and type-only contracts must be importable independently
of the runtime module.

Load and activate the runtime when any of these is true:

- The create or join modal is opened, including via query parameters.
- A lobby, board, or statistics URL is visited directly.
- A valid saved session requires the existing automatic restore behavior,
  including when the current URL is `/start`.

Move engine-independent session-record reading into a lightweight persistence
module. Preserve the existing storage keys, tab-scoped storage, in-memory
fallback, validation, expiry, and clear/write semantics. Do not create a second
storage implementation with different behavior. Event-log parsing remains on
the runtime side of the boundary.

Concurrent activation requests share one load and one runtime instance.
Once activated, its owner stays mounted across route and modal changes;
closing a form or returning to start must not tear down a live connection.
Keep existing explicit leave/disband cleanup. Runtime activation must not
remount an already displayed start screen or discard form state.

Mount `FollowGameStart` with the active runtime. Preserve host/guest restore
ordering and navigation to a new match from the statistics screen.
Consumers that require the session render only after activation succeeds;
an inactive session must not masquerade as a connected session.

### Forms, board, statistics, and rules

Load create and join form content only when requested. Keep modal framing and
close controls available during loading. Preserve modal query parameters and
existing exit animations.

Load board and statistics implementations separately. Shared session/game
dependencies may be shared chunks, but statistics must not force board visuals
into its dependency closure solely through route composition.

Preload board code after entering the lobby, outside the first-screen critical
path. This imports code only; it must not mount the board or start gameplay.
Do not preload every feature on idle at `/start`, which would defeat the
initial-transfer and cache-use goals.

Load rules text for the selected language when rules are requested. On the
board, gate the rules content by panel demand instead of eagerly building it
on mount. Update open rules after a language switch once the new text is ready.

### Translation compatibility

Keep both languages' common UI catalogs eager in this iteration. Preserve the
`@release/translation` surface, existing typed translation keys, English
fallback behavior, and synchronous common-copy language switching.

Add a deduplicated rules-resource loader inside the translation package.
Preserve current `rules` and `rulesBlock` key paths and catalog merge semantics;
do not replace partial common sections with rules-only objects. Register loaded
resources before showing rules content. Load fallback resources as necessary
to retain the existing fallback behavior. Failed loads can be retried.

Keep the complete static catalog available to playground and fixtures through
their catalog surface. Production translation initialization must not import
that complete static catalog. Changes must preserve playground consumption.

## Chunk and asset policy

Use natural async feature boundaries first. Isolate stable third-party groups
based on a production module/size report, without grouping every dependency or
all of `@release/ui` into one chunk. React/runtime and routing are candidates;
PeerJS must stay outside the initial dependency closure.

Keep Vite CSS splitting enabled. Initial CSS contains global tokens/fonts and
styles needed by start. Board-only CSS must not load at start. If the UI barrel
retains unrelated styles or assets, add narrow public entrypoints where needed
and update consumers/aliases consistently; do not blanket-mark CSS as free of
side effects or break playground imports.

Retain content-hashed asset names. Chunk boundaries improve cache reuse but
cannot guarantee permanent hash stability or control browser eviction.
Measure actual response cache headers and repeat requests on the deployed host.
Changing hosting or adding a service worker is outside this iteration.

Include the start photo, logo, and fonts in the initial-load report. Asset
conversion, visual changes, and font redesign require a separate scoped
decision if measurements show they dominate the remaining delay.

## Loading, failures, and updates

- Modal loading uses a local indicator and keeps close available. Closing
  before completion must not reopen the modal when its import resolves.
- Route transitions retain the current screen until the destination is ready.
  Direct links show a lightweight loading shell. Preserve existing reduced
  motion and transition behavior without introducing duplicate transitions.
- Failed feature/resource loads show a localized error and an explicit retry.
  Retry must make a real new loading attempt; simply resetting an error boundary
  around an already rejected lazy component is insufficient.
- A missing old hashed chunk after deployment may require a page refresh.
  Explain that recovery through an explicit user action. Never automatically
  reload or loop reloads during an active session. Ordinary network failures
  first allow retry; distinguish them from an available update where possible.
- Loading/error UI must not unmount the active runtime. Use existing UI
  primitives, tokens, and translation conventions.

## Verification and acceptance

### Production measurements

1. Build current source with recorded Node/pnpm versions and production env/base
   settings. Capture compressed JS/CSS sizes, module/chunk dependencies, and
   assets requested by `/` and `/start`.
2. Use a production server and a fixed Chromium version, viewport, language,
   network throttle, and CPU throttle. Run at least five cold visits per URL
   with empty cache/storage. Compare median FCP/LCP, transferred bytes, and JS
   execution time before/after; identify the LCP element.
3. Confirm through browser requests and build graph inspection that a new
   visitor does not load the excluded runtimes, feature code, rules text, or
   board styles. Emitted but unrequested assets are not initial transfers.
4. Verify create/join/rules load on demand and board preload starts in the lobby.
   Report first interaction/loading delays as well as first-screen gains.
5. Compare two otherwise identical production builds with a small board-only
   edit. List changed chunks and bytes; stable third-party and unrelated start
   resources retain hashes, allowing changed entry references as stated above.
6. Check deployed cache headers and warm-cache requests when deployment access
   is available. Local build/hash evidence alone is not proof of hosted reuse.

### Behavior and regression checks

- Cover activation deduplication, lifetime, storage TTL/fallback behavior,
  direct links, and host/guest restoration with focused tests.
- Cover delayed/failed imports, actual retries, modal closure while loading,
  common language switching, rules fallback/loading, and update recovery.
- In a real browser, exercise create/join, lobby → board → statistics → next
  match, reload restore, active-session navigation, and back/forward navigation.
  Confirm the session owner does not remount across these transitions.
- Distinguish mocked transport tests from a real WebRTC DataChannel check;
  if no real channel opens, report that verification limit explicitly.
- Check start/modal/board appearance and transitions for regressions. If visual
  changes become necessary, use the repository playground reference workflow.
- Run relevant package tests, type checks, lint, and production builds for
  frontend and affected shared consumers, including playground.

## Scope and next gate

This design excludes SSR/prerendering, service workers, hosting migration,
in-game rendering optimization, engine-rule changes, and dependency upgrades
unrelated to the loading boundaries.

After written-spec review and approval, produce the implementation plan. The
plan must resolve mixed eager/lazy route composition, exact module boundaries,
chunk grouping based on baseline evidence, and the concrete retry mechanism.
Implementation begins only after plan review and execution-method selection.
