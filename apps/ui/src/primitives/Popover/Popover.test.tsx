import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import Popover from './Popover'

function scene(onInside = vi.fn(), onOutside = vi.fn()) {
  render(
    <>
      <Popover trigger="open">
        <button type="button" onClick={onInside}>
          inside
        </button>
      </Popover>
      <button type="button" onClick={onOutside}>
        outside
      </button>
    </>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'open' }))
  return { onInside, onOutside }
}

const isOpen = () => screen.queryByRole('button', { name: 'inside' }) !== null

it('opens from its trigger and closes on Escape', () => {
  scene()
  expect(isOpen()).toBe(true)
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(isOpen()).toBe(false)
})

// A press outside only closes: the click it turns into must not press whatever
// lay under it.
it('closes on a press outside and keeps that press from reaching what is under it', () => {
  const { onOutside } = scene()
  const outside = screen.getByRole('button', { name: 'outside' })
  fireEvent.pointerDown(outside)
  expect(isOpen()).toBe(false)
  fireEvent.click(outside)
  expect(onOutside).not.toHaveBeenCalled()
  // the next press is an ordinary one again
  fireEvent.pointerDown(outside)
  fireEvent.click(outside)
  expect(onOutside).toHaveBeenCalledTimes(1)
})

it('stays open while it is used inside', () => {
  const { onInside } = scene()
  const inside = screen.getByRole('button', { name: 'inside' })
  fireEvent.pointerDown(inside)
  fireEvent.click(inside)
  expect(onInside).toHaveBeenCalledTimes(1)
  expect(isOpen()).toBe(true)
})

// A closing press that never became a click (dragged away) must not swallow a
// later, real click.
it('does not eat a later click after a closing press that made none', () => {
  const { onOutside } = scene()
  const outside = screen.getByRole('button', { name: 'outside' })
  fireEvent.pointerDown(outside)
  fireEvent.pointerDown(outside)
  fireEvent.click(outside)
  expect(onOutside).toHaveBeenCalledTimes(1)
})

it('closes when another popover opens', () => {
  render(
    <>
      <Popover trigger="first">
        <span>first panel</span>
      </Popover>
      <Popover trigger="second">
        <span>second panel</span>
      </Popover>
    </>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'first' }))
  fireEvent.click(screen.getByRole('button', { name: 'second' }))
  expect(screen.queryByText('first panel')).toBeNull()
  expect(screen.getByText('second panel')).toBeTruthy()
})
