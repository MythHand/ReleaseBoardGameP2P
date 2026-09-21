import { fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { CARDS } from '@/cards'
import CardCatalog from './CardCatalog'

const cards = CARDS.slice(0, 3)
const source = new DOMRect(40, 127, 100, 140)
const bounds = new DOMRect(24, 12, 500, 400)

afterEach(() => vi.restoreAllMocks())

function setup(cardRect = source, hostRect = bounds) {
  const previewRoot = createRef<HTMLDivElement>()
  const onPick = vi.fn()
  const onDrop = vi.fn(() => true)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.hasAttribute('data-preview-host') ? hostRect : cardRect
  })
  const scene = (open = true, selected: string | null = null, chosen: string | null = null) => (
    <>
      <div data-preview-host ref={previewRoot} />
      <div data-testid="scrolling-catalog" style={{ overflow: 'auto' }}>
        <CardCatalog
          cards={cards}
          open={open}
          selected={selected}
          chosen={chosen}
          previewRoot={previewRoot}
          onPick={onPick}
          onDrop={onDrop}
        />
      </div>
    </>
  )
  const view = render(scene())
  const choice = (index = 0) => screen.getByRole('button', { name: cards[index].name })
  const preview = () => previewRoot.current?.querySelector<HTMLElement>('[data-catalog-preview]')
  return { ...view, scene, choice, preview, onPick, onDrop }
}

it('enlarges a card outside the scrolling catalogue and clamps its glow clear of the host edge', () => {
  const { choice, preview } = setup()
  fireEvent.mouseEnter(choice())
  const enlarged = preview()
  expect(enlarged).toBeTruthy()
  expect(screen.getByTestId('scrolling-catalog').contains(enlarged ?? null)).toBe(false)
  expect(enlarged?.style.left).toBe('24px')
  expect(Number.parseFloat(enlarged?.style.top ?? '')).toBeCloseTo(52.05, 1)
  expect(enlarged?.style.width).toBe('190px')
  expect(enlarged?.querySelector('[data-card]')?.getAttribute('data-card')).toBe(cards[0].id)
})

it('changes the readable card immediately when entering a neighbouring choice', () => {
  const { choice, preview } = setup()
  fireEvent.mouseEnter(choice())
  fireEvent.mouseLeave(choice())
  fireEvent.mouseEnter(choice(1))
  expect(preview()?.querySelector('[data-card]')?.getAttribute('data-card')).toBe(cards[1].id)
})

it('clears a hover preview when scrolling moves its source out from under the pointer', () => {
  const { choice, preview } = setup()
  fireEvent.mouseEnter(choice())
  expect(preview()).toBeTruthy()
  fireEvent.scroll(screen.getByTestId('scrolling-catalog'))
  expect(preview()).toBeNull()
  fireEvent.mouseMove(choice(), { buttons: 0 })
  expect(preview()).toBeTruthy()
})

it('previews keyboard focus and keeps selection armed until the consumer confirms it', () => {
  const { choice, preview, onPick, onDrop, rerender, scene } = setup()
  fireEvent.focus(choice())
  expect(preview()).toBeTruthy()
  fireEvent.keyDown(choice(), { key: 'Enter' })
  expect(onPick).toHaveBeenCalledExactlyOnceWith(cards[0])
  expect(onDrop).not.toHaveBeenCalled()
  rerender(scene(true, cards[0].id))
  expect(preview()?.querySelector('[data-state="selected"]')).toBeTruthy()
  fireEvent.blur(choice())
  expect(preview()).toBeNull()
  rerender(scene(false, cards[0].id, cards[0].id))
  expect(preview()?.querySelector('[data-card]')?.getAttribute('data-card')).toBe(cards[0].id)
  fireEvent.keyDown(choice(), { key: 'Enter' })
  expect(onPick).toHaveBeenCalledTimes(1)
})

it('removes the reading overlay before a card is pulled from its cell', () => {
  const { choice, preview } = setup()
  fireEvent.mouseEnter(choice())
  expect(preview()).toBeTruthy()
  fireEvent.pointerDown(choice(), { button: 0, pointerId: 1, clientX: 50, clientY: 150 })
  fireEvent.mouseMove(choice(), { buttons: 1 })
  expect(preview()).toBeNull()
})

it('does not reopen a reading overlay when a dragged card crosses another choice', () => {
  const { choice, preview } = setup()
  fireEvent.mouseEnter(choice())
  fireEvent.pointerDown(choice(), { button: 0, pointerId: 1, clientX: 50, clientY: 150 })
  fireEvent.mouseLeave(choice(), { buttons: 1 })
  fireEvent.mouseEnter(choice(1), { buttons: 1 })
  expect(preview()).toBeNull()
})

it('keeps a lower-right preview and its glow inside the reserved reading area', () => {
  const { choice, preview } = setup(new DOMRect(500, 410, 100, 140))
  fireEvent.mouseEnter(choice())
  expect(preview()?.style.left).toBe('286px')
  expect(Number.parseFloat(preview()?.style.top ?? '')).toBeCloseTo(110.1, 1)
  expect(preview()?.style.width).toBe('190px')
})

it('reduces the preview only when the available reading area cannot fit the normal zoom', () => {
  const { choice, preview } = setup(source, new DOMRect(24, 12, 200, 220))
  fireEvent.focus(choice())
  expect(Number.parseFloat(preview()?.style.width ?? '')).toBeCloseTo(122.9, 1)
  expect(preview()?.style.top).toBe('24px')
})
