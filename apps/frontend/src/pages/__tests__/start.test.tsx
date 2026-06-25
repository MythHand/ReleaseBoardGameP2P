import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'
import type { UseLobby } from '~/entities/lobby'
import StartPage from '../start'

vi.mock('@release/translation', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'ru' } }),
}))
// сетевые хуки — заглушки (логика сессии не нужна для рендера экрана)
vi.mock('~/features/create-lobby/useCreateLobby', () => ({ useCreateLobby: () => vi.fn() }))
vi.mock('~/features/join-lobby/useJoinLobby', () => ({ useJoinLobby: () => vi.fn() }))

vi.mock('~/app/providers/SessionProvider', () => ({
  useSession: () => sessionValue,
}))

let sessionValue: Pick<UseLobby, 'status' | 'state'>

// Стартовая страница теперь рендерит полированный <Start> из @release/ui (наш дизайн):
// создание/вход — через кнопки-модалки + колбэки в сессию, без ссылок на /lobby.
it('renders the start screen with create and join actions', () => {
  sessionValue = { status: 'idle', state: null }
  render(
    <MemoryRouter>
      <StartPage />
    </MemoryRouter>,
  )
  expect(screen.getByText('start.createGame')).toBeTruthy()
  expect(screen.getByText('start.joinGame')).toBeTruthy()
})

it('shows continue session button when session is active', () => {
  sessionValue = {
    status: 'in-lobby',
    state: {
      selfId: 'h',
      hostId: 'h',
      maxPlayers: 4,
      setup: {},
      peers: { h: { id: 'h', name: 'Host', role: 'host', ready: true } },
    },
  } as Pick<UseLobby, 'status' | 'state'>
  render(
    <MemoryRouter>
      <StartPage />
    </MemoryRouter>,
  )
  expect(screen.getByText('start.continueSession')).toBeTruthy()
})

it('hides continue session button when no session', () => {
  sessionValue = { status: 'idle', state: null }
  render(
    <MemoryRouter>
      <StartPage />
    </MemoryRouter>,
  )
  expect(screen.queryByText('start.continueSession')).toBeNull()
})
