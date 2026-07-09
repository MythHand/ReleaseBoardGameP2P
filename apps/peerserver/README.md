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
