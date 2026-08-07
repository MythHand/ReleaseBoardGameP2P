import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useNow } from './useNow'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

it('advances while a deadline is live', () => {
  const { result } = renderHook(() => useNow(true, 100))
  const first = result.current
  act(() => {
    vi.advanceTimersByTime(300)
  })
  expect(result.current).toBeGreaterThan(first)
})

it('holds still when nothing is counting down', () => {
  const { result } = renderHook(() => useNow(false, 100))
  const first = result.current
  act(() => {
    vi.advanceTimersByTime(300)
  })
  // The whole table re-renders on every tick, so an unconditional interval
  // would run four times a second for an entire game to animate a ring that
  // is not on screen.
  expect(result.current).toBe(first)
})

it('stops its interval when the deadline closes', () => {
  const { result, rerender } = renderHook(({ active }) => useNow(active, 100), {
    initialProps: { active: true },
  })
  act(() => {
    vi.advanceTimersByTime(300)
  })
  rerender({ active: false })
  const settled = result.current
  act(() => {
    vi.advanceTimersByTime(300)
  })
  expect(result.current).toBe(settled)
})
