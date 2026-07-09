# Self-hosted PeerServer App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `apps/peerserver` — a self-hosted PeerJS signaling server — with a Docker image published to GHCR on tag, so the game stops depending on the free PeerJS public cloud.

**Architecture:** A small Express app wraps `ExpressPeerServer` from the `peer` package, adds a `/health` endpoint, env-driven config, and graceful shutdown. A multi-stage Dockerfile builds a pruned production bundle via `pnpm deploy`. A new GitHub Actions workflow pushes the image to GHCR on `peerserver-v*` tags and smoke-builds it on PRs. The frontend needs no code changes — its transport wrapper already reads `VITE_PEER_*` env at build time; `deploy.yml` starts passing those from repo variables.

**Tech Stack:** TypeScript (NodeNext ESM), Express 4, `peer` 1.0.2, vitest, tsx (dev watch), Docker (node:24-alpine), GitHub Actions + GHCR.

**Spec:** [2026-07-09-peerserver-app-design.md](./2026-07-09-peerserver-app-design.md)

## Global Constraints

- Node `>=24`, pnpm `9.15.0` (root `packageManager` field).
- All commands run from the repo root: `/Users/andreykonnov/dev/MythHand/ReleaseBoardGameP2P`.
- Branch: `feat/peerserver-app` (already checked out).
- Lint/format is biome via `release-lint` (root `pnpm lint`); style: single quotes, no semicolons, 2-space indent, line width 100. The pre-commit hook runs lint-staged + `pnpm typecheck` automatically.
- Typecheck via `release-tsc` (TypeScript from `@release/lint`); base tsconfig is `@release/lint/tsconfig` (strict, `noEmit: true`).
- Tests: vitest, colocated `*.test.ts`, script `vitest run --passWithNoTests` (binary resolves from root — do NOT add vitest to the app's devDependencies; `packages/translation` proves the pattern).
- Env defaults must match current dev setup: port `9000`, path `/`, key `peerjs`.
- Image name: `ghcr.io/mythhand/releaseboardgamep2p-peerserver`. Release tag prefix: `peerserver-v`.
- TLS is out of scope for the container — plain HTTP/WS inside, reverse proxy on the host.

---

### Task 1: Package scaffold + `config.ts`

**Files:**
- Create: `apps/peerserver/package.json`
- Create: `apps/peerserver/tsconfig.json`
- Create: `apps/peerserver/tsconfig.build.json`
- Create: `apps/peerserver/src/config.ts`
- Test: `apps/peerserver/src/config.test.ts`
- Modify: `pnpm-lock.yaml` (via `pnpm install`)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `interface Config { port: number; peerPath: string; peerKey: string }` and `parseConfig(env: Record<string, string | undefined>): Config` — exported from `src/config.ts`, throws `Error("Invalid PORT: …")` on a non-integer or out-of-range port. Tasks 2–3 import both.

- [ ] **Step 1: Create the package manifest and tsconfigs**

`apps/peerserver/package.json`:

```json
{
  "name": "@release/peerserver",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "files": ["dist"],
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "release-tsc -p tsconfig.build.json",
    "start": "node dist/index.js",
    "typecheck": "release-tsc --noEmit -p tsconfig.json",
    "test": "vitest run --passWithNoTests"
  },
  "dependencies": {
    "express": "^4.22.2",
    "peer": "^1.0.2"
  },
  "devDependencies": {
    "@release/lint": "workspace:*",
    "@types/express": "^4.17.23",
    "@types/node": "^26.0.0",
    "tsx": "^4.22.4"
  }
}
```

`apps/peerserver/tsconfig.json` — the base config targets browsers (`moduleResolution: Bundler`, DOM libs); this is a Node app, so override module resolution and libs. NodeNext means **all relative imports in `src/` must use `.js` extensions** (vitest and tsx resolve them to the `.ts` sources):

```json
{
  "extends": "@release/lint/tsconfig",
  "compilerOptions": {
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "types": ["node"]
  },
  "include": ["src"]
}
```

`apps/peerserver/tsconfig.build.json` — the only config that emits (base sets `noEmit: true`; the `typecheck` script also passes `--noEmit` explicitly). Tests are excluded from the emitted bundle:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}
```

- [ ] **Step 2: Install to register the workspace package**

Run: `pnpm install`
Expected: succeeds; `pnpm-lock.yaml` gains `apps/peerserver` importer with `express`, `peer`, `@types/express`, `@types/node`, `tsx`.

- [ ] **Step 3: Write the failing test**

`apps/peerserver/src/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseConfig } from './config.js'

describe('parseConfig', () => {
  it('applies defaults when env is empty', () => {
    expect(parseConfig({})).toEqual({ port: 9000, peerPath: '/', peerKey: 'peerjs' })
  })

  it('respects env overrides', () => {
    expect(parseConfig({ PORT: '8080', PEER_PATH: '/signal', PEER_KEY: 'secret' })).toEqual({
      port: 8080,
      peerPath: '/signal',
      peerKey: 'secret',
    })
  })

  it('rejects a non-numeric PORT', () => {
    expect(() => parseConfig({ PORT: 'abc' })).toThrow('Invalid PORT')
  })

  it('rejects an out-of-range PORT', () => {
    expect(() => parseConfig({ PORT: '70000' })).toThrow('Invalid PORT')
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm --filter @release/peerserver test`
Expected: FAIL — cannot resolve `./config.js`.

- [ ] **Step 5: Implement `config.ts`**

`apps/peerserver/src/config.ts`:

```ts
export interface Config {
  port: number
  peerPath: string
  peerKey: string
}

export function parseConfig(env: Record<string, string | undefined>): Config {
  const rawPort = env.PORT ?? '9000'
  const port = Number(rawPort)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: "${rawPort}"`)
  }
  return {
    port,
    peerPath: env.PEER_PATH ?? '/',
    peerKey: env.PEER_KEY ?? 'peerjs',
  }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @release/peerserver test`
Expected: PASS (4 tests).

- [ ] **Step 7: Typecheck and lint**

Run: `pnpm --filter @release/peerserver typecheck && pnpm exec release-lint check --error-on-warnings apps/peerserver`
Expected: both clean.

- [ ] **Step 8: Commit**

```bash
git add apps/peerserver pnpm-lock.yaml
git commit -m "feat(peerserver): scaffold @release/peerserver with env config parsing"
```

---

### Task 2: `server.ts` — Express + ExpressPeerServer + `/health`

**Files:**
- Create: `apps/peerserver/src/server.ts`
- Test: `apps/peerserver/src/server.test.ts`
- Modify: `biome.json` (root — add override)

**Interfaces:**
- Consumes: `Config` from `./config.js` (Task 1).
- Produces: `createServer(config: Config): http.Server` — an unstarted `node:http` server; caller invokes `.listen()`. `GET /health` → `200 {"status":"ok"}`. PeerServer endpoints mounted at `config.peerPath` (so with defaults the id endpoint is `GET /peerjs/id` — `{path}{key}/id` — exactly what the PeerJS client expects). Task 3 imports this.

- [ ] **Step 1: Add a biome override for server-side code**

Servers log to stdout (the container captures it), and biome's `noConsole` only allows `warn`/`error`. In root `biome.json`, append to the existing `overrides` array (after the `vite.config.ts` entry):

```json
    {
      "includes": ["apps/peerserver/**"],
      "linter": {
        "rules": {
          "style": {
            "noProcessEnv": "off"
          },
          "suspicious": {
            "noConsole": "off"
          }
        }
      }
    }
```

- [ ] **Step 2: Write the failing test**

`apps/peerserver/src/server.test.ts` — starts the real server on an ephemeral port and probes it over HTTP:

```ts
import type http from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { createServer } from './server.js'

describe('createServer', () => {
  let server: http.Server

  afterEach(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()))
      }),
  )

  async function listen(): Promise<number> {
    server = createServer({ port: 0, peerPath: '/', peerKey: 'peerjs' })
    await new Promise<void>((resolve) => {
      server.listen(0, resolve)
    })
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('no port assigned')
    return address.port
  }

  it('responds ok on /health', async () => {
    const port = await listen()
    const res = await fetch(`http://127.0.0.1:${port}/health`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
  })

  it('serves the PeerServer id endpoint under the mount path', async () => {
    const port = await listen()
    const res = await fetch(`http://127.0.0.1:${port}/peerjs/id`)
    expect(res.status).toBe(200)
    expect(await res.text()).not.toBe('')
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @release/peerserver test`
Expected: FAIL — cannot resolve `./server.js` (config tests still pass).

- [ ] **Step 4: Implement `server.ts`**

`apps/peerserver/src/server.ts`:

```ts
import http from 'node:http'
import express from 'express'
import { ExpressPeerServer } from 'peer'
import type { Config } from './config.js'

export function createServer(config: Config): http.Server {
  const app = express()
  const server = http.createServer(app)

  // Registered before the PeerServer mount so a peerPath of '/' can't shadow it.
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  const peerServer = ExpressPeerServer(server, { key: config.peerKey })
  peerServer.on('connection', (client) => {
    console.log(`peer connected: ${client.getId()}`)
  })
  peerServer.on('disconnect', (client) => {
    console.log(`peer disconnected: ${client.getId()}`)
  })
  app.use(config.peerPath, peerServer)

  return server
}
```

Note: `ExpressPeerServer` attaches its websocket upgrade handler to the passed `http.Server`, which is why the server is created explicitly instead of using `app.listen()`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @release/peerserver test`
Expected: PASS (6 tests across 2 files).

- [ ] **Step 6: Typecheck and lint**

Run: `pnpm --filter @release/peerserver typecheck && pnpm exec release-lint check --error-on-warnings apps/peerserver biome.json`
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add apps/peerserver/src/server.ts apps/peerserver/src/server.test.ts biome.json
git commit -m "feat(peerserver): express server wrapping ExpressPeerServer with /health"
```

---

### Task 3: Entry point + build verification

**Files:**
- Create: `apps/peerserver/src/index.ts`

**Interfaces:**
- Consumes: `parseConfig` (Task 1), `createServer` (Task 2).
- Produces: runnable entry `dist/index.js` (after `build`) — what the Dockerfile `CMD` (Task 5) and the `start`/`dev` scripts execute.

- [ ] **Step 1: Implement `index.ts`**

`apps/peerserver/src/index.ts`:

```ts
import { parseConfig } from './config.js'
import { createServer } from './server.js'

const config = parseConfig(process.env)
const server = createServer(config)

server.listen(config.port, () => {
  console.log(`peerserver listening on :${config.port} (peer path: ${config.peerPath})`)
})

// Containers stop with SIGTERM. server.close() waits for open sockets, and
// PeerServer holds long-lived websockets — so fall back to a hard exit.
function shutdown(signal: string): void {
  console.log(`${signal} received, shutting down`)
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 5000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
```

- [ ] **Step 2: Build**

Run: `pnpm --filter @release/peerserver build`
Expected: succeeds; `apps/peerserver/dist/` contains `index.js`, `config.js`, `server.js` (+ `.d.ts`), and **no** `*.test.js`.

- [ ] **Step 3: Smoke-test the built server**

```bash
PORT=9100 node apps/peerserver/dist/index.js &
sleep 1
curl -s http://127.0.0.1:9100/health
curl -s http://127.0.0.1:9100/peerjs/id; echo
kill -TERM %1
wait %1; echo "exit: $?"
```

Expected: `{"status":"ok"}`, a random peer id, log line `SIGTERM received, shutting down`, `exit: 0`.

- [ ] **Step 4: Typecheck, lint, full test run**

Run: `pnpm --filter @release/peerserver typecheck && pnpm exec release-lint check --error-on-warnings apps/peerserver && pnpm --filter @release/peerserver test`
Expected: all clean/passing.

- [ ] **Step 5: Commit**

```bash
git add apps/peerserver/src/index.ts
git commit -m "feat(peerserver): entry point with graceful shutdown"
```

---

### Task 4: Dev parity — `dev:p2p` runs the new app; deps move out of frontend

**Files:**
- Modify: `package.json` (root — `dev:p2p` script)
- Modify: `apps/frontend/package.json` (remove `peerserver` + `dev:p2p` scripts; remove `peer` + `concurrently` devDependencies)
- Modify: `pnpm-lock.yaml` (via `pnpm install`)

**Interfaces:**
- Consumes: `@release/peerserver` `dev` script (Task 1).
- Produces: root `pnpm dev:p2p` — the only way to run frontend + local signaling together; dev and production now run the same server code.

- [ ] **Step 1: Rewire the root `dev:p2p` script**

In root `package.json`, replace:

```json
    "dev:p2p": "pnpm --filter @release/web dev:p2p",
```

with (orchestration moves to the root because `pnpm --filter` targets require the workspace root; env prefixes propagate through pnpm to vite):

```json
    "dev:p2p": "concurrently -n web,peer -c green,blue \"VITE_PEER_HOST=localhost VITE_PEER_PORT=9000 VITE_PEER_PATH=/ pnpm --filter @release/web dev\" \"pnpm --filter @release/peerserver dev\"",
```

- [ ] **Step 2: Clean up the frontend package**

In `apps/frontend/package.json`:
1. Delete the `"peerserver"` script line.
2. Delete the `"dev:p2p"` script line.
3. Delete `"peer": "^1.0.2"` from devDependencies (now a runtime dep of `@release/peerserver`).
4. Delete `"concurrently": "^9.1.0"` from devDependencies (only `dev:p2p` used it; the root already has concurrently ^10).

- [ ] **Step 3: Update the lockfile**

Run: `pnpm install`
Expected: succeeds; frontend importer loses `peer` and `concurrently`.

- [ ] **Step 4: Verify dev parity**

```bash
pnpm dev:p2p &
sleep 5
curl -s http://127.0.0.1:9000/health
kill %1
```

Expected: both `web` (vite) and `peer` (tsx) prefixed logs appear; health returns `{"status":"ok"}`.

- [ ] **Step 5: Full workspace checks**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: all pass across the workspace (peerserver included in each).

- [ ] **Step 6: Commit**

```bash
git add package.json apps/frontend/package.json pnpm-lock.yaml
git commit -m "refactor(dev): dev:p2p runs @release/peerserver instead of the peerjs CLI"
```

---

### Task 5: Dockerfile + .dockerignore

**Files:**
- Create: `apps/peerserver/Dockerfile`
- Create: `.dockerignore` (repo root)

**Interfaces:**
- Consumes: `@release/peerserver` `build` script and `dist/index.js` (Task 3).
- Produces: image buildable with `docker build -f apps/peerserver/Dockerfile .` — what the CI workflow (Task 6) builds and pushes. Listens on 9000, `HEALTHCHECK` wired to `/health`.

- [ ] **Step 1: Create `.dockerignore`**

Repo root `.dockerignore` (the build context is the whole repo — keep it lean):

```
**/node_modules
**/dist
.git
```

- [ ] **Step 2: Create the Dockerfile**

`apps/peerserver/Dockerfile`:

```dockerfile
# Build context is the repo root (the workspace install needs the lockfile):
#   docker build -f apps/peerserver/Dockerfile -t peerserver .
FROM node:24-alpine AS build
# Pin pnpm to the workspace's packageManager version.
RUN npm install -g pnpm@9.15.0
WORKDIR /repo
COPY . .
# --ignore-scripts: the root `prepare` hook (simple-git-hooks) needs .git,
# which is excluded from the context; no dependency here needs a postinstall.
RUN pnpm install --frozen-lockfile --filter @release/peerserver... --ignore-scripts
RUN pnpm --filter @release/peerserver build
# Standalone production bundle: no workspace symlinks, prod deps only.
RUN pnpm --filter @release/peerserver deploy --prod /out

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 9000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-9000}/health" || exit 1
CMD ["node", "dist/index.js"]
```

- [ ] **Step 3: Build the image**

Run: `docker build -f apps/peerserver/Dockerfile -t peerserver-local .`
Expected: builds through both stages. (If the Docker daemon isn't running locally, start it; if unavailable, note it and rely on the PR smoke build from Task 6 — but try locally first.)

- [ ] **Step 4: Run and probe the container**

```bash
docker run -d --name peerserver-smoke -p 9000:9000 peerserver-local
sleep 2
curl -s http://127.0.0.1:9000/health
docker inspect --format '{{.State.Health.Status}}' peerserver-smoke
docker stop peerserver-smoke && docker rm peerserver-smoke
```

Expected: `{"status":"ok"}`; health `starting` or `healthy`; `docker stop` returns promptly (graceful SIGTERM handling, no 10s timeout kill).

- [ ] **Step 5: Commit**

```bash
git add apps/peerserver/Dockerfile .dockerignore
git commit -m "feat(peerserver): multi-stage Dockerfile with health check"
```

---

### Task 6: CI workflow — build & push to GHCR

**Files:**
- Create: `.github/workflows/peerserver.yml`

**Interfaces:**
- Consumes: `apps/peerserver/Dockerfile` (Task 5).
- Produces: `ghcr.io/mythhand/releaseboardgamep2p-peerserver:{version,latest}` on `peerserver-v*` tags; `:sha-<short>` on `workflow_dispatch`; build-only smoke check on PRs touching the app.

- [ ] **Step 1: Create the workflow**

`.github/workflows/peerserver.yml`:

```yaml
name: PeerServer image

on:
  push:
    tags: ["peerserver-v*"]
  pull_request:
    paths:
      - "apps/peerserver/**"
      - ".github/workflows/peerserver.yml"
      - "pnpm-lock.yaml"
  workflow_dispatch:

concurrency:
  group: peerserver-${{ github.ref }}
  cancel-in-progress: true

jobs:
  image:
    name: Build image${{ github.event_name != 'pull_request' && ' & push to GHCR' || '' }}
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to GHCR
        if: github.event_name != 'pull_request'
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Compute image tags
        id: tags
        run: |
          IMAGE=ghcr.io/mythhand/releaseboardgamep2p-peerserver
          if [[ "$GITHUB_REF" == refs/tags/peerserver-v* ]]; then
            VERSION="${GITHUB_REF#refs/tags/peerserver-v}"
            echo "tags=$IMAGE:$VERSION,$IMAGE:latest" >> "$GITHUB_OUTPUT"
          else
            echo "tags=$IMAGE:sha-${GITHUB_SHA::7}" >> "$GITHUB_OUTPUT"
          fi

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          file: apps/peerserver/Dockerfile
          push: ${{ github.event_name != 'pull_request' }}
          tags: ${{ steps.tags.outputs.tags }}
```

- [ ] **Step 2: Validate the workflow syntax**

Run: `pnpm exec release-lint check --error-on-warnings .github/workflows/peerserver.yml || true` then, if `actionlint` is available (`command -v actionlint`), run `actionlint .github/workflows/peerserver.yml`.
Expected: no YAML/actionlint errors (skip actionlint silently if not installed — the PR run itself is the real validation).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/peerserver.yml
git commit -m "ci: build & push peerserver image to GHCR on peerserver-v* tags"
```

---

### Task 7: Frontend production hookup in `deploy.yml`

**Files:**
- Modify: `.github/workflows/deploy.yml` (the `Build` step env block, currently `VITE_BASE_URL` only)

**Interfaces:**
- Consumes: nothing new — the frontend transport wrapper (`apps/frontend/src/network/transport/peer.ts`) already reads `VITE_PEER_HOST/PORT/PATH` via `src/shared/config.ts`; empty/unset values fall back to the PeerJS public cloud.
- Produces: Pages builds that point at the self-hosted server once the repo variables are set.

- [ ] **Step 1: Pass the signaling env into the web build**

In `.github/workflows/deploy.yml`, extend the `Build` step's `env`:

```yaml
      - name: Build
        run: pnpm --filter @release/web build
        env:
          VITE_BASE_URL: /ReleaseBoardGameP2P/
          # Self-hosted signaling server (apps/peerserver). Unset repo variables
          # yield empty strings, and the client falls back to the PeerJS public
          # cloud — so this is a no-op until the variables are configured.
          VITE_PEER_HOST: ${{ vars.VITE_PEER_HOST }}
          VITE_PEER_PORT: ${{ vars.VITE_PEER_PORT }}
          VITE_PEER_PATH: ${{ vars.VITE_PEER_PATH }}
```

Only the `Build` step for `@release/web` changes; the playground build step is untouched.

- [ ] **Step 2: Verify the fallback assumption locally**

Run: `VITE_PEER_HOST= VITE_PEER_PORT= VITE_PEER_PATH= pnpm --filter @release/web build`
Expected: build succeeds — empty strings are falsy in `peerOptions()` (`if (!PEER_HOST)`), preserving public-cloud behavior.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci(deploy): pass VITE_PEER_* repo variables into the web build"
```

---

### Task 8: Docs — app README + repo CLAUDE.md

**Files:**
- Create: `apps/peerserver/README.md`
- Modify: `CLAUDE.md` (repo root — Monorepo Layout table + Stack Per App section)

**Interfaces:**
- Consumes: everything above (documents the finished app).
- Produces: operator docs — how to run locally, in Docker, behind TLS; where the image lives.

- [ ] **Step 1: Write the README**

`apps/peerserver/README.md`:

````markdown
# @release/peerserver

Self-hosted PeerJS signaling server. Brokers the WebRTC handshake (peer-ID
registration, SDP/ICE relay) for the game; game traffic itself flows
peer-to-peer and never touches this server.

## Configuration

| Env var | Default | Meaning |
|---------|---------|---------|
| `PORT` | `9000` | HTTP/WS listen port |
| `PEER_PATH` | `/` | Mount path for the PeerServer endpoints |
| `PEER_KEY` | `peerjs` | API key clients must present (PeerJS client default) |

`GET /health` returns `200 {"status":"ok"}` — used by the Docker
`HEALTHCHECK` and host monitoring.

## Run locally

```bash
pnpm --filter @release/peerserver dev    # tsx watch
pnpm dev:p2p                             # frontend + this server together
```

## Docker

Images are published by [.github/workflows/peerserver.yml](../../.github/workflows/peerserver.yml)
on `peerserver-v*` tags:

```bash
docker run -d --restart unless-stopped -p 9000:9000 \
  ghcr.io/mythhand/releaseboardgamep2p-peerserver:latest
```

Build locally (context must be the repo root):

```bash
docker build -f apps/peerserver/Dockerfile -t peerserver .
```

## TLS

The container speaks plain HTTP/WS. The GitHub Pages frontend is HTTPS, so
browsers require `wss://` — terminate TLS at a reverse proxy on the host.
Caddy example (automatic certificates):

```
peer.example.com {
    reverse_proxy localhost:9000
}
```

Then set the repo variables consumed by
[deploy.yml](../../.github/workflows/deploy.yml):
`VITE_PEER_HOST=peer.example.com`, `VITE_PEER_PORT=443`, `VITE_PEER_PATH=/`.

## TURN

Signaling is not enough for peers behind symmetric NAT / strict firewalls —
they need a TURN relay. The client already supports one via `VITE_TURN_URL`,
`VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL` (see
`apps/frontend/src/shared/config.ts`). Provision coturn or a managed TURN
service separately; this server does not provide relaying.
````

- [ ] **Step 2: Update repo CLAUDE.md**

In the Monorepo Layout table, add after the `apps/frontend` row:

```markdown
| `apps/peerserver` | `@release/peerserver` | Self-hosted PeerJS signaling server (Express + `ExpressPeerServer`), shipped as a Docker image to GHCR |
```

In the Stack Per App section, add:

```markdown
### `@release/peerserver`
- TypeScript (NodeNext ESM), Express 4, `peer` (PeerServer)
- Env config: `PORT` / `PEER_PATH` / `PEER_KEY`; `/health` endpoint
- Docker image via `apps/peerserver/Dockerfile`; published to GHCR by `.github/workflows/peerserver.yml` on `peerserver-v*` tags
- Dev: `pnpm dev:p2p` runs it alongside the frontend
```

- [ ] **Step 3: Lint the docs**

Run: `pnpm exec release-lint check --error-on-warnings apps/peerserver/README.md CLAUDE.md || true`
Expected: formatter clean (markdown is mostly untouched by biome; no errors).

- [ ] **Step 4: Commit**

```bash
git add apps/peerserver/README.md CLAUDE.md
git commit -m "docs(peerserver): README + CLAUDE.md entry for the signaling server"
```

---

## Final verification (after all tasks)

- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` — all green at the workspace root.
- [ ] `pnpm dev:p2p` — frontend + signaling server run together; creating a lobby in the browser connects through `localhost:9000` (watch for `peer connected: …` log lines).
- [ ] `docker build -f apps/peerserver/Dockerfile .` — image builds.
- [ ] Push the branch and open a PR — the `PeerServer image` workflow runs its build-only smoke check (PR touches `apps/peerserver/**`).
