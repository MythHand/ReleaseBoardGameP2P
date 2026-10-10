import { act, renderHook } from '@testing-library/react'
import { vi } from 'vitest'
import { checkRoom, type JoinAvailability } from '~/network'
import { useRoomAvailability } from '../useRoomAvailability'

vi.mock('~/network', () => ({ checkRoom: vi.fn() }))

it('ignores a stale result after the user changes the code and aborts on unmount', async () => {
  const results: ((value: JoinAvailability) => void)[] = []
  const signals: (AbortSignal | undefined)[] = []
  vi.mocked(checkRoom).mockImplementation((_code, signal) => {
    signals.push(signal)
    return new Promise((resolve) => results.push(resolve))
  })
  const hook = renderHook(({ code }) => useRoomAvailability(code), {
    initialProps: { code: 'AAA-234' },
  })
  act(() => {
    void hook.result.current.check()
  })
  hook.rerender({ code: 'BBB-234' })
  expect(signals[0]?.aborted).toBe(true)
  act(() => {
    void hook.result.current.check()
  })
  await act(async () => results[0]({ player: false, spectator: false }))
  expect(hook.result.current.codeState).toBe('checking')
  expect(hook.result.current.availability).toBeNull()
  await act(async () => results[1]({ player: false, spectator: true }))
  expect(hook.result.current.availability).toEqual({ player: false, spectator: true })
  hook.unmount()
  expect(signals[1]?.aborted).toBe(true)
})
