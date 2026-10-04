export const CALL_SETUP_TIMEOUT_MS = 15000
export const DISCONNECT_GRACE_MS = 2000
export const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 15000]
export interface RetryScheduler {
  start(key: string, attempt: (index: number) => Promise<boolean>): void
  cancel(key: string): void
  dispose(): void
}
export function createRetryScheduler(): RetryScheduler {
  const active = new Map<string, { timer?: ReturnType<typeof setTimeout> }>()
  const exhausted = new Set<string>()
  let disposed = false
  const cancel = (key: string) => {
    const pending = active.get(key)
    clearTimeout(pending?.timer)
    active.delete(key)
  }
  return {
    start(key, attempt) {
      if (disposed || active.has(key) || exhausted.has(key)) return
      const owner: { timer?: ReturnType<typeof setTimeout> } = {}
      active.set(key, owner)
      const schedule = (index: number, delay: number) => {
        owner.timer = setTimeout(() => {
          if (disposed || active.get(key) !== owner) return
          void Promise.resolve()
            .then(() => attempt(index))
            .catch(() => false)
            .then((success) => {
              if (disposed || active.get(key) !== owner) return
              if (success) {
                active.delete(key)
                return
              }
              if (index === RETRY_DELAYS_MS.length - 1) {
                active.delete(key)
                exhausted.add(key)
                return
              }
              schedule(index + 1, RETRY_DELAYS_MS[index + 1])
            })
        }, delay)
      }
      schedule(0, DISCONNECT_GRACE_MS + RETRY_DELAYS_MS[0])
    },
    cancel,
    dispose() {
      disposed = true
      for (const key of active.keys()) cancel(key)
      exhausted.clear()
    },
  }
}
