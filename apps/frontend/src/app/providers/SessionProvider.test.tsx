import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { SessionProvider, useSession } from './SessionProvider'

vi.mock('~/network', () => ({
  useLobby: () => ({
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
  }),
}))

function Probe() {
  const session = useSession()
  return <span data-testid="code">{session.roomCode}</span>
}

it('exposes the lobby through context', () => {
  render(
    <SessionProvider>
      <Probe />
    </SessionProvider>,
  )
  expect(screen.getByTestId('code').textContent).toBe('ABC-123')
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
