import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { createFakeVoiceFacade } from '~/network/voice/testing/fakeVoiceFacade'
import SessionGate from './SessionGate'
import { SessionProvider, useSession } from './SessionProvider'
import SessionRuntime from './SessionRuntime'
import { createSessionStore } from './sessionStore'

vi.mock('~/network', () => ({
  useLobby: () => ({
    voice: createFakeVoiceFacade(),
    state: null,
    status: 'idle' as const,
    roomCode: 'ABC-123',
    isHost: false,
    canStart: false,
    error: null,
    createRoom: vi.fn(),
    joinRoom: vi.fn(),
    ready: vi.fn(),
    kick: vi.fn(),
    setMaxPlayers: vi.fn(),
    transferHost: vi.fn(),
    updateProfile: vi.fn(),
    profileRejection: null,
  }),
}))

function Probe() {
  const session = useSession()
  return <span data-testid="code">{session.roomCode}</span>
}

it('exposes the lobby through context after runtime activation', async () => {
  const store = createSessionStore(() => Promise.resolve({ default: SessionRuntime }))
  void store.request()
  render(
    <SessionProvider store={store}>
      <SessionGate>
        <Probe />
      </SessionGate>
    </SessionProvider>,
  )
  expect((await screen.findByTestId('code')).textContent).toBe('ABC-123')
})

it('throws when useSession is used outside the provider', () => {
  function Orphan() {
    useSession()
    return null
  }
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  expect(() => render(<Orphan />)).toThrow('useSession must be used within')
  spy.mockRestore()
})
