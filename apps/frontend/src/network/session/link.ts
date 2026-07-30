import type { Event, PlayerId, PlayerView } from '@release/engine'
import type { Intent } from '../types'
import { applyIntent, commit, driveAbsent, type Outgoing, type SessionRef, tick } from './referee'

export interface Sync {
  view: PlayerView
  events: Event[]
}

// The seam. `useGame` and the page hold this and nothing else, so they cannot
// tell a local engine from a remote keeper — which is what lets solo play, the
// playground, and every headless test exercise the same code the network does.
export interface GameLink {
  submit(intent: Intent): void
  subscribe(listener: (sync: Sync) => void): () => void
  close(): void
}

// Injected so tests drive time by hand instead of waiting on a real clock.
export interface Ticker {
  start(fn: () => void): void
  stop(): void
}

export function intervalTicker(ms = 250): Ticker {
  let handle: ReturnType<typeof setInterval> | null = null
  return {
    start(fn) {
      handle = setInterval(fn, ms)
    },
    stop() {
      if (handle !== null) clearInterval(handle)
      handle = null
    },
  }
}

export function createLocalLink(args: {
  ref: SessionRef
  me: PlayerId
  now: () => number
  ticker?: Ticker
}): GameLink {
  const ticker = args.ticker ?? intervalTicker()
  const listeners = new Set<(sync: Sync) => void>()
  // The referee addresses seats by peer id, and a `PlayerId` is not one — it is
  // a persisted client uuid. Resolved per call rather than once, because a
  // rebind changes the seat's peer id under a link that outlives it. A seat
  // holding no connection still has this subscriber, so its own player id
  // stands in as the address the referee then fans out to.
  const myPeerId = () =>
    args.ref.current.seats.find((s) => s.playerId === args.me)?.peerId ?? args.me
  const deliver = (outgoing: Outgoing) => {
    // 'broadcast' is unreachable for SYNC today (only GAME_STARTED broadcasts,
    // and the type check below filters that out) — kept for future broadcast
    // SYNC producers so this guard doesn't silently drop them later.
    if (outgoing.to !== myPeerId() && outgoing.to !== 'broadcast') return
    if (outgoing.message.type !== 'SYNC') return
    for (const listener of listeners) listener(outgoing.message.payload)
  }

  ticker.start(() => {
    const now = args.now()
    commit(args.ref, tick(args.ref.current, now), deliver)
    commit(args.ref, driveAbsent(args.ref.current, now), deliver)
  })

  return {
    submit(intent) {
      commit(args.ref, applyIntent(args.ref.current, myPeerId(), intent, args.now()), deliver)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    close() {
      ticker.stop()
      listeners.clear()
    },
  }
}
