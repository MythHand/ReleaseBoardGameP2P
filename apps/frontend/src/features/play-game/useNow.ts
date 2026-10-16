import { useEffect, useState, useSyncExternalStore } from 'react'
import type { GameClock } from '~/network/session/clock'

const subscribeNone = () => () => {}
const uncalibrated = () => 0

// Calibration belongs to the link, so it survives Board remounts. Read time
// on render as well as ticks: a new deadline cannot paint with stale time.
export function useNow(active: boolean, clock: GameClock | null, intervalMs = 250): number | null {
  useSyncExternalStore(clock?.subscribe ?? subscribeNone, clock?.getSnapshot ?? uncalibrated)
  const [, tick] = useState(0)
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => tick((value) => value + 1), intervalMs)
    return () => clearInterval(id)
  }, [active, intervalMs])
  return clock?.now() ?? null
}
