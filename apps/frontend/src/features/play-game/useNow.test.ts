import { act, renderHook } from '@testing-library/react'
import { createRemoteClock } from '~/network/session/clock'
import { useNow } from './useNow'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
})
afterEach(() => vi.useRealTimers())

it('uses keeper time and responds immediately to clock-only calibration', () => {
  const clock = createRemoteClock(() => performance.now())
  const { result, unmount } = renderHook(() => useNow(true, clock, 100))
  expect(result.current).toBeNull()
  act(() => clock.anchor(10_000, performance.now()))
  expect(result.current).toBe(10_000)
  act(() => {
    vi.advanceTimersByTime(300)
  })
  expect(result.current).toBe(10_300)
  act(() => vi.setSystemTime(-3_523_000))
  act(() => {
    vi.advanceTimersByTime(100)
  })
  expect(result.current).toBe(10_400)
  act(() => clock.reset())
  expect(result.current).toBeNull()
  unmount()
  expect(vi.getTimerCount()).toBe(0)
})

it('has no interval while inactive and reads current time on activation', () => {
  let mono = 0
  const clock = createRemoteClock(() => mono)
  clock.anchor(1000, mono)
  const { result, rerender } = renderHook(({ active }) => useNow(active, clock, 100), {
    initialProps: { active: false },
  })
  expect(vi.getTimerCount()).toBe(0)
  mono = 500
  rerender({ active: true })
  expect(result.current).toBe(1500)
  expect(vi.getTimerCount()).toBe(1)
  rerender({ active: false })
  expect(vi.getTimerCount()).toBe(0)
})

it('never falls back to client epoch without a link clock', () => {
  const { result } = renderHook(() => useNow(true, null))
  expect(result.current).toBeNull()
})
