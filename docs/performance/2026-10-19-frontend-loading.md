# Frontend loading performance verification

The start screen now loads without the engine, PeerJS, voice, board, statistics,
forms, or rules text. Session ownership is loaded on demand and remains above the
router. Rules UI and localized JSON are deferred; common translations remain eager.
Start/foundation UI entries keep unrelated styles out of the initial closure.

## Production comparison

Baseline source: `5879517d` (main 0.10.5). Final production source: `eb12eddf`.
Node 24.13.0, pnpm 9.15.0, frontend Vite 6.4.3, Chromium 148.0.7778.96.
Both builds use `/ReleaseBoardGameP2P/`, the existing production configuration, and
the same local gzip HTTP server. This measures local delivery, not GitHub Pages.

| Initial resource | Before raw bytes | After raw bytes | Before gzip bytes | After gzip bytes |
|---|---:|---:|---:|---:|
| JavaScript | 1,186,382 | 471,755 | 372,382 | 159,384 |
| CSS | 118,800 | 40,235 | 24,209 | 8,953 |

Compressed JS falls 57.2%; CSS falls 63.0%. The tradeoff is nine initial JS/CSS
requests instead of two: six JS chunks and three stylesheets. All ten final visits
have zero failed requests or browser errors. Build graph and actual requests show
no excluded runtime or board styles; a separate URL check confirms zero rules JSON
requests. Rules JSON is emitted as an asset, so module-graph inspection alone is
insufficient for that check.

Five cold visits per URL use new contexts, empty storage, disabled cache, English,
1440×900 viewport, 4× CPU slowdown, 150 ms latency, 200,000 B/s download, and
93,750 B/s upload. Observe ten seconds after load. Final measurements run after the
test suite and other browser work finish. Values below are medians.

| URL | FCP before → after, ms | LCP before → after, ms | JS execution before → after, ms |
|---|---:|---:|---:|
| `/` | 2724 → 1460 | 3760 → 2496 | 259.2 → 128.7 |
| `/start` | 2716 → 1448 | 3756 → 2484 | 244.5 → 119.9 |

FCP improves about 46%; LCP improves about 34%. JS execution is CDP
`ScriptDuration`, not total main-thread busy time. The LCP element remains the
PhysicalEdition rubber-duck image; start layout and styling remain unchanged.

Single first-action samples under the same delivery/throttling settings: create
2943 ms, join 2934 ms, rules 1666 ms, measured from click initiation to visible form
or searchable rules. These include menu transitions and are smoke measurements,
not a baseline comparison or statistically stable latency estimate.

## Cache isolation

Build A uses final source. Build B appends `.cacheProbe { opacity: 0.99; }` only to
board `_Board.module.css`, with identical environment/toolchain; source is restored
in `finally`. Compare SHA-256 content hashes, not timestamps.

| Changed resource | Before gzip bytes | After gzip bytes |
|---|---:|---:|
| Board CSS | 7,759 | 7,780 |
| Board JS containing updated CSS references | 81,243 | 81,244 |
| Bootstrap containing updated chunk references | 4,809 | 4,809 |
| Total | 93,811 | 93,833 |

All other 47 JS/CSS assets keep identical names and content, including start,
session context, React, router, i18n, and PeerJS chunks. For a visit confined to
start, only the 4,809-byte bootstrap changes among initial JS/CSS resources.
HTML/manifest changes are outside this byte total. Actual cache headers, retention
of old deployment assets, and warm reuse on hosted versions remain unverified.

The first experiment exposed async chunks importing changing bootstrap exports.
Explicit `start-screen` and `session-context` chunks remove those back-edges; final
graph inspection finds zero async imports of bootstrap. This adds two small initial
requests beyond the vendor split, and the table above measures that final policy.

## Behavior and verification

- Full monorepo suite: 2,907 tests pass: frontend 1,995, engine 589, UI 312,
  PeerServer 6, playground 3, translation 2. Repository typechecks, lint/stylelint,
  normal frontend build, and playground build pass. Existing jsdom canvas/media
  notices and playground bundle-size warnings do not fail those checks.
- Two real Chromium clients create/join through the local PeerServer. The same
  open DataChannel object/token and SCTP id survive lobby → board → statistics →
  lobby → next match. Statistics is reached through SPA history navigation; this
  is not evidence of a naturally completed full browser match. Existing gameplay
  tests cover match settlement.
- Guest reload and host reload restore the board. Host verification waits for a
  saved keeper checkpoint. An immediate reload before the existing 250 ms trailing
  save can lose that fresh match; this unchanged persistence window was observed
  during testing and is outside this loading change.
- A persistent 404 for the help route displays refresh while the original live
  DataChannel stays open, with zero document navigations. Returning to lobby and
  starting the next match works. No automatic reload is introduced.
- First native JS, shared child JS, and dependent CSS failures recover through
  explicit refresh and a second successful request. Chromium caches a failed
  native module fetch: resetting the importer made no new network request.
  Recognized native module failures therefore offer refresh; JSON fetch failures
  offer a real retry and succeed on the second request. This is a deliberate
  recovery-policy adjustment to the original plan; refresh reconnects the session.
- Delayed rules JSON initially froze the modal at 440 px. Readiness-driven height
  locking fixes it to 810 px at 1440×900. Rules language-race, English fallback,
  concurrent loading, storage compatibility, modal cancellation, route readiness,
  session ownership, and reduced-motion behavior have focused regression coverage.
- Independent final review found a board rules reopen regression. A real RulesView
  search-preservation test failed before the fix and passes afterwards; the real
  board drawer also retains `Debugger` across close/reopen. The whole suite then
  passed. No second review was substituted for this regression proof.

## Implementation rulings and deferred findings

- Use fresh main `5879517d`, preserving its session bootstrap and offline handling.
  Saved sessions keep the existing bootstrap wrapper; cold start never gains a
  new ancestor when a modal activates the runtime, which avoids remounting start.
- Production uses its `_Board` fork, so add the rules slot there and retain its
  copy fallback. Playground Table behavior remains compatible.
- Preload board only after a session reaches an established lobby. Keep its
  coordinator in app composition rather than importing app internals from a page.
- Keep `vendorChunks.ts` in `config/`; the repository ignores `build/` directories.
  Unmatched dependencies stay under normal bundler placement.
- Cold measurements use an installed Playwright library for fresh contexts and
  CDP control after the CLI wrapper stalled; no product dependency is added.
- Deferred minor from review: `assert-start.mjs` does not itself reject emitted
  rules JSON URLs in a supplied network log. The recorded production requests are
  separately checked for that asset and contain zero such requests. Extend the
  assertion tool to cover emitted assets in a follow-up.
- The reviewer did not rerun browser timing, transport, or the final full suite.
  This report supplies those implementer-run checks and leaves hosted reuse
  unverified; the review is not independent acceptance of those measurements.
- Work remains in an isolated worktree on `feat/255-frontend-loading-performance`.
  Initial automatic approval rejected issue publication; after explicit user
  approval, [issue #255](https://github.com/MythHand/ReleaseBoardGameP2P/issues/255)
  was created. No remote branch, PR, or deployment was published. Main checkout
  remains untouched.

## Reproduction and evidence

From the implementation worktree, using Node 24 and pnpm 9.15.0:

```sh
node apps/frontend/perf/build-report.mjs --out /tmp/release-fe-report
node apps/frontend/perf/measure-browser.mjs /tmp/release-fe-report /absolute/path/to/playwright/index.mjs
node apps/frontend/perf/assert-start.mjs /tmp/release-fe-report /tmp/release-fe-report/browser.json
pnpm -r run test --maxWorkers=2
pnpm typecheck
pnpm lint
pnpm --filter @release/web build
pnpm --filter @release/playground build
```

The measurement tool accepts an installed Playwright module as its third process
argument, or resolves `playwright` normally when omitted. For baseline, run the
same report/measurement scripts against source `5879517d`; do not use stale dist.

[Recorded samples, requests, cache hashes and browser results](./evidence/2026-10-19-frontend-loading.json)
retain both sets of measurements with localhost origins normalized away. Raw build
reports and screenshots are in `/tmp/release-fe-baseline/`,
`/tmp/release-fe-verified/`, and `/tmp/release-fe-verified-b/`. Local browser scratch
scripts/logs are under `/tmp/fe-*`; only durable evidence and reusable measurement
tools are committed.
