import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, vi } from 'vitest'
import type { UseLobby } from '~/entities/lobby'
import { clearSession } from '~/shared/lib/persistence'
import StartPage from '../start'

vi.mock('@release/translation', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'ru' } }),
}))
// Network hooks are stubbed: the menu must not start a connection.
vi.mock('~/features/create-lobby/useCreateLobby', () => ({ useCreateLobby: () => vi.fn() }))
vi.mock('~/features/join-lobby/useJoinLobby', () => ({ useJoinLobby: () => vi.fn() }))

vi.mock('~/app/providers/SessionProvider', () => ({
  useSession: () => sessionValue,
}))

let sessionValue: Pick<UseLobby, 'status' | 'state' | 'roomCode'>

// The store isn't cleared between tests by jsdom on its own, and persistence.ts
// also keeps an in-memory fallback behind sessionStorage — clearSession() is what
// actually empties both (see useLobby.test.ts's beforeEach for the same need).
beforeEach(() => {
  sessionStorage.clear()
  clearSession()
})

it('renders the start screen with create and join actions', () => {
  sessionValue = { status: 'idle', state: null, roomCode: null }
  render(
    <MemoryRouter>
      <StartPage />
    </MemoryRouter>,
  )
  expect(screen.getByText('start.createGame')).toBeTruthy()
  expect(screen.getByText('start.joinGame')).toBeTruthy()
})

it('does not offer an active session on the start screen', () => {
  sessionValue = {
    status: 'in-lobby',
    state: {
      selfId: 'h',
      hostId: 'h',
      maxPlayers: 4,
      maxSpectators: 8,
      bots: 0,
      setup: {},
      peers: {
        h: {
          id: 'h',
          memberId: 'member-h',
          name: 'Host',
          role: 'host',
          ready: true,
          where: 'lobby',
        },
      },
    },
    roomCode: 'ABC-123',
  } as Pick<UseLobby, 'status' | 'state' | 'roomCode'>
  render(
    <MemoryRouter>
      <StartPage />
    </MemoryRouter>,
  )
  expect(screen.queryByText('start.continueSession')).toBeNull()
  expect(screen.getByRole('menuitem', { name: '[start.createGame]' })).toBeTruthy()
  expect(screen.getByRole('menuitem', { name: '[start.joinGame]' })).toBeTruthy()
})

it('has no reserved session action when idle', () => {
  sessionValue = { status: 'idle', state: null, roomCode: null }
  render(
    <MemoryRouter>
      <StartPage />
    </MemoryRouter>,
  )
  expect(screen.queryByText('start.continueSession')).toBeNull()
})

it('does not offer a stored session on the start screen', () => {
  sessionStorage.setItem(
    'release:session',
    JSON.stringify({
      roomCode: 'ABC-123',
      name: 'Ann',
      role: 'guest',
      gameId: 'g1',
      joinedAt: Date.now(),
    }),
  )
  // status 'idle' and state null — exactly what a fresh mount after F5 looks like.
  sessionValue = { status: 'idle', state: null, roomCode: null }
  render(
    <MemoryRouter>
      <StartPage />
    </MemoryRouter>,
  )
  expect(screen.queryByText('start.continueSession')).toBeNull()
  expect(screen.getByRole('menuitem', { name: '[start.createGame]' })).toBeTruthy()
  expect(screen.getByRole('menuitem', { name: '[start.joinGame]' })).toBeTruthy()
})
