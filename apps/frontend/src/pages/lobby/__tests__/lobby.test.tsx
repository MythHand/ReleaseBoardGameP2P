import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { vi } from 'vitest'
import type { UseLobby } from '~/entities/lobby'
import CreateForm from '../_CreateForm'
import JoinForm from '../_JoinForm'
import LobbyFlow from '../_LobbyFlow'
import LobbyView from '../_LobbyView'
import LobbyIndexPage from '../index'

vi.mock('@release/translation', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'ru' } }),
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
    setSetup: vi.fn(),
    disband: vi.fn(),
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

it('pre-session Back resets the (failed) session', () => {
  sessionValue = { ...base(), status: 'error', error: 'peer-unavailable' }
  renderInRouter(
    <LobbyFlow>
      <div>FORM-SLOT</div>
    </LobbyFlow>,
  )
  fireEvent.click(screen.getByText('lobby.back'))
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
      setup: {
        handLimit: 'base',
        releases: 'base',
        releaseCond: 'base',
        ai: 'base',
        gitBranch: 'base',
      },
      peers: {
        h: { id: 'h', name: 'Host', role: 'host', ready: true },
        p1: { id: 'p1', name: 'Pat', role: 'player', ready: false },
      },
    },
  }
}

it('LobbyFlow offers Continue/Drop when arriving with an active session', () => {
  sessionValue = inSession()
  renderInRouter(
    <LobbyFlow>
      <div>FORM-SLOT</div>
    </LobbyFlow>,
  )
  expect(screen.getByText('lobby.activeSession')).toBeTruthy()
  expect(screen.getByText('lobby.continue')).toBeTruthy()
  expect(screen.getByText('lobby.leave')).toBeTruthy()
  // Neither the form nor the live session view is shown yet.
  expect(screen.queryByText('FORM-SLOT')).toBeNull()
  expect(screen.queryByText('lobby.players')).toBeNull()
})

it('Drop from the interstitial tears the session down', () => {
  sessionValue = inSession()
  renderInRouter(
    <LobbyFlow>
      <div>FORM-SLOT</div>
    </LobbyFlow>,
  )
  fireEvent.click(screen.getByText('lobby.leave'))
  expect(sessionValue.leaveSession).toHaveBeenCalledOnce()
})

it('Continue reveals the live session view (room code, roster, copy)', () => {
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
  expect(screen.getByText('lobby.copy')).toBeTruthy()
})

it('LobbyView guest Leave tears the session down', () => {
  const s = inSession()
  sessionValue = { ...s, isHost: false, state: { ...s.state!, selfId: 'p1' } }
  renderInRouter(<LobbyView />)
  fireEvent.click(screen.getByText('lobby.leave'))
  expect(sessionValue.leaveSession).toHaveBeenCalledOnce()
})

it('LobbyView host disband confirm tears the session down', () => {
  sessionValue = inSession()
  renderInRouter(<LobbyView />)
  // Header disband opens the confirm modal; the modal's own disband confirms.
  fireEvent.click(screen.getByText('lobby.disband'))
  const disbandButtons = screen.getAllByText('lobby.disband')
  fireEvent.click(disbandButtons[disbandButtons.length - 1])
  expect(sessionValue.disband).toHaveBeenCalledOnce()
})

it('LobbyView renders game modes section', () => {
  sessionValue = inSession()
  renderInRouter(<LobbyView />)
  expect(screen.getByText('lobby.modes')).toBeTruthy()
})

it('LobbyView renders spectator section when guests present', () => {
  sessionValue = {
    ...inSession(),
    state: {
      selfId: 'h',
      hostId: 'h',
      maxPlayers: 4,
      setup: {
        handLimit: 'base',
        releases: 'base',
        releaseCond: 'base',
        ai: 'base',
        gitBranch: 'base',
      },
      peers: {
        h: { id: 'h', name: 'Host', role: 'host', ready: true },
        g1: { id: 'g1', name: 'Gus', role: 'guest', ready: false },
      },
    },
  }
  renderInRouter(<LobbyView />)
  expect(screen.getByText('Gus')).toBeTruthy()
  expect(screen.getByText('lobby.roleGuest')).toBeTruthy()
})

it('LobbyView host sees disband button', () => {
  sessionValue = inSession()
  renderInRouter(<LobbyView />)
  expect(screen.getByText('lobby.disband')).toBeTruthy()
})

it('LobbyView guest does not see disband button', () => {
  sessionValue = { ...inSession(), isHost: false }
  renderInRouter(<LobbyView />)
  expect(screen.queryByText('lobby.disband')).toBeNull()
})

it('LobbyFlow shows disbanded message instead of the form', () => {
  sessionValue = { ...base(), status: 'disbanded' }
  renderInRouter(
    <LobbyFlow>
      <div>FORM-SLOT</div>
    </LobbyFlow>,
  )
  expect(screen.getByText('lobby.disbandedMessage')).toBeTruthy()
  expect(screen.queryByText('FORM-SLOT')).toBeNull()
})

it('LobbyFlow skips the interstitial when resumed=true', () => {
  sessionValue = inSession()
  render(
    <MemoryRouter initialEntries={[{ pathname: '/lobby', state: { resumed: true } }]}>
      <LobbyFlow>
        <div>FORM-SLOT</div>
      </LobbyFlow>
    </MemoryRouter>,
  )
  expect(screen.queryByText('lobby.activeSession')).toBeNull()
  expect(screen.getByText('ABC-23D')).toBeTruthy()
})
