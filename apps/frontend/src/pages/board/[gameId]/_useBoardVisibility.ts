import { useLayoutEffect, useState } from 'react'

// Hidden documents can suspend both animation frames and incoming messages.
// Drop the visual instance, then absorb queued delivery through the first
// visible paint before animating new events again. The game/session stays live.
export function useBoardVisibility() {
  const [visibility, setVisibility] = useState(() => ({
    visible: document.visibilityState !== 'hidden',
    catchingUp: false,
    epoch: 0,
  }))

  useLayoutEffect(() => {
    let frame = 0
    const change = () => {
      cancelAnimationFrame(frame)
      if (document.visibilityState === 'hidden') {
        setVisibility((previous) => ({
          visible: false,
          catchingUp: false,
          epoch: previous.epoch + 1,
        }))
        return
      }
      setVisibility((previous) => ({ ...previous, visible: true, catchingUp: true }))
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          setVisibility((previous) => ({ ...previous, catchingUp: false }))
        })
      })
    }
    document.addEventListener('visibilitychange', change)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('visibilitychange', change)
    }
  }, [])

  return visibility
}
