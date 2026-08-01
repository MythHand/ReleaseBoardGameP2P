import { useEffect, useState } from 'react'

// The consumer's clock for the kit's countdown. It ticks only while something
// is actually counting down: `deriveDock` reads `now` for deadline arithmetic
// and nothing else, so a stale value between windows is never observed.
export function useNow(active: boolean, intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [active, intervalMs])

  return now
}
