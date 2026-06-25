/// <reference types="vite/client" />

// Typing for the app's custom environment variables. Vite only exposes
// `VITE_`-prefixed vars to client code; built-ins (BASE_URL, DEV, …) come from
// `vite/client`. All custom vars are optional — unset by default in local/dev.
// The authoritative description of each lives next to its constant
// (network/config.ts, shared/config.ts); keep this to types only.
interface ImportMetaEnv {
  // --- P2P signaling (PeerServer) ---
  readonly VITE_PEER_HOST?: string
  readonly VITE_PEER_PORT?: string
  readonly VITE_PEER_PATH?: string
  // --- ICE / TURN relay ---
  readonly VITE_TURN_URL?: string
  readonly VITE_TURN_USERNAME?: string
  readonly VITE_TURN_CREDENTIAL?: string
  readonly VITE_STUN_URL?: string
}
