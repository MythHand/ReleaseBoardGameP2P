import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import CopyButton from './CopyButton'

afterEach(() => vi.useRealTimers())
it('invokes copy inside the click and confirms only a successful write', async () => {
  vi.useFakeTimers()
  let complete!: (result: boolean) => void
  const onCopy = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        complete = resolve
      }),
  )
  render(
    <CopyButton copyValue="ROOM" onCopy={onCopy} copiedChildren="copied">
      copy
    </CopyButton>,
  )
  fireEvent.click(screen.getByRole('button'))
  expect(onCopy).toHaveBeenCalledWith('ROOM')
  expect(screen.queryByText('copied')).toBeNull()
  await act(async () => {
    complete(true)
    await Promise.resolve()
  })
  expect(screen.getByText('copied')).toBeTruthy()
  act(() => {
    vi.advanceTimersByTime(1800)
  })
  expect(screen.getByText('copy')).toBeTruthy()
})
it.each([
  false,
  new Error('rejected'),
])('does not confirm an unsuccessful callback', async (result) => {
  const onCopy = vi.fn(() => (result === false ? Promise.resolve(false) : Promise.reject(result)))
  render(
    <CopyButton copyValue="ROOM" onCopy={onCopy} copiedChildren="copied">
      copy
    </CopyButton>,
  )
  await act(async () => {
    fireEvent.click(screen.getByRole('button'))
    await Promise.resolve()
  })
  expect(onCopy).toHaveBeenCalledOnce()
  expect(screen.queryByText('copied')).toBeNull()
})
it('is inactive without a supplied copy operation', () => {
  render(<CopyButton copyValue="ROOM">copy</CopyButton>)
  expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true)
})
