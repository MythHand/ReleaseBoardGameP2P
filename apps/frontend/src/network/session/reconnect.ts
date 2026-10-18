// One reconnection run, as the session actually experiences it. The overlay
// renders these into terminal lines; nothing here is presentation, so the copy
// rules and the UI package's i18n-agnosticism are both untouched.
export interface ReconnectEvent {
  kind: 'dialing' | 'channel-open' | 'handshake' | 'backoff' | 'failed'
  attempt: number
  at: number
}

// Bounded, then the player chooses: the overlay reaches its failed state and
// keeps retry and leave live, rather than auto-abandoning a match whose wifi
// is about to come back.
export const MAX_RECONNECT_ATTEMPTS = 5

// A guest is the one who has to wait out a host's wifi, so it keeps dialing
// for about two minutes: 18 attempts, 17 backoff gaps summing to ~111.5 s
// (see backoffMs), plus dial time. Only the guest loop uses this; the host's
// restore retry stays on MAX_RECONNECT_ATTEMPTS.
export const GUEST_RECONNECT_ATTEMPTS = 18

// Exponential with a ceiling. The cap matters more than the curve: a fifth
// attempt eight seconds out still feels like the app is trying, where
// thirty-two would read as hung.
export function backoffMs(attempt: number): number {
  return Math.min(8_000, 500 * 2 ** (attempt - 1))
}
