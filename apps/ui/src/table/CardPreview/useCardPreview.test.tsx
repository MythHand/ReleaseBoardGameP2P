// A SLOT THAT ANSWERS FOR ITSELF. Told a card, the preview reads that card;
// told nothing at all, it reads whatever is drawn in the slot. The difference
// matters where several renders take turns filling one place: the board's centre
// was handed a list of what might stand there, the list named two of them, and
// the git operations standing in the same slot could not be read by anybody
// (#168). A list is something a new render can be added without.
import { fireEvent, render } from '@testing-library/react'
import { expect, it } from 'vitest'
import { cardById } from '@/cards/catalogue'
import Card from '@/primitives/Card'
import { useCardPreview } from './useCardPreview'

// biome-ignore lint/style/noNonNullAssertion: known catalogue entries
const bug = cardById('attack-bug')!
// biome-ignore lint/style/noNonNullAssertion: known catalogue entries
const sudo = cardById('support-sudo')!

function Scene({ children }: { children: React.ReactNode }) {
  const { slotProps, overlay } = useCardPreview()
  return (
    <>
      <div data-testid="slot" {...slotProps()}>
        {children}
      </div>
      {overlay}
    </>
  )
}

const readsAs = () =>
  document
    .querySelector('[data-card-preview]')
    ?.querySelector('[data-card]')
    ?.getAttribute('data-card') ?? null

it('reads the card standing in the slot without being told which', () => {
  const { getByTestId } = render(
    <Scene>
      <Card card={bug} interactive={false} />
    </Scene>,
  )
  fireEvent.mouseEnter(getByTestId('slot'))
  expect(readsAs()).toBe('attack-bug')
})

// Document order is paint order: a pair draws the tucked half first and the card
// it belongs to over it, so the one on top is the one being looked at.
it('reads the card on top when the slot holds a stack', () => {
  const { getByTestId } = render(
    <Scene>
      <Card card={sudo} interactive={false} />
      <Card card={bug} interactive={false} />
    </Scene>,
  )
  fireEvent.mouseEnter(getByTestId('slot'))
  expect(readsAs()).toBe('attack-bug')
})

// The id is in the DOM whichever side is showing, so reading it alone would hand
// out a face nobody at this seat has been shown.
it('reads nothing off a card lying face down', () => {
  const { getByTestId } = render(
    <Scene>
      <Card card={bug} faceDown interactive={false} />
    </Scene>,
  )
  fireEvent.mouseEnter(getByTestId('slot'))
  expect(readsAs()).toBeNull()
})

it('reads nothing from an empty slot', () => {
  const { getByTestId } = render(<Scene>{null}</Scene>)
  fireEvent.mouseEnter(getByTestId('slot'))
  expect(readsAs()).toBeNull()
})
