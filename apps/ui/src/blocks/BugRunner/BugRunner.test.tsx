import { act, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import BugRunner from './BugRunner'

// The block reports a new best to its consumer — that is how the lobby's runs
// reach the results screen. Frames are driven by hand here: the browser's are
// replaced, the clock is the test's, and the dice always land the same, so two
// runs are the same run.
let frames: FrameRequestCallback[] = []
let clock = 0

beforeEach(() => {
  frames = []
  clock = 0
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => frames.push(cb))
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  vi.spyOn(Math, 'random').mockReturnValue(0.5)
  // jsdom has no canvas: a context that draws nothing. It has to exist — the
  // block takes the road's width only once it has somewhere to paint
  const paper = { setTransform() {}, clearRect() {}, fillRect() {} }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    paper as unknown as CanvasRenderingContext2D,
  )
  // a header's worth of room, so the road has length
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => 300,
  })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => 28,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth')
  Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight')
})

// Runs frames until the loop stops asking for one: the run is over.
function runToTheEnd() {
  for (let i = 0; i < 50_000 && frames.length > 0; i += 1) {
    const frame = frames.shift()
    clock += 16
    act(() => frame?.(clock))
  }
}

it('reports a run that beats the best, and not one that only matches it', () => {
  const onBest = vi.fn()
  const { getByRole } = render(<BugRunner label="bug runner" onBest={onBest} />)
  const runner = getByRole('button', { name: 'bug runner' })

  // never jumping, the bug runs into the first hotfix on the road
  fireEvent.pointerDown(runner)
  runToTheEnd()
  expect(onBest).toHaveBeenCalledTimes(1)
  const best = onBest.mock.calls[0]?.[0]
  expect(best).toBeGreaterThan(0)

  // the same run again: it ends on the same score, which is no new best
  clock += 5_000
  fireEvent.pointerDown(runner)
  runToTheEnd()
  expect(onBest).toHaveBeenCalledTimes(1)
})
