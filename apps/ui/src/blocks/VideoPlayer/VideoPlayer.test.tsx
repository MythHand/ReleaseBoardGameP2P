import { act, cleanup, fireEvent, render } from '@testing-library/react'
import Modal from '@/primitives/Modal'
import VideoPlayer from './VideoPlayer'

it('leaves the video open until the modal above it has finished closing', () => {
  vi.useFakeTimers()
  const close = vi.fn()
  const content = (open: boolean) => (
    <>
      <VideoPlayer
        src="about:blank"
        copy={{ videoReview: 'Play video', close: 'Close video', title: 'Video' }}
      />
      <Modal open={open} onClose={close}>
        Dialog
      </Modal>
    </>
  )
  const { getByRole, queryByRole, rerender } = render(content(false))
  fireEvent.click(getByRole('button', { name: 'Play video' }))
  act(() => vi.advanceTimersByTime(50))
  rerender(content(true))
  act(() => vi.advanceTimersByTime(50))
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(close).toHaveBeenCalledTimes(1)
  expect(queryByRole('button', { name: 'Play video' })).toBeNull()
  rerender(content(false))
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(queryByRole('button', { name: 'Play video' })).toBeNull()
  act(() => vi.advanceTimersByTime(400))
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(getByRole('button', { name: 'Play video' })).toBeTruthy()
  cleanup()
  vi.useRealTimers()
})
