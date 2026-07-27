import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'
import type { UseLobby } from '~/entities/lobby'
import InviteScreen from '../_InviteScreen'

vi.mock('@release/translation', () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { resolvedLanguage: 'en', changeLanguage: vi.fn() },
  }),
}))

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
    errorKind: null,
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

const joined = (peers: Record<string, unknown>): UseLobby =>
  ({
    ...base(),
    status: 'in-lobby',
    roomCode: 'F96-NMT',
    state: { selfId: 'me', hostId: 'h', maxPlayers: 6, setup: {}, peers },
  }) as UseLobby

const renderScreen = () =>
  render(
    <MemoryRouter>
      <InviteScreen />
    </MemoryRouter>,
  )

it('shows the form when there is no session', () => {
  sessionValue = base()
  renderScreen()
  expect(screen.getByText('invite.formTitle')).toBeTruthy()
  expect(screen.getByText('invite.joinCta')).toBeTruthy()
})

it('disables the spectator role, since guest mode is not supported yet', () => {
  sessionValue = base()
  renderScreen()
  expect(screen.getByText('invite.roleSpectator').closest('button')?.disabled).toBe(true)
  expect(screen.getByText('invite.rolePlayer').closest('button')?.disabled).toBe(false)
})

it('shows the connecting state with a cancel action', () => {
  sessionValue = { ...base(), status: 'connecting' }
  renderScreen()
  expect(screen.getByText('invite.connecting')).toBeTruthy()
  expect(screen.getByText('invite.cancel')).toBeTruthy()
})

it('shows the connected state until the roster arrives', () => {
  sessionValue = joined({ me: { id: 'me', name: 'Me', role: 'guest', ready: false } })
  renderScreen()
  expect(screen.getByText('invite.connected')).toBeTruthy()
})

it('shows the not-found status for an unknown code', () => {
  sessionValue = {
    ...base(),
    status: 'error',
    error: 'peer-unavailable: x',
    errorKind: 'not-found',
  }
  renderScreen()
  expect(screen.getByText('invite.notFoundStatus')).toBeTruthy()
  expect(screen.getByText('invite.retry')).toBeTruthy()
})

it('shows the generic failure status for a connection error', () => {
  sessionValue = { ...base(), status: 'error', error: 'network: x', errorKind: 'connection' }
  renderScreen()
  expect(screen.getByText('invite.connectError')).toBeTruthy()
  expect(screen.getByText('invite.retry')).toBeTruthy()
})

it('never leaks the raw PeerJS error string', () => {
  sessionValue = {
    ...base(),
    status: 'error',
    error: 'peer-unavailable: x',
    errorKind: 'not-found',
  }
  renderScreen()
  expect(screen.queryByText(/peer-unavailable/)).toBeNull()
})

it('cancelling a connection tears the session down', () => {
  sessionValue = { ...base(), status: 'connecting' }
  renderScreen()
  fireEvent.click(screen.getByText('invite.cancel'))
  expect(sessionValue.leaveSession).toHaveBeenCalledOnce()
})

it('does not join when the nickname is empty', () => {
  sessionValue = base()
  renderScreen()
  fireEvent.click(screen.getByText('invite.joinCta'))
  expect(sessionValue.joinRoom).not.toHaveBeenCalled()
})
