import { act, fireEvent, render } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { useZonePull } from '../_useZonePull'

function harness(accepts: (x: number, y: number) => boolean) {
  const onDrop = vi.fn()
  const onCancel = vi.fn()
  const api: { pull?: ReturnType<typeof useZonePull> } = {}
  function Probe() {
    api.pull = useZonePull({ onDrop, onCancel, accepts })
    return (
      <>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: test-only stand-in for the real release-zone card */}
        <div
          data-testid="slot"
          onMouseDown={(e) => api.pull?.begin('frontend', e.currentTarget, e)}
        >
          card
        </div>
        {api.pull.overlay}
      </>
    )
  }
  const view = render(<Probe />)
  return { view, api, onDrop, onCancel }
}

it('hands the drop back to the caller when the pointer let go on the table', () => {
  const { view, onDrop } = harness(() => true)
  fireEvent.mouseDown(view.getByTestId('slot'), { clientX: 10, clientY: 10 })
  act(() => {
    fireEvent.mouseMove(window, { clientX: 400, clientY: 300 })
    fireEvent.mouseUp(window, { clientX: 400, clientY: 300 })
  })
  expect(onDrop).toHaveBeenCalledWith('frontend', expect.objectContaining({ x: 400, y: 300 }))
})

it('cancels when the pointer let go somewhere the caller refuses', () => {
  const { view, onDrop, onCancel } = harness(() => false)
  fireEvent.mouseDown(view.getByTestId('slot'), { clientX: 10, clientY: 10 })
  act(() => fireEvent.mouseUp(window, { clientX: 10, clientY: 700 }))
  expect(onDrop).not.toHaveBeenCalled()
  expect(onCancel).toHaveBeenCalledWith('frontend')
})

it('stops listening once the drag is over', () => {
  const { view, onDrop } = harness(() => true)
  fireEvent.mouseDown(view.getByTestId('slot'), { clientX: 10, clientY: 10 })
  act(() => fireEvent.mouseUp(window, { clientX: 400, clientY: 300 }))
  onDrop.mockClear()
  act(() => fireEvent.mouseUp(window, { clientX: 400, clientY: 300 }))
  expect(onDrop).not.toHaveBeenCalled()
})

it('tears down its window listeners and rAF when unmounted mid-drag, with no mouseup ever firing', () => {
  const removeSpy = vi.spyOn(window, 'removeEventListener')
  const cafSpy = vi.spyOn(window, 'cancelAnimationFrame')
  const { view, onDrop, onCancel } = harness(() => true)
  fireEvent.mouseDown(view.getByTestId('slot'), { clientX: 10, clientY: 10 })
  act(() => {
    fireEvent.mouseMove(window, { clientX: 200, clientY: 200 })
  })

  view.unmount()

  expect(removeSpy).toHaveBeenCalledWith('mousemove', expect.any(Function))
  expect(removeSpy).toHaveBeenCalledWith('mouseup', expect.any(Function))
  expect(cafSpy).toHaveBeenCalled()

  // Prove the listeners are actually gone, not just that removal was
  // attempted: a mousemove/mouseup after unmount must reach no handler.
  act(() => {
    fireEvent.mouseMove(window, { clientX: 500, clientY: 500 })
    fireEvent.mouseUp(window, { clientX: 500, clientY: 500 })
  })
  expect(onDrop).not.toHaveBeenCalled()
  expect(onCancel).not.toHaveBeenCalled()

  removeSpy.mockRestore()
  cafSpy.mockRestore()
})

// THE SIZE IS A SCALE. A card's own layers are sized off its width and ease
// their sizes, so a carrier that grew by its width restarted those eases every
// frame and the face lagged behind its frame. It is the normal card width from
// the first frame, standing where the card lay, and grows by `transform` — the
// way every flight resizes a card.
it('takes the card up at its own place and size, and grows it by a scale', () => {
  const frames: FrameRequestCallback[] = []
  const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    frames.push(cb)
    return frames.length
  })
  const { view } = harness(() => true)
  const slot = view.getByTestId('slot')
  slot.getBoundingClientRect = () => ({ left: 600, top: 630, width: 100, height: 140 }) as DOMRect
  const start = performance.now()
  fireEvent.mouseDown(slot, { clientX: 650, clientY: 700 })
  const carrier = view.container.children[1] as HTMLElement
  // mounted where it lay, at the size it lay at — before any frame has run
  expect(carrier.style.left).toBe('600px')
  expect(carrier.style.top).toBe('630px')
  expect(carrier.style.width).toBe('150px')
  expect(carrier.style.transform).toBe(`scale(${100 / 150})`)
  const runFrame = (at: number) => act(() => frames.shift()?.(start + at))
  runFrame(100)
  expect(carrier.style.width).toBe('150px')
  const midScale = Number(carrier.style.transform.match(/scale\(([\d.]+)\)/)?.[1])
  expect(midScale).toBeGreaterThan(100 / 150)
  expect(midScale).toBeLessThan(1)
  // the grabbed point — the card's middle — stays under the cursor
  expect(Number.parseFloat(carrier.style.left)).toBeCloseTo(650 - 0.5 * 150 * midScale, 5)
  runFrame(400)
  expect(carrier.style.width).toBe('150px')
  expect(carrier.style.transform).toBe('scale(1)')
  act(() => fireEvent.mouseUp(window, { clientX: 400, clientY: 300 }))
  raf.mockRestore()
})
