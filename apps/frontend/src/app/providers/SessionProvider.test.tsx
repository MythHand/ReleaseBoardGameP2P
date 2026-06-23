import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { SessionProvider, useSession } from './SessionProvider'

const useLobbyMock = vi.fn(() => ({
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
}))
vi.mock('~/network', () => ({ useLobby: () => useLobbyMock() }))

function Probe() {
  const session = useSession()
  return <span data-testid="code">{session.roomCode}</span>
}

it('exposes the lobby through context and calls useLobby once', () => {
  const { rerender } = render(
    <SessionProvider>
      <Probe />
    </SessionProvider>,
  )
  expect(screen.getByTestId('code').textContent).toBe('ABC-123')
  rerender(
    <SessionProvider>
      <Probe />
    </SessionProvider>,
  )
  // Single provider instance => useLobby invoked once (transport not recreated).
  expect(useLobbyMock).toHaveBeenCalledTimes(1)
})

it('throws when useSession is used outside the provider', () => {
  function Orphan() {
    useSession()
    return null
  }
  expect(() => render(<Orphan />)).toThrow()
})
