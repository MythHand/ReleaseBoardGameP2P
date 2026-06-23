import { afterEach, vi } from 'vitest'
import { runViewTransition } from './viewTransition'

afterEach(() => {
  vi.restoreAllMocks()
  // @ts-expect-error cleanup test shim
  delete document.startViewTransition
})

it('runs the update directly when startViewTransition is unavailable (jsdom)', () => {
  const update = vi.fn()
  runViewTransition(update)
  expect(update).toHaveBeenCalledTimes(1)
})

it('uses startViewTransition when available and motion is allowed', () => {
  const start = vi.fn((cb: () => void) => {
    cb()
    return { finished: Promise.resolve() }
  })
  // @ts-expect-error test shim
  document.startViewTransition = start
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList)
  const update = vi.fn()
  runViewTransition(update)
  expect(start).toHaveBeenCalledTimes(1)
  expect(update).toHaveBeenCalledTimes(1)
})

it('skips startViewTransition when reduced motion is preferred', () => {
  const start = vi.fn()
  document.startViewTransition = start
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
  const update = vi.fn()
  runViewTransition(update)
  expect(start).not.toHaveBeenCalled()
  expect(update).toHaveBeenCalledTimes(1)
})
