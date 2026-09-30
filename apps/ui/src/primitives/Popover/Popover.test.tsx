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

// Review of #210: pressing the lobby's capacity range with the list open closed
// the list and moved the range from 5 to 6 in one go. The press outside is
// cancelled and stopped, so nothing under it acts on it.
it('cancels a press outside, so a range under it does not act on it', () => {
  const onRange = vi.fn()
  render(
    <>
      <Popover trigger="open">
        <span>panel</span>
      </Popover>
      <input
        type="range"
        aria-label="capacity"
        onPointerDown={onRange}
        onMouseDown={onRange}
        onClick={onRange}
      />
    </>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'open' }))
  const range = screen.getByRole('slider', { name: 'capacity' })
  // the whole gesture, as a browser sends it: the press, then its click.
  // fireEvent answers false when the event's default was cancelled.
  expect(fireEvent.pointerDown(range)).toBe(false)
  fireEvent.click(range)
  expect(onRange).not.toHaveBeenCalled()
  expect(screen.queryByText('panel')).toBeNull()
})

// A range inside, dragged past the panel's edge and let go outside: the press
// began inside, so nothing closes.
it('keeps open when a range inside is let go outside', () => {
  render(
    <Popover trigger="open">
      <input type="range" aria-label="volume" />
    </Popover>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'open' }))
  fireEvent.pointerDown(screen.getByRole('slider', { name: 'volume' }))
  fireEvent.click(document.body)
  expect(screen.getByRole('slider', { name: 'volume' })).toBeTruthy()
})

it('is no taller than the room below it', () => {
  render(
    <Popover trigger="open">
      <span>panel</span>
    </Popover>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'open' }))
  const panel = screen.getByText('panel').parentElement
  // jsdom lays nothing out, so the panel's top reads 0: the room is the
  // window's height less the margin kept from its bottom edge
  expect(panel?.style.maxBlockSize).toBe(`${window.innerHeight - 36}px`)
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
