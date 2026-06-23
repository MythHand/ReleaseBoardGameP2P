import { act, render } from '@testing-library/react'
import Modal from './Modal'

// jsdom polyfills requestAnimationFrame as setTimeout(fn, 0).
// Fake timers let us advance through both rAF frames synchronously.

it('focuses the first focusable element when opened', async () => {
  vi.useFakeTimers()
  render(
    <Modal open onClose={() => {}}>
      <button type="button">First</button>
      <button type="button">Second</button>
    </Modal>,
  )
  await act(async () => {
    vi.runAllTimers()
  })
  expect(document.activeElement?.textContent).toBe('First')
  vi.useRealTimers()
})

it('restores focus to the previously focused element on close', async () => {
  vi.useFakeTimers()
  const trigger = document.createElement('button')
  document.body.appendChild(trigger)
  trigger.focus()

  const { rerender } = render(
    <Modal open onClose={() => {}}>
      <button type="button">Inside</button>
    </Modal>,
  )
  await act(async () => {
    vi.runAllTimers()
  })

  rerender(
    <Modal open={false} onClose={() => {}}>
      <button type="button">Inside</button>
    </Modal>,
  )
  await act(async () => {
    vi.runAllTimers()
  })

  expect(document.activeElement).toBe(trigger)
  document.body.removeChild(trigger)
  vi.useRealTimers()
})

it('wraps Tab from the last focusable element to the first', async () => {
  vi.useFakeTimers()
  const { container, getByText } = render(
    <Modal open onClose={() => {}}>
      <button type="button">First</button>
      <button type="button">Last</button>
    </Modal>,
  )
  await act(async () => {
    vi.runAllTimers()
  })

  // biome-ignore lint/style/noNonNullAssertion: dialog is guaranteed to exist in this test
  const dialog = container.querySelector('dialog')!
  ;(getByText('Last') as HTMLButtonElement).focus()
  dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))

  expect(document.activeElement?.textContent).toBe('First')
  vi.useRealTimers()
})

it('wraps Shift+Tab from the first focusable element to the last', async () => {
  vi.useFakeTimers()
  const { container, getByText } = render(
    <Modal open onClose={() => {}}>
      <button type="button">First</button>
      <button type="button">Last</button>
    </Modal>,
  )
  await act(async () => {
    vi.runAllTimers()
  })

  // biome-ignore lint/style/noNonNullAssertion: dialog is guaranteed to exist in this test
  const dialog = container.querySelector('dialog')!
  ;(getByText('First') as HTMLButtonElement).focus()
  dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }))

  expect(document.activeElement?.textContent).toBe('Last')
  vi.useRealTimers()
})

it('has aria-modal="true" and aria-labelledby pointing to the title', () => {
  const { container } = render(
    <Modal open onClose={() => {}} title="My Modal">
      <p>Content</p>
    </Modal>,
  )
  // biome-ignore lint/style/noNonNullAssertion: dialog is guaranteed to exist in this test
  const dialog = container.querySelector('dialog')!
  expect(dialog.getAttribute('aria-modal')).toBe('true')
  // biome-ignore lint/style/noNonNullAssertion: aria-labelledby is guaranteed to be set
  const labelId = dialog.getAttribute('aria-labelledby')!
  expect(labelId).toBeTruthy()
  expect(document.getElementById(labelId)?.textContent).toBe('My Modal')
})
