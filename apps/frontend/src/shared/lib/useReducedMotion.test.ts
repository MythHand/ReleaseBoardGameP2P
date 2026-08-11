import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { useReducedMotion } from './useReducedMotion'

let listeners: ((e: { matches: boolean }) => void)[] = []
let matches = false

beforeEach(() => {
  listeners = []
  matches = false
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => listeners.push(fn),
    removeEventListener: (_: string, fn: (e: { matches: boolean }) => void) => {
      listeners = listeners.filter((l) => l !== fn)
    },
  }))
})

it('reports the preference as it stands at mount', () => {
  matches = true
  const { result } = renderHook(() => useReducedMotion())
  expect(result.current).toBe(true)
})

it('follows a change made while mounted', () => {
  const { result } = renderHook(() => useReducedMotion())
  expect(result.current).toBe(false)
  act(() => {
    for (const l of listeners) l({ matches: true })
  })
  expect(result.current).toBe(true)
})

it('stops listening when unmounted', () => {
  const { unmount } = renderHook(() => useReducedMotion())
  expect(listeners).toHaveLength(1)
  unmount()
  expect(listeners).toHaveLength(0)
})
