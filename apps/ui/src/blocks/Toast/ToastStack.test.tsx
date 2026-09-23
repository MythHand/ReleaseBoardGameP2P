import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import ToastStack from './ToastStack'

vi.mock('@/animations/play', () => ({ play: () => null }))

const copy = { hide: 'hide' }
const item = (id: string) => ({ id, node: <span>{id}</span> })

afterEach(() => vi.useRealTimers())

it('treats initial items as history and only shows later items', () => {
  const { rerender } = render(<ToastStack items={[item('a')]} copy={copy} />)
  expect(screen.queryByText('a')).toBeNull()
  rerender(<ToastStack items={[item('a'), item('b')]} copy={copy} />)
  expect(screen.getByText('b')).toBeTruthy()
})

it('keeps at most four live notifications and evicts the oldest', () => {
  const { rerender } = render(<ToastStack items={[]} copy={copy} />)
  rerender(<ToastStack items={['a', 'b', 'c', 'd', 'e'].map(item)} copy={copy} />)
  expect(screen.queryByText('a')).toBeNull()
  for (const id of ['b', 'c', 'd', 'e']) expect(screen.getByText(id)).toBeTruthy()
})

it('expires after six seconds', () => {
  vi.useFakeTimers()
  const { rerender } = render(<ToastStack items={[]} copy={copy} />)
  rerender(<ToastStack items={[item('b')]} copy={copy} />)
  act(() => vi.advanceTimersByTime(5_999))
  expect(screen.getByText('b')).toBeTruthy()
  act(() => vi.advanceTimersByTime(1))
  expect(screen.queryByText('b')).toBeNull()
})

it('pauses on hover and restarts the full hold after hover', () => {
  vi.useFakeTimers()
  const { rerender } = render(<ToastStack items={[]} copy={copy} />)
  rerender(<ToastStack items={[item('b')]} copy={copy} />)
  fireEvent.mouseEnter(screen.getByRole('log'))
  act(() => vi.advanceTimersByTime(12_000))
  expect(screen.getByText('b')).toBeTruthy()
  fireEvent.mouseLeave(screen.getByRole('log'))
  act(() => vi.advanceTimersByTime(6_000))
  expect(screen.queryByText('b')).toBeNull()
})

it('opens the chat from a notification click', () => {
  const onOpen = vi.fn()
  const { rerender } = render(<ToastStack items={[]} copy={copy} onOpen={onOpen} />)
  rerender(<ToastStack items={[item('b')]} copy={copy} onOpen={onOpen} />)
  fireEvent.click(screen.getByRole('button', { name: 'b' }))
  expect(onOpen).toHaveBeenCalledOnce()
})
