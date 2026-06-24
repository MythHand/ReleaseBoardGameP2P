import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'
import StartPage from '../start'

vi.mock('@release/translation', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'ru' } }),
}))
// сетевые хуки — заглушки (логика сессии не нужна для рендера экрана)
vi.mock('~/features/create-lobby/useCreateLobby', () => ({ useCreateLobby: () => vi.fn() }))
vi.mock('~/features/join-lobby/useJoinLobby', () => ({ useJoinLobby: () => vi.fn() }))

// Стартовая страница теперь рендерит полированный <Start> из @release/ui (наш дизайн):
// создание/вход — через кнопки-модалки + колбэки в сессию, без ссылок на /lobby.
it('renders the start screen with create and join actions', () => {
  render(
    <MemoryRouter>
      <StartPage />
    </MemoryRouter>,
  )
  expect(screen.getByText('start.createGame')).toBeTruthy()
  expect(screen.getByText('start.joinGame')).toBeTruthy()
})
