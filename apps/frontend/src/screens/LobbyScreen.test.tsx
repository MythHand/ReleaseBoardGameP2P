import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import LobbyScreen from './LobbyScreen'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
}))

vi.mock('../network', () => ({
  useLobby: () => ({
    state: null,
    status: 'idle',
    roomCode: null,
    isHost: false,
    canStart: false,
    createRoom: vi.fn(),
    joinRoom: vi.fn(),
    ready: vi.fn(),
    kick: vi.fn(),
    setMaxPlayers: vi.fn(),
    transferHost: vi.fn(),
  }),
}))

it('renders the create-game entry when idle', () => {
  render(<LobbyScreen />)
  expect(screen.getByText('lobby.createTitle')).toBeTruthy()
})
