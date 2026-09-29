import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { KEYBOARD_PRIORITY, useKeyboardLayer } from '@/keyboard'
import Modal from './Modal'

function Background({ cancel, jump }: { cancel: () => void; jump?: () => void }) {
  useKeyboardLayer({
    name: 'background',
    active: true,
    priority: KEYBOARD_PRIORITY.screen,
    bindings: [
      {
        key: 'Escape',
        focus: 'any',
        run: () => {
          cancel()
          return 'handled'
        },
      },
      {
        key: ' ',
        run: () => {
          jump?.()
          return 'handled'
        },
      },
    ],
  })
  return null
}

describe('layer ownership', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })
  const settle = () => act(() => vi.advanceTimersByTime(50))

  it('closes only the latest modal, even after the older one rerenders or focus leaves', () => {
    const first = vi.fn()
    const second = vi.fn()
    const cancel = vi.fn()
    const content = (title: string) => (
      <>
        <Background cancel={cancel} />
        <Modal open title={title} onClose={first}>
          <input aria-label="first" />
        </Modal>
        <Modal open title="Second" onClose={second}>
          <input aria-label="second" />
        </Modal>
      </>
    )
    const { rerender, getByRole } = render(content('First'))
    settle()
    expect(document.activeElement).toBe(getByRole('textbox', { name: 'second' }))
    rerender(content('First updated'))
    fireEvent.keyDown(getByRole('textbox', { name: 'second' }), { key: 'Escape' })
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(second).toHaveBeenCalledTimes(2)
    expect(first).not.toHaveBeenCalled()
    expect(cancel).not.toHaveBeenCalled()
  })

  it('blocks escape through the exit transition and does not cascade a held key afterward', () => {
    const close = vi.fn()
    const cancel = vi.fn()
    const content = (open: boolean) => (
      <>
        <Background cancel={cancel} />
        <Modal open={open} onClose={close}>
          Content
        </Modal>
      </>
    )
    const { rerender } = render(content(true))
    settle()
    fireEvent.keyDown(window, { key: 'Escape' })
    rerender(content(false))
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.keyDown(window, { key: 'Escape', repeat: true })
    expect(close).toHaveBeenCalledTimes(1)
    expect(cancel).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(380))
    fireEvent.keyDown(window, { key: 'Escape', repeat: true })
    expect(cancel).not.toHaveBeenCalled()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it('blocks a background Space while preserving input and button keys inside', () => {
    const jump = vi.fn()
    const local = vi.fn()
    const { getByRole } = render(
      <>
        <Background cancel={() => {}} jump={jump} />
        <Modal open onClose={() => {}}>
          <input aria-label="compose" onKeyDown={local} />
          <button type="button" onKeyDown={local}>
            Action
          </button>
        </Modal>
      </>,
    )
    settle()
    expect(fireEvent.keyDown(document.body, { key: ' ' })).toBe(false)
    expect(fireEvent.keyDown(getByRole('textbox'), { key: ' ' })).toBe(true)
    expect(fireEvent.keyDown(getByRole('button', { name: 'Action' }), { key: ' ' })).toBe(true)
    expect(local).toHaveBeenCalledTimes(2)
    expect(jump).not.toHaveBeenCalled()
  })

  it('traps Tab from outside and falls back to the dialog when all controls are disabled', () => {
    const { getByRole } = render(
      <Modal open onClose={() => {}}>
        <button type="button">First</button>
      </Modal>,
    )
    settle()
    fireEvent.keyDown(document.body, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(getByRole('button', { name: 'close' }))
    for (const button of getByRole('dialog').querySelectorAll('button')) button.disabled = true
    fireEvent.keyDown(document.body, { key: 'Tab' })
    expect(document.activeElement).toBe(getByRole('dialog'))
  })

  it('closing a lower modal never restores focus over the remaining top one', () => {
    const trigger = document.createElement('button')
    document.body.append(trigger)
    trigger.focus()
    const content = (first: boolean) => (
      <>
        <Modal open={first} title="First" onClose={() => {}}>
          <input aria-label="first" />
        </Modal>
        <Modal open title="Second" onClose={() => {}}>
          <input aria-label="second" />
        </Modal>
      </>
    )
    const { rerender, getByRole } = render(content(true))
    settle()
    rerender(content(false))
    act(() => vi.advanceTimersByTime(400))
    expect(document.activeElement).toBe(getByRole('textbox', { name: 'second' }))
    trigger.remove()
  })

  it('returns focus within the remaining modal when the captured trigger was removed', () => {
    const content = (second: boolean, trigger: boolean) => (
      <>
        <Modal open title="First" onClose={() => {}}>
          <input aria-label="first" />
          {trigger && <button type="button">Launch</button>}
        </Modal>
        <Modal open={second} title="Second" onClose={() => {}}>
          <input aria-label="second" />
        </Modal>
      </>
    )
    const { rerender, getByRole } = render(content(false, true))
    settle()
    getByRole('button', { name: 'Launch' }).focus()
    rerender(content(true, true))
    settle()
    rerender(content(false, false))
    act(() => vi.advanceTimersByTime(400))
    expect(document.activeElement).toBe(getByRole('textbox', { name: 'first' }))
  })

  it('reopening an older sibling puts its visual and keyboard layer on top', () => {
    const first = vi.fn()
    const second = vi.fn()
    const content = (open: boolean) => (
      <>
        <Modal open={open} title="First" onClose={first}>
          One
        </Modal>
        <Modal open title="Second" onClose={second}>
          Two
        </Modal>
      </>
    )
    const { rerender, getByRole } = render(content(false))
    settle()
    rerender(content(true))
    settle()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
    const rank = (title: string) =>
      Number(
        getByRole('dialog', { name: title }).parentElement?.style.getPropertyValue('--modal-stack'),
      )
    expect(rank('First')).toBeGreaterThan(rank('Second'))
  })
})

// jsdom polyfills requestAnimationFrame as setTimeout(fn, 0).
// Fake timers let us advance through both rAF frames synchronously.

it('focuses the first focusable element when opened', () => {
  vi.useFakeTimers()
  render(
    <Modal open onClose={() => {}}>
      <button type="button">First</button>
      <button type="button">Second</button>
    </Modal>,
  )
  act(() => {
    vi.runAllTimers()
  })
  expect(document.activeElement?.textContent).toBe('First')
  vi.useRealTimers()
})

it('restores focus to the previously focused element on close', () => {
  vi.useFakeTimers()
  const trigger = document.createElement('button')
  document.body.appendChild(trigger)
  trigger.focus()

  const { rerender } = render(
    <Modal open onClose={() => {}}>
      <button type="button">Inside</button>
    </Modal>,
  )
  act(() => {
    vi.runAllTimers()
  })

  rerender(
    <Modal open={false} onClose={() => {}}>
      <button type="button">Inside</button>
    </Modal>,
  )
  act(() => {
    vi.runAllTimers()
  })

  expect(document.activeElement).toBe(trigger)
  document.body.removeChild(trigger)
  vi.useRealTimers()
})

it('wraps Tab from the last focusable element to the first', () => {
  vi.useFakeTimers()
  const { container } = render(
    <Modal open onClose={() => {}}>
      <button type="button">First</button>
      <button type="button">Last</button>
    </Modal>,
  )
  act(() => {
    vi.runAllTimers()
  })

  // biome-ignore lint/style/noNonNullAssertion: dialog is guaranteed to exist in this test
  const dialog = container.querySelector('dialog')!
  const buttons = dialog.querySelectorAll('button')
  // The close button is last in DOM order — focus it to test wrap-around
  ;(buttons[buttons.length - 1] as HTMLButtonElement).focus()
  dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))

  expect(document.activeElement?.textContent).toBe('First')
  vi.useRealTimers()
})

it('wraps Shift+Tab from the first focusable element to the last', () => {
  vi.useFakeTimers()
  const { container, getByText } = render(
    <Modal open onClose={() => {}}>
      <button type="button">First</button>
      <button type="button">Last</button>
    </Modal>,
  )
  act(() => {
    vi.runAllTimers()
  })

  // biome-ignore lint/style/noNonNullAssertion: dialog is guaranteed to exist in this test
  const dialog = container.querySelector('dialog')!
  ;(getByText('First') as HTMLButtonElement).focus()
  dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }))

  // The close button is now the last focusable element — it has aria-label="close"
  expect(document.activeElement?.getAttribute('aria-label')).toBe('close')
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
