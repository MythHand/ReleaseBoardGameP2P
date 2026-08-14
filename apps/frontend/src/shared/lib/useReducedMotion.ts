import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

// Every animation in this project honours the preference. The CSS modules do it
// with a media query; JS-driven choreography has to ask, because `play()` in
// @release/ui does not check it — it drives WAAPI directly.
//
// Live rather than read-once: the preference can change while a page is open,
// and an intro that started animating should be able to stop.
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(QUERY).matches,
  )

  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    // Typed against MediaQueryListEvent (what addEventListener('change', …)
    // actually delivers) rather than the brief's `{ matches: boolean }`,
    // which does not structurally satisfy DOM's EventListener parameter and
    // fails typecheck. The test's mock event shape is still assignable here.
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return reduced
}
