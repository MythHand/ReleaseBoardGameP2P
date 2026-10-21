import { act, fireEvent, renderHook } from '@testing-library/react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { expect, it, vi } from 'vitest'
import { useCardReorder } from './useCardReorder'

// A card held over the row when the row is switched off — the keeper answered
// the Rebase on a clock that ran out — stays where it is held, so whatever
// carries it on next starts from there (owner, 22.10).

const rows = [{ id: 0, cards: ['a', 'b', 'c'] }]

function grab(hook: { current: ReturnType<typeof useCardReorder> }) {
  const parent = document.createElement('div')
  const card = document.createElement('div')
  parent.append(card)
  const press = {
    button: 0,
    clientX: 10,
    clientY: 10,
    currentTarget: card,
    preventDefault: () => {},
    stopPropagation: () => {},
  } as unknown as ReactPointerEvent<HTMLElement>
  act(() => hook.current.onPointerDown(0, 'a', press))
}

const pointer = (type: 'pointermove' | 'pointerup', x: number) =>
  fireEvent(window, Object.assign(new Event(type), { clientX: x, clientY: 10 }))

it('holds a card where it is while the row is switched off, and commits nothing', () => {
  const onReorder = vi.fn()
  const hook = renderHook(
    (enabled: boolean) => useCardReorder({ enabled, step: 180, rows, onReorder }),
    {
      initialProps: true,
    },
  )
  grab(hook.result)
  act(() => {
    pointer('pointermove', 400)
  })
  const held = hook.result.current.position(0, 'a', 0)
  expect(held.dragging).toBe(true)
  hook.rerender(false)
  // still held, where it was
  expect(hook.result.current.position(0, 'a', 0)).toEqual(held)
  act(() => {
    pointer('pointermove', 50)
  })
  expect(hook.result.current.position(0, 'a', 0)).toEqual(held)
  // let go of: home, and nothing reordered
  act(() => {
    pointer('pointerup', 50)
  })
  expect(hook.result.current.drag).toBeNull()
  expect(onReorder).not.toHaveBeenCalled()
})

it('leaves a taken card to its consumer until it is released', () => {
  const onReorder = vi.fn()
  const hook = renderHook(() => useCardReorder({ enabled: true, step: 180, rows, onReorder }))
  grab(hook.result)
  act(() => {
    pointer('pointermove', 400)
  })
  const held = hook.result.current.position(0, 'a', 0)
  act(() => hook.result.current.take())
  act(() => {
    pointer('pointermove', 50)
    pointer('pointerup', 50)
  })
  expect(hook.result.current.position(0, 'a', 0)).toEqual(held)
  expect(onReorder).not.toHaveBeenCalled()
  act(() => hook.result.current.release())
  expect(hook.result.current.drag).toBeNull()
})
