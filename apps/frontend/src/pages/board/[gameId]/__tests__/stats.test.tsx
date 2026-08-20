import type { PlayerView } from '@release/engine'
import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import type { PeerInfo } from '~/network'
import StatsPage from '../stats'

const goToLobby = vi.fn()
const leaveGame = vi.fn()
const setWhere = vi.fn()

let view: PlayerView | null
let peers: Record<string, PeerInfo>
let selfId: string

vi.mock('@release/translation', () => ({
  useTranslation: () => ({
    // The screen is i18n-agnostic and takes copy as props, so echoing the key
    // is enough to assert which copy reached which slot.
    t: (k: string, opts?: { returnObjects?: boolean }) => (opts?.returnObjects ? {} : k),
    i18n: { resolvedLanguage: 'en', changeLanguage: () => Promise.resolve() },
  }),
}))
vi.mock('~/app/lib/lobbyNavigation', () => ({ useGoToLobby: () => goToLobby }))
vi.mock('~/app/providers/SessionProvider', () => ({
  useSession: () => ({
    state: { selfId, peers, hostId: 'peer-a' },
    roomCode: 'ROOM',
    leaveGame,
    setWhere,
  }),
}))
vi.mock('~/features/play-game/useGame', () => ({ useGame: () => ({ view, events: [] }) }))

const zero = { attack: 0, defense: 0, ddos: 0, ai: 0, err503: 0, cherryPick: 0, attackedInto: 0 }

beforeEach(() => {
  goToLobby.mockClear()
  leaveGame.mockClear()
  setWhere.mockClear()
  selfId = 'peer-a'
  peers = {
    'peer-a': { id: 'peer-a', name: 'Ann', role: 'host', ready: true, where: 'stats' },
    'peer-b': { id: 'peer-b', name: 'Bo', role: 'player', ready: true, where: 'lobby' },
  }
  view = {
    over: { winner: 'p1', condition: 'release' },
    tally: { p1: { ...zero, attack: 5 }, p2: { ...zero, defense: 3 } },
  } as unknown as PlayerView
})

it('names the winner by resolving the engine seat back to a peer', () => {
  render(<StatsPage />)
  // seatsFor sorts by peer id, so p1 is peer-a.
  expect(screen.getAllByText('Ann').length).toBeGreaterThan(0)
})

it("shows every seat's counters", () => {
  render(<StatsPage />)
  expect(screen.getByText('5')).toBeTruthy()
  expect(screen.getByText('3')).toBeTruthy()
})

it('announces that this peer is on the results screen', () => {
  render(<StatsPage />)
  expect(setWhere).toHaveBeenCalledWith('stats')
})

it('leaves the match before navigating, so the follower does not bounce it back', () => {
  render(<StatsPage />)
  fireEvent.click(screen.getByText('stats.toLobby'))
  expect(leaveGame).toHaveBeenCalledTimes(1)
  expect(goToLobby).toHaveBeenCalledWith('ROOM')
})

it('renders an empty result rather than crashing when there is no projection', () => {
  // A spectator holds no seat and is never projected to; a reload loses the
  // session entirely. Both land here.
  view = null
  render(<StatsPage />)
  expect(screen.getByTestId('stats-page')).toBeTruthy()
  expect(screen.queryByText('Ann')).toBeNull()
})
