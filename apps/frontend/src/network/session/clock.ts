export interface GameClock {
  now(): number | null
  getSnapshot(): number
  subscribe(listener: () => void): () => void
}

export interface ClockSample {
  sentAtLocal: number
  receivedAtLocal: number
  receivedAtKeeper: number
  sentAtKeeper: number
}

export interface RemoteClock extends GameClock {
  anchor(keeperNow: number, receivedAt: number): void
  sample(value: ClockSample): boolean
  reset(): void
}

export function createAuthorityClock(args: {
  epochNow: () => number
  monotonicNow: () => number
  initialKeeperNow?: number
}): Omit<GameClock, 'now'> & { now(): number } {
  const epoch = args.initialKeeperNow ?? args.epochNow()
  const start = args.monotonicNow()
  return {
    now: () => epoch + (args.monotonicNow() - start),
    getSnapshot: () => 0,
    subscribe: () => () => {},
  }
}

export function createRemoteClock(monotonicNow: () => number): RemoteClock {
  interface Anchor {
    keeper: number
    local: number
    rtt: number
  }
  const listeners = new Set<() => void>()
  let revision = 0
  let anchor: Anchor | null = null
  let samples: Anchor[] = []
  const changed = () => {
    revision++
    for (const listener of listeners) listener()
  }
  return {
    now: () => anchor && anchor.keeper + (monotonicNow() - anchor.local),
    getSnapshot: () => revision,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    anchor(keeper, local) {
      if (anchor || !Number.isFinite(keeper) || !Number.isFinite(local)) return
      anchor = { keeper, local, rtt: Infinity }
      changed()
    },
    sample(value) {
      if (!Object.values(value).every(Number.isFinite)) return false
      const elapsed = value.receivedAtLocal - value.sentAtLocal
      const processing = value.sentAtKeeper - value.receivedAtKeeper
      const rtt = elapsed - processing
      if (elapsed < 0 || processing < 0 || rtt < 0) return false
      const sample = { keeper: value.sentAtKeeper + rtt / 2, local: value.receivedAtLocal, rtt }
      samples = [...samples.filter((s) => sample.local - s.local <= 30_000), sample].slice(-8)
      const best = samples.reduce((a, b) => (b.rtt <= a.rtt ? b : a))
      if (anchor !== best) {
        anchor = best
        changed()
      }
      return true
    },
    reset() {
      anchor = null
      samples = []
      changed()
    },
  }
}
