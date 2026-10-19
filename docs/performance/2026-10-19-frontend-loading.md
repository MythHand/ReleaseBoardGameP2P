# Frontend loading performance verification

## Baseline

Source: `5879517d` (main 0.10.5). Node 24.13.0, pnpm 9.15.0.
Production base: `/ReleaseBoardGameP2P/`. Build retains the existing Vite configuration.

| Resource | Raw bytes | gzip bytes |
|---|---:|---:|
| Initial JS | 1,186,380 | 372,380 |
| Initial CSS | 118,800 | 24,210 |

Chromium cold visits: 1440×900, English, 4× CPU slowdown, 150 ms latency,
200,000 B/s download and 93,750 B/s upload, five new contexts per URL.
Measurement window: 10 seconds after load; same gzip server before and after.

| URL | Median FCP (ms) | Median LCP (ms) |
|---|---:|---:|
| / | 2724 | 3760 |
| /start | 2716 | 3756 |

Reproduce build report: `node apps/frontend/perf/build-report.mjs --out /tmp/release-fe-baseline`.
Raw build/graph/sizes/browser measurements and screenshots: `/tmp/release-fe-baseline/`.
Baseline graph assertion fails as expected: engine, networking, board/forms, and rules
are retained in the initial chunk. Browser requests are recorded separately from emitted assets.

## Implementation and final evidence

Recorded below as each loading boundary is validated. Hosted cache behavior requires
a deployed version; local hashes and local gzip serving do not establish hosted reuse.
