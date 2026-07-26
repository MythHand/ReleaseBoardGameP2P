# Self-hosted PeerServer app — Design

**Date:** 2026-07-09
**Project:** ReleaseBoardGameP2P ("Release любой ценой")
**Scope:** A new workspace app that runs the PeerJS signaling server (PeerServer), its Docker image, and the CI workflow that publishes that image to GHCR. Client-side networking is out of scope — the frontend transport wrapper already exists ([apps/frontend/src/network/transport/peer.ts](../../apps/frontend/src/network/transport/peer.ts)) and reads its signaling host from env at build time.

## Goal

The game currently signals through the free PeerJS public cloud (`0.peerjs.com`) in production — no uptime guarantees and a globally shared peer-ID namespace. This spec replaces that with a self-hosted PeerServer we control: a small wrapper app in the monorepo, packaged as a Docker image, published to GitHub Container Registry so it can be pulled and run on any host.

The signaling server only brokers the WebRTC handshake (peer-ID registration, SDP/ICE relay). Game traffic stays peer-to-peer and never touches it.

## Decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Server form | **Custom wrapper app** (`apps/peerserver`) around `ExpressPeerServer` from the `peer` package — not the official image or bare CLI — for a health endpoint, env config, logging, and graceful shutdown |
| 2 | Registry / CD depth | **Build & push image to GHCR on tag**; deployment to a host stays manual (`docker pull` + run) until a host exists |
| 3 | TLS | **Not in the container** — plain HTTP/WS inside; TLS terminates at a reverse proxy on the host |
| 4 | Release trigger | Tags matching **`peerserver-v*`** — decoupled from the existing app release flow |
| 5 | Dev parity | `dev:p2p` switches from the `peerjs` CLI to running `@release/peerserver`, so dev and production run the same server code |
| 6 | TURN | **Out of scope** — client config already supports a custom TURN via `VITE_TURN_URL` when one is provisioned |

## New app: `apps/peerserver` (`@release/peerserver`)

TypeScript Node app, following sibling-app conventions (release-lint, release-tsc, vitest).

```
apps/peerserver/
  src/
    config.ts     # env parsing with defaults
    server.ts     # Express app + ExpressPeerServer + /health + connection logging
    index.ts      # entry: start server, graceful shutdown on SIGTERM/SIGINT
  Dockerfile
  README.md       # run locally, docker run, reverse-proxy TLS sample
  package.json
  tsconfig.json
```

### Config (`config.ts`)

All via environment variables, with defaults matching the current dev setup:

| Env var | Default | Meaning |
|---------|---------|---------|
| `PORT` | `9000` | HTTP/WS listen port |
| `PEER_PATH` | `/` | Mount path for the PeerServer endpoint |
| `PEER_KEY` | `peerjs` | API key clients must present (PeerJS client default) |

### Server (`server.ts`)

- Express app with `ExpressPeerServer` mounted at `PEER_PATH`.
- `GET /health` → `200 {"status":"ok"}` — consumed by the Docker `HEALTHCHECK` and any host monitoring.
- Logs `connection` / `disconnect` events with the peer ID.

### Entry (`index.ts`)

- Starts the HTTP server, logs the effective config.
- Graceful shutdown: on `SIGTERM`/`SIGINT`, stop accepting connections, close the server, exit — containers receive `SIGTERM` on stop.

### Scripts

`dev` (tsx watch), `build` (tsc to `dist/`), `start` (node `dist/index.js`), `typecheck`, `test` — same shape as sibling apps.

### Dependency moves

- `peer` moves from `apps/frontend` devDependencies to `apps/peerserver` dependencies.
- Root/frontend `dev:p2p` runs `@release/peerserver` dev instead of the `peerjs` CLI; the frontend `peerserver` script is removed.

## Docker

Multi-stage `apps/peerserver/Dockerfile`:

1. **Build stage** — `node:24-alpine`, pnpm via corepack, workspace install, `pnpm --filter @release/peerserver build`, then `pnpm deploy --filter @release/peerserver --prod` to produce a pruned standalone bundle (no workspace symlinks, prod deps only).
2. **Runtime stage** — `node:24-alpine`, non-root user, copies the deployed bundle, `EXPOSE 9000`, `HEALTHCHECK` hitting `http://localhost:9000/health`, `CMD ["node", "dist/index.js"]`.

Build context is the repo root (workspace install needs the lockfile); the Dockerfile lives with the app.

TLS is the host's job: the README documents the reverse-proxy pattern with a sample Caddy config (`wss://peer.example.com` → `localhost:9000`) and the matching `docker run` command.

## CI: `.github/workflows/peerserver.yml`

- **On tag `peerserver-v*`** (and `workflow_dispatch`): build with `docker/build-push-action`, push to `ghcr.io/mythhand/releaseboardgamep2p-peerserver` tagged with the version and `latest`. Job permissions: `packages: write`.
- **On PRs touching `apps/peerserver/**`**: build the image without pushing, as a smoke check.

## Frontend hookup (production build)

[deploy.yml](../../.github/workflows/deploy.yml) passes `VITE_PEER_HOST`, `VITE_PEER_PORT`, `VITE_PEER_PATH` into the `@release/web` build from GitHub repository **variables** (`vars.*`). While the variables are unset the build falls back to the PeerJS public cloud — identical to today's behavior — so the Pages deploy keeps working before the server is hosted anywhere. No client code changes.

## Testing

Vitest, colocated like the rest of the repo:

- `config.ts` — defaults applied when env is empty; overrides respected; invalid `PORT` rejected.
- `server.ts` — `/health` returns 200; PeerServer endpoint is mounted (route responds).

The PR image build in CI is the integration smoke check for the Dockerfile.

## Out of scope

- TURN server provisioning (client already supports one via env).
- Automatic deployment to a host (manual `docker pull` until a host is chosen).
- Any game or lobby logic changes.
