import { render } from '@testing-library/react'
import { CARDS } from '../../cards/catalogue'
import Card from './Card'

// In Vitest/jsdom, import.meta.glob resolves PNG paths to web-rooted URLs.
// `assetUrl` is then called on these already-resolved URLs by CardFace/CardBack,
// causing a double-lookup failure. Stub it as identity so the img src renders.
vi.mock('../../cards/catalogue', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../cards/catalogue')>()
  return {
    ...mod,
    assetUrl: (key: string) => key,
    COVERS: { base: 'cover-base.png', ai: 'cover-ai.png' },
  }
})

it('renders a card without crashing', () => {
  const { container } = render(<Card card={CARDS[0]} />)
  expect(container.firstChild).not.toBeNull()
})
