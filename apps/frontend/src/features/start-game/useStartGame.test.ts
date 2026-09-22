import { renderHook } from '@testing-library/react'
import { vi } from 'vitest'
import type { LobbyState } from '~/network'
import { useFollowGameStart, useStartGame } from './useStartGame'

const navigate = vi.fn()
const startGame = vi.fn()
let session: {
  gameId: string | null
  startGame: (names: string[]) => void
  state?: LobbyState | null
}

vi.mock('react-router', () => ({ useNavigate: () => navigate }))
vi.mock('~/app/lib/viewTransition', () => ({
  runViewTransition: (update: () => void) => update(),
}))
vi.mock('~/app/providers/SessionProvider', () => ({
  useSession: () => session,
}))
// Echoes the key plus its interpolation, rather than a real catalog string —
// this test is about the `network/` → `features/` boundary (network may not
// import i18next, so `useStartGame` is where the names get built), not about
// the copy itself. A real string would hide a swapped argument or an off-by-
// one behind indistinguishable "Bot" text.
vi.mock('@release/translation', () => ({
  useTranslation: () => ({ t: (key: string, opts?: { n?: number }) => `${key}:${opts?.n}` }),
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

// The seam docs/specs calls out by name: `network/` may not import i18next, so
// the names travel down from here, already built, rather than a bot count.
// Asserting only "startGame was called" (the test above) would miss a swapped
// index or a name for the wrong bot entirely — this pins the count, the order,
// and that each one carries its own `n`, not the same one repeated.
it('builds one name per effective bot, in seat order, from the catalog key', () => {
  session = {
    gameId: null,
    startGame,
    state: {
      selfId: 'host',
      hostId: 'host',
      maxPlayers: 6,
      bots: 3,
      setup: {},
      peers: {
        host: {
          id: 'host',
          memberId: 'member-host',
          name: 'Ann',
          role: 'host',
          ready: true,
          where: 'lobby',
        },
      },
    },
  }
  const { result } = renderHook(() => useStartGame())
  result.current()
  expect(startGame).toHaveBeenCalledWith([
    'lobbyScreen.botName:1',
    'lobbyScreen.botName:2',
    'lobbyScreen.botName:3',
  ])
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

it('carries a peer into the next match, not just the first', () => {
  // The hole this closes: a peer reading the results of match 1 when the host
  // starts match 2. Only reachable now that each match has its own id — a
  // rematch used to reuse the host's peer id, so this dep never changed.
  session = { gameId: 'host-peer-1-1', startGame }
  const { rerender } = renderHook(() => useFollowGameStart())
  expect(navigate).toHaveBeenCalledWith('/board/host-peer-1-1')

  session = { gameId: 'host-peer-1-2', startGame }
  rerender()

  expect(navigate).toHaveBeenCalledWith('/board/host-peer-1-2')
  expect(navigate).toHaveBeenCalledTimes(2)
})

it('stays put when the match is left rather than replaced', () => {
  session = { gameId: 'host-peer-1-1', startGame }
  const { rerender } = renderHook(() => useFollowGameStart())
  navigate.mockClear()

  session = { gameId: null, startGame }
  rerender()

  expect(navigate).not.toHaveBeenCalled()
})
