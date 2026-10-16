import type { RemoteClock } from './clock'

export function createClockProbe(args: {
  clock: RemoteClock
  monotonicNow: () => number
  send(gameId: string, requestId: number): void
}) {
  let gameId: string | null = null
  let nextId = 0
  let closed = false
  const pending = new Map<number, number>()
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const schedule = (fn: () => void, ms: number) => {
    const timer = setTimeout(() => {
      timers.delete(timer)
      fn()
    }, ms)
    timers.add(timer)
  }
  const send = () => {
    if (closed || !gameId) return
    const now = args.monotonicNow()
    for (const [id, at] of pending) if (now - at > 5_000) pending.delete(id)
    if (pending.size >= 3) return
    const id = ++nextId
    // Register before send: the memory transport can reply synchronously.
    pending.set(id, now)
    args.send(gameId, id)
  }
  let burstUntil = -Infinity
  const refresh = () => {
    if (closed || !gameId || args.monotonicNow() < burstUntil) return
    burstUntil = args.monotonicNow() + 500
    send()
    schedule(send, 250)
    schedule(send, 500)
  }
  const periodic = () => {
    if (closed || !gameId) return
    send()
    schedule(periodic, 10_000)
  }
  const reset = () => {
    gameId = null
    burstUntil = -Infinity
    for (const timer of timers) clearTimeout(timer)
    timers.clear()
    pending.clear()
    args.clock.reset()
  }
  return {
    activate(id: string) {
      if (closed) return
      reset()
      gameId = id
      refresh()
      schedule(periodic, 10_000)
    },
    reset,
    refresh,
    receive(payload: unknown) {
      if (closed || !payload || typeof payload !== 'object') return
      const value = payload as Record<string, unknown>
      if (value.gameId !== gameId || typeof value.requestId !== 'number') return
      const sent = pending.get(value.requestId)
      if (sent === undefined) return
      if (typeof value.receivedAt !== 'number' || typeof value.sentAt !== 'number') return
      const received = args.monotonicNow()
      pending.delete(value.requestId)
      if (received - sent > 5_000) return
      args.clock.sample({
        sentAtLocal: sent,
        receivedAtLocal: received,
        receivedAtKeeper: value.receivedAt,
        sentAtKeeper: value.sentAt,
      })
    },
    close() {
      reset()
      closed = true
    },
  }
}
