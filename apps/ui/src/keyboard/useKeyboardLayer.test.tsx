import { act, cleanup, fireEvent, render, renderHook } from '@testing-library/react'
import { StrictMode } from 'react'
import { getKeyboardRegistry, type KeyboardLayerOptions } from './registry'
import { useKeyboardLayer } from './useKeyboardLayer'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
const options = (name: string, run: () => 'handled'): KeyboardLayerOptions => ({
  name,
  active: true,
  priority: 100,
  bindings: [{ key: 'Escape', focus: 'any', run }],
})

it('uses committed callbacks without promoting an older sibling on rerender', () => {
  const a = vi.fn(() => 'handled' as const)
  const b = vi.fn(() => 'handled' as const)
  const aHook = renderHook((props) => useKeyboardLayer(props), { initialProps: options('a', a) })
  const bHook = renderHook((props) => useKeyboardLayer(props), { initialProps: options('b', b) })
  const next = vi.fn(() => 'handled' as const)
  aHook.rerender(options('a-new', a))
  bHook.rerender(options('b-new', next))
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(a).not.toHaveBeenCalled()
  expect(b).not.toHaveBeenCalled()
  expect(next).toHaveBeenCalledTimes(1)
  aHook.rerender({ ...options('a', a), active: false })
  aHook.rerender(options('a', a))
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(a).toHaveBeenCalledTimes(1)
})

it('keeps snapshots stable and ranks compact after another layer unmounts', () => {
  const a = renderHook(() => useKeyboardLayer(options('a', () => 'handled')))
  const b = renderHook(() => useKeyboardLayer(options('b', () => 'handled')))
  expect(a.result.current).toEqual({ isTopOfPriority: false, stackIndex: 0 })
  expect(b.result.current).toEqual({ isTopOfPriority: true, stackIndex: 1 })
  const snapshot = b.result.current
  b.rerender()
  expect(b.result.current).toBe(snapshot)
  a.unmount()
  expect(b.result.current).toEqual({ isTopOfPriority: true, stackIndex: 0 })
})

it('dispatches once under StrictMode and completely releases registrations on unmount', () => {
  const run = vi.fn(() => 'handled' as const)
  const remove = vi.spyOn(window, 'removeEventListener')
  const { unmount } = renderHook(() => useKeyboardLayer(options('strict', run)), {
    wrapper: StrictMode,
  })
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(run).toHaveBeenCalledTimes(1)
  expect(getKeyboardRegistry(window).inspect()).toHaveLength(1)
  unmount()
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(run).toHaveBeenCalledTimes(1)
  expect(getKeyboardRegistry(window).inspect()).toEqual([])
  expect(
    remove.mock.calls.some(([name, , capture]) => name === 'keydown' && capture === true),
  ).toBe(true)
})

it('does not promote earlier siblings when StrictMode replays their effects', () => {
  const a = vi.fn(() => 'handled' as const)
  const b = vi.fn(() => 'handled' as const)
  function Layer({ name, run }: { name: string; run: () => 'handled' }) {
    useKeyboardLayer(options(name, run))
    return null
  }
  render(
    <StrictMode>
      <Layer name="a" run={a} />
      <Layer name="b" run={b} />
    </StrictMode>,
  )
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(b).toHaveBeenCalledTimes(1)
  expect(a).not.toHaveBeenCalled()
})

it('preserves local React handling for controls and unbound keys', () => {
  const run = vi.fn(() => 'handled' as const)
  const local = vi.fn()
  function Screen() {
    useKeyboardLayer({ ...options('screen', run), bindings: [{ key: ' ', run }] })
    return <input aria-label="chat" onKeyDown={local} />
  }
  const { getByRole } = render(<Screen />)
  fireEvent.keyDown(getByRole('textbox'), { key: ' ' })
  fireEvent.keyDown(getByRole('textbox'), { key: 'Enter' })
  expect(local).toHaveBeenCalledTimes(2)
  expect(run).not.toHaveBeenCalled()
})

it('releases the old window when its owner changes', () => {
  const frame = document.createElement('iframe')
  document.body.append(frame)
  const second = frame.contentWindow
  if (!second) throw new Error('missing iframe window')
  const run = vi.fn(() => 'handled' as const)
  const { rerender, unmount } = renderHook(
    ({ owner }: { owner: Window }) => useKeyboardLayer(options('owner', run), owner),
    { initialProps: { owner: window as Window } },
  )
  rerender({ owner: second })
  act(() => {
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.keyDown(second, { key: 'Escape' })
  })
  expect(run).toHaveBeenCalledTimes(1)
  expect(getKeyboardRegistry(window).inspect()).toEqual([])
  unmount()
  frame.remove()
})
