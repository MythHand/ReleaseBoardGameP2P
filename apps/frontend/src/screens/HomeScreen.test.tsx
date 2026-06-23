import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'
import HomeScreen from './HomeScreen'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
}))

it('renders the title and a link to the lobby', () => {
  render(
    <MemoryRouter>
      <HomeScreen />
    </MemoryRouter>,
  )
  const lobbyLink = screen.getByText('app.enterLobby').closest('a')
  expect(lobbyLink?.getAttribute('href')).toBe('/lobby')
})
