# Deploying the signaling server

This directory is the whole production deployment: two containers defined in
[compose.yaml](./compose.yaml) — the signaling server itself and Caddy, which
terminates TLS and proxies to it. Docker is the only thing the host needs
installed, so moving to another VPS is copying this directory and running one
command.

The server holds no game state and no database. The only state on the host is
Caddy's certificate volume, which regenerates itself on a new host.

## Prerequisites

- A host with Docker (`curl -fsSL https://get.docker.com | sh`).
- A DNS A record pointing at the host's IP. Caddy requests a certificate for
  exactly this name, so it must resolve *before* the first `docker compose up`.
- Ports 80 and 443 reachable. Port 80 is required for the ACME HTTP challenge,
  not just redirects — a firewall that blocks it means no certificate.
- Nothing else bound to 80/443 on the host. A Caddy or nginx installed with
  `apt` will hold those ports: `systemctl disable --now caddy`.

## First deploy

```bash
# on the host, from a copy of this directory
cp .env.example .env
$EDITOR .env            # set PEER_DOMAIN and PEERSERVER_IMAGE
docker compose up -d
docker compose logs -f caddy   # watch the certificate get issued
```

If the image is a private package, `docker login ghcr.io -u <user>` first with
a classic token carrying `read:packages` — the container registry does not
accept fine-grained tokens. Making the package public avoids credentials on the
host entirely.

## Verify

From the host:

```bash
docker compose ps                      # both services up, peerserver healthy
docker compose exec peerserver wget -qO- http://localhost:9000/health
```

From anywhere, against the real domain:

```bash
curl -s https://<domain>/health        # {"status":"ok"}
curl -s https://<domain>/peerjs/id     # a fresh UUID
```

To prove the WebSocket path — the part that actually matters for signaling —
force HTTP/1.1, because upgrade headers are meaningless over HTTP/2 and will
answer 404:

```bash
curl -sS -i --http1.1 -N -m 8 \
  -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  "https://<domain>/peerjs?key=peerjs&id=probe123&token=tok"
```

`HTTP/1.1 101 Switching Protocols` is the success case.

## Update to a new image

```bash
$EDITOR .env            # bump PEERSERVER_IMAGE to the new tag
docker compose up -d    # recreates only what changed
```

Connected players drop their signaling socket during the swap and the PeerJS
client reconnects; games already in progress are unaffected, because game
traffic is peer-to-peer and never passes through this server.

To roll back, put the previous tag in `.env` and run `docker compose up -d`
again.

## Move to another host

The domain is what players' browsers were built to reach, so the move is a DNS
switch — the game keeps working through the old host until it flips.

1. Stand up the new host exactly as in **First deploy**, with the same
   `PEER_DOMAIN`. Certificate issuance fails there until DNS points at it; that
   is expected and resolves itself in step 3.
2. Leave the old host running.
3. Repoint the DNS A record at the new host and wait for it to propagate
   (`dig +short <domain>`).
4. Watch the new host issue its certificate (`docker compose logs -f caddy`),
   then run the **Verify** checks against the domain.
5. Tear down the old host: `docker compose down`.

If the domain itself changes, the frontend must be rebuilt: update the
`VITE_PEER_HOST` / `VITE_PEER_PORT` / `VITE_PEER_PATH` repository variables and
re-run [deploy.yml](../../../.github/workflows/deploy.yml). Until that deploy
finishes, published clients still point at the old name.

## Troubleshooting

| Symptom | Cause |
|---|---|
| Caddy logs an ACME failure | DNS not propagated yet, or port 80 blocked upstream |
| `bind: address already in use` | An apt-installed Caddy/nginx holds 80/443 |
| 502 from the domain | `peerserver` container is down — `docker compose logs peerserver` |
| `denied` / `manifest unknown` on pull | Package is private and the host has no `read:packages` credentials |
| WebSocket probe returns 404 | Probe went over HTTP/2 — re-run it with `--http1.1` |

## Not covered here

TURN relaying, which peers behind symmetric NAT need in addition to signaling;
see the TURN section of the [app README](../README.md).
