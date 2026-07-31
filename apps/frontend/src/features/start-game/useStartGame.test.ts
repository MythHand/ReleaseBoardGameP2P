import { renderHook } from '@testing-library/react'
import { vi } from 'vitest'
import { useFollowGameStart, useStartGame } from './useStartGame'

const navigate = vi.fn()
const startGame = vi.fn()
let session: { gameId: string | null; startGame: () => void }

vi.mock('react-router', () => ({ useNavigate: () => navigate }))
vi.mock('~/app/lib/viewTransition', () => ({
  runViewTransition: (update: () => void) => update(),
}))
vi.mock('~/app/providers/SessionProvider', () => ({
  useSession: () => session,
}))

beforeEach(() => {
  navigate.mockClear()
  startGame.mockClear()
  session = { gameId: null, startGame }
})

it('asks the session to start the game rather than navigating alone', () => {
  const { result } = renderHook(() => useStartGame())
  result.current()
  expect(startGame).toHaveBeenCalledTimes(1)
  // The host walking to the board by itself is the bug this replaced: guests
  // only learn the game began because startGame broadcasts.
  expect(navigate).not.toHaveBeenCalled()
})

it('stays put while no game has started', () => {
  renderHook(() => useFollowGameStart())
  expect(navigate).not.toHaveBeenCalled()
})

it('follows the game id to the board, whatever the role', () => {
  // No isHost anywhere in this hook: a guest reaching this state through the
  // host's GAME_STARTING navigates by the very same path the host does.
  session = { gameId: 'host-peer-1', startGame }
  renderHook(() => useFollowGameStart())
  // runViewTransition owns the transition; navigate must not start a second one.
  expect(navigate).toHaveBeenCalledWith('/board/host-peer-1')
})

it('navigates once per game, not on every render', () => {
  session = { gameId: 'host-peer-1', startGame }
  const { rerender } = renderHook(() => useFollowGameStart())
  rerender()
  rerender()
  expect(navigate).toHaveBeenCalledTimes(1)
})
