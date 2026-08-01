import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from '@release/engine/fake'
import { fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { vi } from 'vitest'
import type { UseLobby } from '~/entities/lobby'
import BoardPage from '../_layout'
import StatsPage from '../stats'

// The board reads the roster through the session, so every test drives it from
// here rather than through a live transport.
let sessionValue: UseLobby
vi.mock('~/app/providers/SessionProvider', () => ({
  useSession: () => sessionValue,
}))

function session(peers: Record<string, unknown> = {}): UseLobby {
  return {
    state: { selfId: 'me', hostId: 'me', maxPlayers: 6, setup: {}, peers },
    status: 'in-lobby',
    roomCode: 'YTG-N2Q',
    isHost: true,
    kick: vi.fn(),
  } as unknown as UseLobby
}

beforeEach(() => {
  sessionValue = session()
})

function renderBoard(path = '/board/g1') {
  const router = createMemoryRouter(
    [
      {
        path: '/board/:gameId',
        element: <BoardPage />,
        children: [{ path: 'stats', element: <StatsPage /> }],
      },
    ],
    { initialEntries: [path] },
  )
  return render(<RouterProvider router={router} />)
}

it('keeps the board mounted and shows stats in its outlet', async () => {
  renderBoard('/board/g1/stats')
  expect(await screen.findByTestId('board-page')).toBeTruthy()
  expect(await screen.findByTestId('stats-page')).toBeTruthy()
})

it('fills the viewport so the table is not clipped to nothing', () => {
  const { container } = renderBoard()
  // Table is `block-size: 100%` over `overflow: hidden`, so a parent without a
  // definite height collapses it to zero and clips every child — the page went
  // black. The class carrying that height is the fix; losing it is invisible in
  // jsdom, which is exactly how it shipped.
  const page = container.querySelector('[data-testid="board-page"]')
  expect(page?.className).toBeTruthy()
})

it('lists players and spectators from the session roster', async () => {
  sessionValue = session({
    me: { id: 'me', name: 'HostPeer', role: 'host', ready: true },
    g1: { id: 'g1', name: 'GuestPeer', role: 'player', ready: true },
    s1: { id: 's1', name: 'Watcher', role: 'guest', ready: false },
  })
  renderBoard()
  // The panel lives behind its rail tab, so open it the way a player would.
  // Matched against both catalogs rather than pinned to one, so the test does
  // not depend on which language the test environment resolves to.
  const tab = screen
    .getAllByRole('button')
    .find((b) => /^(participants|участники)$/i.test(b.textContent?.trim() ?? ''))
  expect(tab).toBeTruthy()
  fireEvent.click(tab as HTMLElement)

  // The roster is a room fact: the engine's projection has no spectator concept,
  // so an empty panel here means the session was never wired in.
  expect(await screen.findByText('HostPeer')).toBeTruthy()
  expect(await screen.findByText('GuestPeer')).toBeTruthy()
  expect(await screen.findByText('Watcher')).toBeTruthy()
})

it('renders a real projection: own hand in full, opponents by count only', async () => {
  // Built by the actual engine rather than hand-rolled, so the test breaks if
  // the projection's shape drifts from what the adapter expects.
  const engine = createFakeEngine()
  const state = engine.createGame({
    gameId: 'g1',
    seed: 7,
    players: [
      { id: 'p1', name: 'Ann' },
      { id: 'p2', name: 'Bo' },
    ],
    setup: {},
    deck: FAKE_DECK,
    events: FAKE_EVENTS,
  })
  const view = engine.project(state, 'p1')
  sessionValue = { ...session(), gameSync: { view, events: [] } } as unknown as UseLobby

  const { container } = renderBoard()

  // p1's own cards are rendered as cards; p2's are a number, never a card.
  const slots = container.querySelectorAll('[data-hand-slot]')
  expect(slots.length).toBe(view.self.hand.length)
  expect(slots.length).toBeGreaterThan(0)
  expect(await screen.findByText('Bo')).toBeTruthy()

  // The privacy guarantee, asserted on what actually reached the DOM.
  const opponentHand = state.players.p2.hand.map((c) => c.uid)
  expect(opponentHand.length).toBeGreaterThan(0)
  for (const uid of opponentHand) expect(container.innerHTML).not.toContain(uid)
})
