// Single source of environment configuration for the frontend. Every
// import.meta.env access lives here and is re-exported as a named, commented
// constant, so the rest of the app depends on these names rather than scattered
// raw env reads. Values are inlined by Vite at build time (constant per build).
//
// Note: `network/` consumes the P2P constants below, which means it imports
// "upward" into `shared` — a deliberate exception to the one-way layer rule, so
// that all env config stays in one place.

// ─── Build / runtime (Vite built-ins) ───────────────────────────────────────

// The app's base path (Vite `base`). Always has a trailing slash: "/" in dev,
// "/ReleaseBoardGameP2P/" on GitHub Pages. Prefix absolute in-app URLs and
// out-of-router links (e.g. the playground) with this.
export const BASE_URL = import.meta.env.BASE_URL

// True under `vite dev`, false in production builds. Gate dev-only affordances
// (e.g. surfacing raw error detail) behind this.
export const IS_DEV = import.meta.env.DEV

// ─── P2P signaling (PeerServer) ─────────────────────────────────────────────

// Custom PeerJS signaling broker (a hosted/self-hosted PeerServer). When unset,
// PeerJS uses its public cloud (0.peerjs.com). Point this at a local PeerServer
// for dev — see `pnpm dev:p2p`.
export const PEER_HOST = import.meta.env.VITE_PEER_HOST

// Port of the custom signaling broker. Defaults to 9000 (PeerServer's default).
// Only consulted when PEER_HOST is set.
export const PEER_PORT = import.meta.env.VITE_PEER_PORT
  ? Number(import.meta.env.VITE_PEER_PORT)
  : 9000

// HTTP path the custom signaling broker is mounted under. Defaults to "/".
// Only consulted when PEER_HOST is set.
export const PEER_PATH = import.meta.env.VITE_PEER_PATH ?? '/'

// ─── ICE / TURN relay ───────────────────────────────────────────────────────

// TURN relay URL (e.g. `turn:turn.example.com:3478` or `turns:…:443`). Set this
// to a reliable TURN so peers behind symmetric NAT / restrictive firewalls can
// still connect; without it PeerJS falls back to its rate-limited public TURN
// and cross-network ICE negotiation often fails.
export const TURN_URL = import.meta.env.VITE_TURN_URL

// Long-term credentials for the TURN relay above (ignored when TURN_URL is unset).
export const TURN_USERNAME = import.meta.env.VITE_TURN_USERNAME
export const TURN_CREDENTIAL = import.meta.env.VITE_TURN_CREDENTIAL

// STUN server for host/srflx candidate discovery. Only used when a custom TURN
// is configured — a custom ICE config replaces PeerJS's default (which bundles
// its own STUN), so one must be supplied here. Defaults to Google's public STUN.
export const STUN_URL = import.meta.env.VITE_STUN_URL ?? 'stun:stun.l.google.com:19302'
