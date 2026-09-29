import { act, cleanup, fireEvent, render } from '@testing-library/react'
import Modal from '@/primitives/Modal'
import BugRunner from './BugRunner'
import styles from './BugRunner.module.css'
import * as game from './game'
import { BUG_RUN_A } from './sprites'

let now = 0
let nextFrame = 0
let frames: Map<number, FrameRequestCallback>
interface Paint {
  pixels: number[][]
  fillStyle: string
  clearRect: () => void
  setTransform: () => void
  fillRect: (x: number, y: number, w: number, h: number) => void
}
let paints: WeakMap<HTMLCanvasElement, Paint>
const bugPixels = BUG_RUN_A.join('').replaceAll('.', '').length

beforeEach(() => {
  now = 0
  nextFrame = 0
  frames = new Map()
  paints = new WeakMap()
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.spyOn(Math, 'random').mockReturnValue(0.7)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = ++nextFrame
    frames.set(id, callback)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(160)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(game.WORLD_H)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    let paint = paints.get(this)
    if (!paint) {
      const value: Paint = {
        pixels: [],
        fillStyle: '',
        setTransform: () => {},
        clearRect: () => {
          value.pixels = []
        },
        fillRect: (x, y, w, h) => {
          value.pixels.push([x, y, w, h])
        },
      }
      paint = value
      paints.set(this, paint)
    }
    return paint as unknown as CanvasRenderingContext2D
  })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
function tick(count = 1) {
  for (let i = 0; i < count; i++)
    act(() => {
      now += 50
      const queued = [...frames.values()]
      frames.clear()
      for (const frame of queued) frame(now)
    })
}
function top(button: HTMLElement) {
  const canvas = button.querySelector('canvas')
  if (!canvas) throw new Error('Missing canvas')
  // The bug is drawn last, after the road and obstacles, using the real sprite.
  return Math.min(
    ...(paints
      .get(canvas)
      ?.pixels.slice(-bugPixels)
      .map((pixel) => pixel[1]) ?? []),
  )
}
const score = (button: HTMLElement) => button.querySelector(`.${styles.score}`)
function press(target: EventTarget = document.body, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true, ...init })
  act(() => {
    target.dispatchEvent(event)
  })
  return event
}

it('starts globally, jumps, prevents scrolling and requires a fresh Space for another jump', () => {
  const { getByRole } = render(<BugRunner label="Runner" globalKeys />)
  const runner = getByRole('button')
  const ground = top(runner)
  expect(score(runner)).toBeNull()
  expect(press().defaultPrevented).toBe(true)
  tick()
  expect(score(runner)).not.toBeNull()
  expect(top(runner)).toBeLessThan(ground)
  tick(13)
  expect(top(runner)).toBe(ground)
  press(document.body, { repeat: true })
  tick()
  expect(top(runner)).toBe(ground)
  press()
  tick()
  expect(top(runner)).toBeLessThan(ground)
})

it('restarts a real crashed run only after the 400ms lock', () => {
  const { getByRole } = render(<BugRunner label="Runner" globalKeys />)
  const runner = getByRole('button')
  press()
  tick()
  for (let i = 0; i < 400 && frames.size > 0; i++) tick()
  expect(frames.size).toBe(0)
  const crashedScore = score(runner)?.textContent
  expect(crashedScore).not.toBe('00000')
  const ground = top(runner)
  now += 399
  press()
  expect(frames.size).toBe(0)
  expect(score(runner)?.textContent).toBe(crashedScore)
  now += 1
  press()
  expect(frames.size).toBe(1)
  tick()
  expect(top(runner)).toBeLessThan(ground)
  expect(score(runner)?.textContent).not.toBe(crashedScore)
})

it.each(['input', 'editable', 'button'])('preserves Space for another %s', (kind) => {
  const { getByRole, getByTestId } = render(
    <>
      <BugRunner label="Runner" globalKeys />
      {kind === 'input' ? (
        <input data-testid="control" />
      ) : kind === 'editable' ? (
        <div contentEditable suppressContentEditableWarning>
          <span data-testid="control">Draft</span>
        </div>
      ) : (
        <button type="button" data-testid="control">
          Action
        </button>
      )}
    </>,
  )
  expect(press(getByTestId('control')).defaultPrevented).toBe(false)
  expect(score(getByRole('button', { name: 'Runner' }))).toBeNull()
})

it.each([
  { shiftKey: true },
  { ctrlKey: true },
  { altKey: true },
  { metaKey: true },
  { isComposing: true },
  { keyCode: 229 },
  { repeat: true },
])('ignores modified/composing/repeated Space: %j', (init) => {
  const { getByRole } = render(<BugRunner label="Runner" globalKeys />)
  press(document.body, init)
  press(getByRole('button'), init)
  expect(score(getByRole('button'))).toBeNull()
})

it('keeps standalone previews focused-only and does not activate a second runner', () => {
  const { getByRole } = render(
    <>
      <BugRunner label="First" />
      <BugRunner label="Second" />
    </>,
  )
  press()
  press(document.body, { key: 'ArrowUp' })
  const first = getByRole('button', { name: 'First' })
  const second = getByRole('button', { name: 'Second' })
  expect(score(first)).toBeNull()
  expect(score(second)).toBeNull()
  first.focus()
  press(first)
  tick()
  expect(score(first)).not.toBeNull()
  expect(score(second)).toBeNull()
})

it('handles focused Space once even when global keys are enabled', () => {
  const input = vi.spyOn(game, 'press')
  const { getByRole } = render(<BugRunner label="Runner" globalKeys />)
  const runner = getByRole('button')
  const ground = top(runner)
  runner.focus()
  press(runner)
  tick()
  expect(input).toHaveBeenCalledTimes(1)
  expect(top(runner)).toBeLessThan(ground)
})

it.each(['pointer', 'Enter', 'ArrowUp'])('retains local %s activation', (key) => {
  const { getByRole } = render(<BugRunner label="Runner" />)
  const runner = getByRole('button')
  const ground = top(runner)
  if (key === 'pointer') fireEvent.pointerDown(runner)
  else press(runner, { key })
  tick()
  expect(score(runner)).not.toBeNull()
  expect(top(runner)).toBeLessThan(ground)
})

it('keeps global ArrowUp repeats enabled', () => {
  const { getByRole } = render(<BugRunner label="Runner" globalKeys />)
  const runner = getByRole('button')
  const ground = top(runner)
  press(document.body, { key: 'ArrowUp', repeat: true })
  tick(14)
  expect(top(runner)).toBe(ground)
  press(document.body, { key: 'ArrowUp', repeat: true })
  tick()
  expect(top(runner)).toBeLessThan(ground)
})

it('blocks global and forced-background Space below a Modal while preserving modal input', () => {
  const local = vi.fn()
  const content = (open: boolean) => (
    <>
      <BugRunner label="Runner" globalKeys />
      <Modal open={open} onClose={() => {}}>
        <input aria-label="Modal draft" onKeyDown={local} />
      </Modal>
    </>
  )
  const { getByRole, rerender } = render(content(true))
  tick(2)
  const runner = getByRole('button', { name: 'Runner' })
  expect(press().defaultPrevented).toBe(true)
  runner.focus()
  expect(press(runner).defaultPrevented).toBe(true)
  expect(score(runner)).toBeNull()
  expect(press(getByRole('textbox')).defaultPrevented).toBe(false)
  expect(local).toHaveBeenCalledTimes(1)
  rerender(content(false))
  press()
  expect(score(runner)).toBeNull()
})
