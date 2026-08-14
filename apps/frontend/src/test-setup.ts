// Stub window.matchMedia for jsdom (not implemented natively).
// vi.spyOn in individual tests can then override the return value.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (_query: string) => ({
    matches: false,
    media: _query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

// Stub the Web Animations API for jsdom (not implemented there either).
// `play()` in @release/ui/animations already guards its OWN call
// (`typeof el.animate !== 'function'`) and no-ops rather than throwing, but
// the flight steps underneath it (`useFlyer`'s I3 cleanup, `useHandArrival`'s
// own flight) call `el.getAnimations()` / `el.animate()` directly against a
// real element for their internal bookkeeping — a test that drives a real
// node through them (rather than mocking the step itself) needs the methods
// to exist. Returning inert results is enough: no test here asserts on the
// animation's own playback, only on what the step does once it settles.
if (typeof Element.prototype.getAnimations !== 'function') {
  Element.prototype.getAnimations = () => []
}
if (typeof Element.prototype.animate !== 'function') {
  Element.prototype.animate = () =>
    ({
      cancel: () => {},
      finish: () => {},
      finished: Promise.resolve(),
      onfinish: null,
    }) as unknown as Animation
}
