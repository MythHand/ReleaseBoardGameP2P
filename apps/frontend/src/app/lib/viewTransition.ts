function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

// Wrap a state/route update in a View Transition when the browser supports it
// and the user allows motion. Falls back to a plain synchronous update (jsdom,
// older browsers, reduced-motion) so callers never branch.
export function runViewTransition(update: () => void): void {
  if (typeof document.startViewTransition !== 'function' || prefersReducedMotion()) {
    update()
    return
  }
  document.startViewTransition(update)
}
