import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'
import StartPage from '../start'

vi.mock('@release/translation', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

it('links to the lobby in create and join modes', () => {
  render(
    <MemoryRouter>
      <StartPage />
    </MemoryRouter>,
  )
  expect(screen.getByText('start.createGame').closest('a')?.getAttribute('href')).toBe(
    '/lobby?mode=create',
  )
  expect(screen.getByText('start.joinGame').closest('a')?.getAttribute('href')).toBe(
    '/lobby?mode=join',
  )
})
