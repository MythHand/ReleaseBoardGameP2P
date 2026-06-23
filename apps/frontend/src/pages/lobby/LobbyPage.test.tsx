import { render } from '@testing-library/react'
import { vi } from 'vitest'
import LobbyPage from './_LobbyPage'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
vi.mock('~/app/providers/SessionProvider', () => ({
  useSession: () => ({ roomCode: 'ABC-123', isHost: true }),
}))

it('renders the @release/ui Lobby screen with the session room code', () => {
  const { container } = render(<LobbyPage />)
  expect(container.firstChild).toBeTruthy()
})
