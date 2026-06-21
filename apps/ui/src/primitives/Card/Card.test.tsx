import { render } from '@testing-library/react'
import { CARDS } from '../../cards/catalogue'
import Card from './Card'

// CardFace/CardBack render card.art / COVERS directly (already-resolved URLs from
// the catalogue), so this exercises the real asset path with no mocking.
it('renders a card without crashing', () => {
  const { container } = render(<Card card={CARDS[0]} />)
  expect(container.firstChild).not.toBeNull()
})

it('renders a face-down card (CardBack) without crashing', () => {
  const { container } = render(<Card card={CARDS[0]} faceDown />)
  expect(container.firstChild).not.toBeNull()
})
