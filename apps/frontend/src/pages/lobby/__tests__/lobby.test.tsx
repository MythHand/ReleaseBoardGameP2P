import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { vi } from 'vitest'
import type { UseLobby } from '~/entities/lobby'
import CreateForm from '../_CreateForm'
import JoinForm from '../_JoinForm'
import LobbyFlow from '../_LobbyFlow'
import LobbyIndexPage from '../index'

vi.mock('@release/translation', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

// All the lobby pieces read the session through useSession, so a single mock
// here drives create/join/roster/start behavior.
let sessionValue: UseLobby
vi.mock('~/app/providers/SessionProvider', () => ({
  useSession: () => sessionValue,
}))

function base(): UseLobby {
  return {
    state: null,
    status: 'idle',
    roomCode: null,
    isHost: false,
    canStart: false,
    error: null,
    createRoom: vi.fn(),
    joinRoom: vi.fn(),
    ready: vi.fn(),
    kick: vi.fn(),
    setMaxPlayers: vi.fn(),
    transferHost: vi.fn(),
    leaveSession: vi.fn(),
    clearError: vi.fn(),
  }
}

function renderInRouter(ui: ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

it('CreateForm renders only the create form', () => {
  sessionValue = base()
  renderInRouter(<CreateForm />)
  expect(screen.getByText('lobby.createTitle')).toBeTruthy()
  expect(screen.queryByText('lobby.joinTitle')).toBeNull()
})

it('JoinForm renders only the connect form', () => {
  sessionValue = base()
  renderInRouter(<JoinForm />)
  expect(screen.getByText('lobby.joinTitle')).toBeTruthy()
  expect(screen.queryByText('lobby.createTitle')).toBeNull()
})

it('JoinForm pre-fills the code from a shared /lobby/:lobbyId link', () => {
  sessionValue = base()
  render(
    <MemoryRouter initialEntries={['/lobby/ABC-23D']}>
      <Routes>
        <Route path="/lobby/:lobbyId" element={<JoinForm />} />
      </Routes>
    </MemoryRouter>,
  )
  expect(screen.getByDisplayValue('ABC-23D')).toBeTruthy()
})

it('/lobby opens the connect form when ?mode=join, create otherwise', () => {
  sessionValue = base()
  const { unmount } = render(
    <MemoryRouter initialEntries={['/lobby?mode=join']}>
      <LobbyIndexPage />
    </MemoryRouter>,
  )
  expect(screen.getByText('lobby.joinTitle')).toBeTruthy()
  expect(screen.queryByText('lobby.createTitle')).toBeNull()
  unmount()

  render(
    <MemoryRouter initialEntries={['/lobby']}>
      <LobbyIndexPage />
    </MemoryRouter>,
  )
  expect(screen.getByText('lobby.createTitle')).toBeTruthy()
})

it('/lobby toggle switches between the two forms', () => {
  sessionValue = base()
  render(
    <MemoryRouter initialEntries={['/lobby?mode=create']}>
      <LobbyIndexPage />
    </MemoryRouter>,
  )
  expect(screen.getByText('lobby.createTitle')).toBeTruthy()
  fireEvent.click(screen.getByText('lobby.join'))
  expect(screen.getByText('lobby.joinTitle')).toBeTruthy()
  expect(screen.queryByText('lobby.createTitle')).toBeNull()
})

it('LobbyFlow renders the form (children) before a session exists', () => {
  sessionValue = base()
  renderInRouter(
    <LobbyFlow>
      <div>FORM-SLOT</div>
    </LobbyFlow>,
  )
  expect(screen.getByText('FORM-SLOT')).toBeTruthy()
})

it('LobbyFlow clears a stale error on mount', () => {
  sessionValue = { ...base(), status: 'error', error: 'peer-unavailable' }
  renderInRouter(
    <LobbyFlow>
      <div>FORM-SLOT</div>
    </LobbyFlow>,
  )
  expect(sessionValue.clearError).toHaveBeenCalledOnce()
})

it('pre-session Leave tears the (failed) session down', () => {
  sessionValue = { ...base(), status: 'error', error: 'peer-unavailable' }
  renderInRouter(
    <LobbyFlow>
      <div>FORM-SLOT</div>
    </LobbyFlow>,
  )
  fireEvent.click(screen.getByText('lobby.leave'))
  expect(sessionValue.leaveSession).toHaveBeenCalledOnce()
})

it('LobbyFlow shows the kicked message instead of the form', () => {
  sessionValue = { ...base(), status: 'kicked' }
  renderInRouter(
    <LobbyFlow>
      <div>FORM-SLOT</div>
    </LobbyFlow>,
  )
  expect(screen.getByText('lobby.kickedMessage')).toBeTruthy()
  expect(screen.queryByText('FORM-SLOT')).toBeNull()
})

function inSession(): UseLobby {
  return {
    ...base(),
    status: 'in-lobby',
    roomCode: 'ABC-23D',
    isHost: true,
    state: {
      selfId: 'h',
      hostId: 'h',
      maxPlayers: 4,
      peers: {
        h: { id: 'h', name: 'Host', role: 'host', ready: true },
        p1: { id: 'p1', name: 'Pat', role: 'player', ready: false },
      },
    },
  }
}

it('LobbyFlow offers Continue/Leave when arriving with an active session', () => {
  sessionValue = inSession()
  renderInRouter(
    <LobbyFlow>
      <div>FORM-SLOT</div>
    </LobbyFlow>,
  )
  expect(screen.getByText('lobby.activeSession')).toBeTruthy()
  expect(screen.getByText('lobby.continue')).toBeTruthy()
  // Neither the form nor the live session view is shown yet.
  expect(screen.queryByText('FORM-SLOT')).toBeNull()
  expect(screen.queryByText('lobby.players')).toBeNull()
})

it('Leave from the interstitial tears the session down', () => {
  sessionValue = inSession()
  renderInRouter(
    <LobbyFlow>
      <div>FORM-SLOT</div>
    </LobbyFlow>,
  )
  fireEvent.click(screen.getByText('lobby.leave'))
  expect(sessionValue.leaveSession).toHaveBeenCalledOnce()
})

it('Continue reveals the live session view (room code, roster, share link)', () => {
  sessionValue = inSession()
  renderInRouter(
    <LobbyFlow>
      <div>FORM-SLOT</div>
    </LobbyFlow>,
  )
  fireEvent.click(screen.getByText('lobby.continue'))
  expect(screen.getByText('ABC-23D')).toBeTruthy()
  expect(screen.getByText('Host')).toBeTruthy()
  expect(screen.getByText('Pat')).toBeTruthy()
  expect(screen.getByDisplayValue(/\/lobby\/ABC-23D$/)).toBeTruthy()
})
