import { act, cleanup, fireEvent, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BugRunner from './BugRunner'

// jsdom has no canvas renderer. Record its pixels while keeping the runner's
// real input, physics, score and drawing code; drive frames with a fixed clock.
let now = 0
let nextFrame = 0
let callbacks: Map<number, FrameRequestCallback>
let pixels: WeakMap<HTMLCanvasElement, { x: number; y: number }[]>

beforeEach(() => {
  now = 0
  nextFrame = 0
  callbacks = new Map()
  pixels = new WeakMap()
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(28)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    const canvas = this
    return {
      setTransform() {},
      clearRect() {
        pixels.set(canvas, [])
      },
      fillRect(x: number, y: number) {
        pixels.get(canvas)?.push({ x, y })
      },
    } as unknown as CanvasRenderingContext2D
  })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callbacks.set(++nextFrame, callback)
    return nextFrame
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => callbacks.delete(id))
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function advanceFrames(count: number) {
  for (let i = 0; i < count; i++) {
    act(() => {
      now += 50
      const pending = [...callbacks.values()]
      callbacks.clear()
      for (const callback of pending) callback(now)
    })
  }
}

function bugTop(runner: HTMLElement) {
  const canvas = runner.querySelector('canvas')
  if (!canvas) throw new Error('Runner canvas is missing')
  // The bug occupies x=22..31, before any obstacle in these short runs.
  return Math.min(
    ...(pixels.get(canvas) ?? []).filter(({ x }) => x >= 22 && x <= 31).map(({ y }) => y),
  )
}

function space(target: Node | Window, options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', {
    key: ' ',
    code: 'Space',
    bubbles: true,
    cancelable: true,
    ...options,
  })
  fireEvent(target, event)
  return event
}

describe('BugRunner keyboard input', () => {
  it('starts and jumps from Space outside the runner when enabled for the lobby', () => {
    const { getByRole } = render(<BugRunner label="Runner" globalSpace />)
    const runner = getByRole('button', { name: 'Runner' })

    expect(space(document.body).defaultPrevented).toBe(true)
    expect(runner.textContent).toBe('00000')
    expect(document.activeElement).toBe(document.body)
    advanceFrames(12)
    const grounded = bugTop(runner)

    space(document.body)
    advanceFrames(2)
    expect(bugTop(runner)).toBeLessThan(grounded)
  })

  it.each(['page', 'runner'])('does not jump again from held Space on the %s', (target) => {
    const { getByRole } = render(<BugRunner label="Runner" globalSpace />)
    const runner = getByRole('button', { name: 'Runner' })
    const keyboardTarget = target === 'page' ? document.body : runner
    fireEvent.pointerDown(runner)
    advanceFrames(12)
    const grounded = bugTop(runner)

    expect(space(keyboardTarget, { repeat: true }).defaultPrevented).toBe(true)
    advanceFrames(2)
    expect(bugTop(runner)).toBe(grounded)

    space(keyboardTarget)
    advanceFrames(2)
    expect(bugTop(runner)).toBeLessThan(grounded)
  })

  it.each(['ArrowUp', 'Enter'])('preserves focused %s and pointer controls', (key) => {
    const { getByRole } = render(<BugRunner label="Runner" />)
    const runner = getByRole('button', { name: 'Runner' })
    runner.focus()
    fireEvent.keyDown(runner, { key })
    expect(runner.textContent).toBe('00000')
    advanceFrames(12)
    const grounded = bugTop(runner)

    fireEvent.pointerDown(runner)
    advanceFrames(2)
    expect(bugTop(runner)).toBeLessThan(grounded)
  })

  it.each<{ name: string; control: ReactNode }>([
    { name: 'chat input', control: <input aria-label="Chat" /> },
    { name: 'textarea', control: <textarea aria-label="Chat" /> },
    { name: 'select', control: <select aria-label="Mode" /> },
    { name: 'button', control: <button type="button">Ready</button> },
    { name: 'link', control: <a href="#rules">Rules</a> },
    {
      name: 'nested editable text',
      control: (
        <div contentEditable>
          <span>Message</span>
        </div>
      ),
    },
    { name: 'custom control', control: <div role="switch" aria-checked={false} tabIndex={0} /> },
  ])('leaves Space in a $name to that control', ({ control }) => {
    const { getByRole, getByTestId } = render(
      <>
        <BugRunner label="Runner" globalSpace />
        <div data-testid="control">{control}</div>
      </>,
    )
    const target = getByTestId('control').querySelector('span') ?? getByTestId('control').firstChild
    if (!target) throw new Error('Control is missing')

    expect(space(target).defaultPrevented).toBe(false)
    expect(getByRole('button', { name: 'Runner' }).textContent).toBe('')
  })

  it.each<KeyboardEventInit>([
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
    { shiftKey: true },
    { isComposing: true },
  ])('leaves modified or composing Space alone: %j', (options) => {
    const { getByRole } = render(<BugRunner label="Runner" globalSpace />)

    expect(space(document.body, options).defaultPrevented).toBe(false)
    expect(getByRole('button', { name: 'Runner' }).textContent).toBe('')
  })

  it('honors an event already consumed by another handler', () => {
    const { getByRole } = render(<BugRunner label="Runner" globalSpace />)
    const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    event.preventDefault()
    fireEvent(document.body, event)

    expect(getByRole('button', { name: 'Runner' }).textContent).toBe('')
  })

  it('keeps playground instances independent and local by default', () => {
    const { getByRole } = render(
      <>
        <BugRunner label="First" />
        <BugRunner label="Second" />
      </>,
    )
    const first = getByRole('button', { name: 'First' })
    const second = getByRole('button', { name: 'Second' })
    expect(space(document.body).defaultPrevented).toBe(false)
    expect(first.textContent).toBe('')
    expect(second.textContent).toBe('')

    second.focus()
    space(second)
    expect(first.textContent).toBe('')
    expect(second.textContent).toBe('00000')
  })

  it("does not send another runner's focused Space to the lobby runner", () => {
    const { getByRole } = render(
      <>
        <BugRunner label="Lobby" globalSpace />
        <BugRunner label="Preview" />
      </>,
    )
    const preview = getByRole('button', { name: 'Preview' })
    preview.focus()
    space(preview)

    expect(getByRole('button', { name: 'Lobby' }).textContent).toBe('')
    expect(preview.textContent).toBe('00000')
  })

  it('removes the page shortcut when disabled or unmounted', () => {
    const { getByRole, rerender, unmount } = render(<BugRunner label="Runner" globalSpace />)
    rerender(<BugRunner label="Runner" />)
    expect(space(document.body).defaultPrevented).toBe(false)
    expect(getByRole('button', { name: 'Runner' }).textContent).toBe('')

    rerender(<BugRunner label="Runner" globalSpace />)
    expect(space(document.body).defaultPrevented).toBe(true)
    unmount()
    expect(space(document.body).defaultPrevented).toBe(false)
  })
})
