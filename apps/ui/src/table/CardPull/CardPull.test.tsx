import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { CARDS } from '@/cards'
import type { HandPlayDrop } from '@/table/Hand/Hand'
import CardPull from './CardPull'

it('requires a drag and ignores a click or cancelled pointer', () => {
  const onDrop = vi.fn<(drop: HandPlayDrop) => boolean>(() => true)
  render(<CardPull card={CARDS[0]} label="choice" onDrop={onDrop} />)
  const pick = screen.getByRole('button', { name: 'choice' })
  fireEvent.click(pick)
  fireEvent.pointerDown(pick, { clientX: 10, clientY: 10, button: 0, pointerId: 1 })
  fireEvent.pointerUp(window, { clientX: 10, clientY: 10, pointerId: 1 })
  expect(onDrop).not.toHaveBeenCalled()
  fireEvent.pointerDown(pick, { clientX: 10, clientY: 10, button: 0, pointerId: 1 })
  fireEvent.pointerMove(window, { clientX: 100, clientY: 100, pointerId: 1 })
  fireEvent.pointerCancel(window, { pointerId: 1 })
  expect(onDrop).not.toHaveBeenCalled()
  fireEvent.pointerDown(pick, { clientX: 10, clientY: 10, button: 0, pointerId: 1 })
  fireEvent.pointerMove(window, { clientX: 100, clientY: 100, pointerId: 1 })
  fireEvent.pointerUp(window, { clientX: 110, clientY: 120, pointerId: 1 })
  expect(onDrop).toHaveBeenCalledOnce()
  expect(onDrop.mock.calls[0][0]).toMatchObject({ x: 110, y: 120 })
})

it('does not deliver a stale gesture after being disabled or unmounted', () => {
  const onDrop = vi.fn<(drop: HandPlayDrop) => boolean>(() => true)
  const { rerender, unmount } = render(<CardPull card={CARDS[0]} label="choice" onDrop={onDrop} />)
  fireEvent.pointerDown(screen.getByRole('button', { name: 'choice' }), {
    clientX: 10,
    clientY: 10,
    button: 0,
    pointerId: 1,
  })
  rerender(<CardPull card={CARDS[0]} label="choice" disabled onDrop={onDrop} />)
  fireEvent.pointerUp(window, { clientX: 100, clientY: 100, pointerId: 1 })
  expect(onDrop).not.toHaveBeenCalled()
  unmount()
  fireEvent.pointerUp(window, { clientX: 100, clientY: 100, pointerId: 1 })
  expect(onDrop).not.toHaveBeenCalled()
})
