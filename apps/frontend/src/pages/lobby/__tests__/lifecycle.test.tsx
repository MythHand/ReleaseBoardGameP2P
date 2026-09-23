import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, vi } from 'vitest'
import { SessionProvider, useSession } from '~/app/providers/SessionProvider'
import { useFollowGameStart } from '~/features/start-game/useStartGame'
import type { WireMessage } from '~/network/types'
import type { UseLobby } from '~/network/useLobby'
import { clearKeeper, clearSession } from '~/shared/lib/persistence'
import LobbyPage from '../[lobbyId]'

const { transports } = vi.hoisted(() => ({
  transports: [] as {
    onMessage?: (message: WireMessage) => void
    onConnection?: (peerId: string) => void
  }[],
}))

vi.mock('~/network/transport/peer', () => ({
  createTransport: vi.fn((callbacks) => {
    transports.push(callbacks)
    return {
      id: `guest-${transports.length}`,
      connectTo: vi.fn(),
      close: vi.fn(),
      send: vi.fn(),
      broadcast: vi.fn(),
      relay: vi.fn(),
      connectedIds: () => [],
      authenticate: vi.fn(),
    }
  }),
}))

vi.mock('@release/translation', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', resolvedLanguage: 'en', changeLanguage: vi.fn() },
  }),
}))

let session: UseLobby
function Navigation() {
  session = useSession()
  useFollowGameStart()
  return (
    <>
      <Link to="/lobby/F96-NMT">same invitation</Link>
      <Link to="/lobby/ABC-23D">another invitation</Link>
      <Link to="/start">start screen</Link>
    </>
  )
}

beforeEach(() => {
  transports.length = 0
  sessionStorage.clear()
  clearSession()
  clearKeeper()
})

afterEach(() => act(() => session.leaveSession()))

it.each([
  'same invitation',
  'another invitation',
  'start screen',
])('keeps the kick notice until navigating through %s and permits a fresh join', async (destination) => {
  render(
    <MemoryRouter initialEntries={['/lobby/F96-NMT']}>
      <SessionProvider>
        <Navigation />
        <Routes>
          <Route path="/lobby/:lobbyId" element={<LobbyPage />} />
          <Route path="/start" element={<Link to="/lobby/ABC-23D">join from start</Link>} />
          <Route path="/board/:gameId" element={<div>stale board</div>} />
        </Routes>
      </SessionProvider>
    </MemoryRouter>,
  )
  await act(async () => {
    await session.joinRoom('F96-NMT', 'Bo')
  })
  act(() => {
    transports[0].onConnection?.('f96nmt')
    transports[0].onMessage?.({
      seq: 1,
      type: 'PLAYER_KICKED',
      from: 'f96nmt',
      payload: { peerId: session.state?.selfId ?? '' },
    })
  })
  expect(screen.getByText('lobby.kickedMessage')).toBeTruthy()
  act(() =>
    transports[0].onMessage?.({
      seq: 1,
      type: 'GAME_STARTING',
      from: 'f96nmt',
      payload: { gameId: 'stale', seats: [] },
    }),
  )
  expect(screen.queryByText('stale board')).toBeNull()
  expect(screen.getByText('lobby.kickedMessage')).toBeTruthy()

  fireEvent.click(screen.getByText(destination))
  if (destination === 'start screen') fireEvent.click(screen.getByText('join from start'))
  expect(screen.queryByText('lobby.kickedMessage')).toBeNull()
  expect(screen.getByText('invite.formTitle')).toBeTruthy()
  const code = destination === 'same invitation' ? 'F96-NMT' : 'ABC-23D'
  expect(screen.getByDisplayValue(code)).toBeTruthy()
  fireEvent.change(screen.getByLabelText('invite.nicknameLabel'), { target: { value: 'Bo' } })
  fireEvent.click(screen.getByText('invite.joinCta'))
  await waitFor(() => expect(transports).toHaveLength(2))
  act(() => transports[1].onConnection?.(code.replace('-', '').toLowerCase()))
  expect(session.status).toBe('in-lobby')
  expect(session.roomCode).toBe(code)
  expect(screen.getByText('invite.connected')).toBeTruthy()
})
