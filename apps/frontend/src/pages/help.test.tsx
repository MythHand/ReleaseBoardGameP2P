import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'
import HelpPage from './help'

vi.mock('@release/translation', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

it('renders the help title and a link back to start', () => {
  render(
    <MemoryRouter>
      <HelpPage />
    </MemoryRouter>,
  )
  expect(screen.getByText('help.title')).toBeTruthy()
  expect(screen.getByText('help.back').closest('a')?.getAttribute('href')).toBe('/start')
})
