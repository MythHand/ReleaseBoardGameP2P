import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { vi } from 'vitest'
import { MAX_RECONNECT_ATTEMPTS, type UseLobby } from '~/entities/lobby'
import { botNames } from '~/features/start-game/botNames'
import LobbyView from '../_LobbyView'
import LobbyPage from '../[lobbyId]'

// LobbyCode and GameSettings take whole copy objects via returnObjects, so the
// mock has to hand back a shape for those keys rather than echoing the key —
// otherwise their labels render blank and assertions on them are meaningless.
const OBJECT_COPY: Record<string, unknown> = {
  lobbyCode: {
    label: 'lobbyCode.label',
    copy: 'lobbyCode.copy',
    copied: 'lobbyCode.copied',
    copyLink: 'lobbyCode.copyLink',
    copyCode: 'lobbyCode.copyCode',
  },
}

vi.mock('@release/translation', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: { returnObjects?: boolean }) =>
      opts?.returnObjects && OBJECT_COPY[k] ? OBJECT_COPY[k] : k,
    i18n: { language: 'ru', resolvedLanguage: 'ru', changeLanguage: vi.fn() },
  }),
}))

const writeText = vi.fn().mockResolvedValue(undefined)
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText },
  configurable: true,
})

// All the lobby pieces read the session through useSession, so a single mock
// here drives create/join/roster/start behavior.
let sessionValue: UseLobby
const sendChat = vi.fn(() => true)
vi.mock('~/app/providers/SessionProvider', () => ({
  useSession: () => sessionValue,
}))

function base(): UseLobby {
  return {
    state: null,
    status: 'idle',
    restoring: false,
    reconnect: {
      attempt: 0,
      maxAttempts: MAX_RECONNECT_ATTEMPTS,
      status: 'idle',
      events: [],
      retry: vi.fn(),
    },
    roomCode: null,
    isHost: false,
    canStart: false,
    gameId: null,
    gameLink: null,
    gameSync: null,
    seats: [],
    error: null,
    errorKind: null,
    chat: { entries: [], notificationEntryIds: [], selfMemberId: null, send: vi.fn() },
    createRoom: vi.fn(),
    joinRoom: vi.fn(),
    ready: vi.fn(),
    setWhere: vi.fn(),
    kick: vi.fn(),
    setMaxPlayers: vi.fn(),
    setBots: vi.fn(),
    startGame: vi.fn(),
    introReady: vi.fn(),
    transferHost: vi.fn(),
    setSetup: vi.fn(),
    disband: vi.fn(),
    leaveSession: vi.fn(),
    leaveGame: vi.fn(),
    previewPick: vi.fn(),
    pickPreview: null,
    clearError: vi.fn(),
  }
}

function renderInRouter(ui: ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

it('shows the invite screen when there is no session', () => {
  sessionValue = base()
  renderInRouter(<LobbyPage />)
  expect(screen.getByText('invite.formTitle')).toBeTruthy()
  expect(screen.getByText('invite.joinCta')).toBeTruthy()
})

it.each([true, false])('allows only the host to select two starting piles (host: %s)', (isHost) => {
  sessionValue = { ...inSession(), isHost }
  renderInRouter(<LobbyView />)
  fireEvent.click(screen.getByRole('button', { name: '2' }))
  if (isHost) {
    expect(sessionValue.setSetup).toHaveBeenCalledWith({
      ...sessionValue.state?.setup,
      startingDecks: 'two',
    })
  } else {
    expect(sessionValue.setSetup).not.toHaveBeenCalled()
  }
})

it('pre-fills the code from a shared /lobby/:lobbyId link', () => {
  sessionValue = base()
  render(
    <MemoryRouter initialEntries={['/lobby/ABC-23D']}>
      <Routes>
        <Route path="/lobby/:lobbyId" element={<LobbyPage />} />
      </Routes>
    </MemoryRouter>,
  )
  expect(screen.getByDisplayValue('ABC-23D')).toBeTruthy()
})

it('clears a stale error on mount', () => {
  sessionValue = { ...base(), status: 'error', error: 'peer-unavailable', errorKind: 'not-found' }
  renderInRouter(<LobbyPage />)
  expect(sessionValue.clearError).toHaveBeenCalledOnce()
})

it('the invite screen home button resets the (failed) session', () => {
  sessionValue = { ...base(), status: 'error', error: 'peer-unavailable', errorKind: 'not-found' }
  renderInRouter(<LobbyPage />)
  fireEvent.click(screen.getByText('invite.homePage'))
  expect(sessionValue.leaveSession).toHaveBeenCalledOnce()
})

it('shows the kicked message instead of the form', () => {
  sessionValue = { ...base(), status: 'kicked' }
  renderInRouter(<LobbyPage />)
  expect(screen.getByText('lobby.kickedMessage')).toBeTruthy()
  expect(screen.queryByText('lobby.joinTitle')).toBeNull()
})

function inSession(): UseLobby {
  return {
    ...base(),
    status: 'in-lobby',
    roomCode: 'ABC-23D',
    isHost: true,
    chat: { entries: [], notificationEntryIds: [], selfMemberId: 'member-h', send: sendChat },
    state: {
      selfId: 'h',
      hostId: 'h',
      maxPlayers: 4,
      bots: 0,
      setup: {
        handLimit: 'base',
        releases: 'base',
        releaseCond: 'base',
        ai: 'base',
        gitBranch: 'base',
      },
      peers: {
        h: {
          id: 'h',
          memberId: 'member-h',
          name: 'Host',
          role: 'host',
          ready: true,
          where: 'lobby',
        },
        p1: {
          id: 'p1',
          memberId: 'member-p1',
          name: 'Pat',
          role: 'player',
          ready: false,
          where: 'lobby',
        },
      },
    },
  }
}

it('renders the room chat as the third lobby column', () => {
  sessionValue = inSession()
  renderInRouter(<LobbyView />)
  expect(screen.getByText('lobbyScreen.chat')).toBeTruthy()
  expect(screen.getByPlaceholderText('chat.placeholder')).toBeTruthy()
})

it('submits a lobby message through the session chat model', () => {
  sendChat.mockClear()
  sessionValue = inSession()
  renderInRouter(<LobbyView />)
  const field = screen.getByPlaceholderText('chat.placeholder')
  fireEvent.change(field, { target: { value: 'hello' } })
  fireEvent.keyDown(field, { key: 'Enter' })
  expect(sendChat).toHaveBeenCalledWith('hello')
})

it('offers Continue/Leave when arriving with an active session', () => {
  sessionValue = inSession()
  renderInRouter(<LobbyPage />)
  expect(screen.getByText('lobby.activeSession')).toBeTruthy()
  expect(screen.getByText('lobby.continue')).toBeTruthy()
  expect(screen.getByText('lobby.leave')).toBeTruthy()
  // Neither the join form nor the live session view is shown yet.
  expect(screen.queryByText('lobby.joinTitle')).toBeNull()
  expect(screen.queryByText('lobbyScreen.players')).toBeNull()
})

it('Leave from the interstitial tears the session down', () => {
  sessionValue = inSession()
  renderInRouter(<LobbyPage />)
  fireEvent.click(screen.getByText('lobby.leave'))
  expect(sessionValue.leaveSession).toHaveBeenCalledOnce()
})

it('Continue reveals the live session view (room code, roster, copy)', () => {
  sessionValue = inSession()
  renderInRouter(<LobbyPage />)
  fireEvent.click(screen.getByText('lobby.continue'))
  expect(screen.getByText('ABC-23D')).toBeTruthy()
  expect(screen.getByText('Host')).toBeTruthy()
  expect(screen.getByText('Pat')).toBeTruthy()
  expect(screen.getByText('lobbyCode.copyLink')).toBeTruthy()
})

it('LobbyView guest leave confirm tears the session down', () => {
  const s = inSession()
  // biome-ignore lint/style/noNonNullAssertion: inSession() always seeds state
  sessionValue = { ...s, isHost: false, state: { ...s.state!, selfId: 'p1' } }
  renderInRouter(<LobbyView />)
  // Leaving sits where the host's disband does, behind a confirm of its own:
  // the header button only opens it, the modal's own leave confirms.
  fireEvent.click(screen.getByText('lobbyScreen.leave'))
  expect(sessionValue.leaveSession).not.toHaveBeenCalled()
  expect(screen.getByText('lobbyScreen.leaveTitle')).toBeTruthy()
  const leaveButtons = screen.getAllByText('lobbyScreen.leave')
  fireEvent.click(leaveButtons[leaveButtons.length - 1])
  expect(sessionValue.leaveSession).toHaveBeenCalledOnce()
})

// [ READY ] repeats the toggle in the player's own row (owner, 25.09): the
// same action, and green — pressed — while the player is ready.
it('LobbyView gives a seated player a [ READY ] that toggles their readiness', () => {
  const s = inSession()
  // biome-ignore lint/style/noNonNullAssertion: inSession() always seeds state
  sessionValue = { ...s, isHost: false, state: { ...s.state!, selfId: 'p1' } }
  renderInRouter(<LobbyView />)
  const ready = screen.getByRole('button', { name: /lobbyScreen\.ready/ })
  expect(ready.getAttribute('aria-pressed')).toBe('false')
  fireEvent.click(ready)
  expect(sessionValue.ready).toHaveBeenCalledOnce()
})

it('LobbyView puts the host’s [ READY ] above [ START ]', () => {
  sessionValue = inSession()
  renderInRouter(<LobbyView />)
  // the host is ready in the fixture: its own row's toggle and the button both
  // read ready, pressed — the button is the one in the actions, before start
  const start = screen.getByRole('button', { name: /lobbyScreen\.start/ })
  const ready = screen
    .getAllByRole('button', { name: /lobbyScreen\.ready/ })
    .find((b) => b.parentElement === start.parentElement)
  expect(ready?.getAttribute('aria-pressed')).toBe('true')
  // biome-ignore lint/style/noNonNullAssertion: found in the same actions row
  expect(ready!.compareDocumentPosition(start) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

it('LobbyView leaves a spectator’s actions empty', () => {
  const s = inSession()
  // biome-ignore lint/style/noNonNullAssertion: inSession() always seeds state
  const state = s.state!
  sessionValue = {
    ...s,
    isHost: false,
    state: {
      ...state,
      selfId: 'g1',
      peers: {
        ...state.peers,
        g1: {
          id: 'g1',
          memberId: 'member-g1',
          name: 'Gus',
          role: 'guest',
          ready: false,
          where: 'lobby',
        },
      },
    },
  }
  renderInRouter(<LobbyView />)
  expect(screen.queryByRole('button', { name: /lobbyScreen\.ready/ })).toBeNull()
  expect(screen.queryByRole('button', { name: /lobbyScreen\.start/ })).toBeNull()
})

it('LobbyView host disband confirm tears the session down', () => {
  sessionValue = inSession()
  renderInRouter(<LobbyView />)
  // Header disband opens the confirm modal; the modal's own disband confirms.
  fireEvent.click(screen.getByText('lobbyScreen.disband'))
  const disbandButtons = screen.getAllByText('lobbyScreen.disband')
  fireEvent.click(disbandButtons[disbandButtons.length - 1])
  expect(sessionValue.disband).toHaveBeenCalledOnce()
})

it('LobbyView renders game modes section', () => {
  sessionValue = inSession()
  renderInRouter(<LobbyView />)
  expect(screen.getByText('lobbyScreen.modes')).toBeTruthy()
})

it('LobbyView renders spectator section when guests present', () => {
  sessionValue = {
    ...inSession(),
    state: {
      selfId: 'h',
      hostId: 'h',
      maxPlayers: 4,
      bots: 0,
      setup: {
        handLimit: 'base',
        releases: 'base',
        releaseCond: 'base',
        ai: 'base',
        gitBranch: 'base',
      },
      peers: {
        h: {
          id: 'h',
          memberId: 'member-h',
          name: 'Host',
          role: 'host',
          ready: true,
          where: 'lobby',
        },
        g1: {
          id: 'g1',
          memberId: 'member-g1',
          name: 'Gus',
          role: 'guest',
          ready: false,
          where: 'lobby',
        },
      },
    },
  }
  renderInRouter(<LobbyView />)
  expect(screen.getByText('Gus')).toBeTruthy()
  expect(screen.getByText('lobbyScreen.roleGuest')).toBeTruthy()
})

// The HUD tone is the lobby's "ready to go" signal. It rides on the same
// canStart the Start button uses, so the green background and an enabled Start
// can never disagree — a mismatch there is exactly what a host would query.
// The link opens the invite screen with the code pre-filled.
it('LobbyView copies the invite link rather than the code', () => {
  writeText.mockClear()
  sessionValue = inSession()
  const { container } = renderInRouter(<LobbyView />)
  const copyBtn = [...container.querySelectorAll('button')].find(
    (b) => b.textContent === 'lobbyCode.copyLink',
  )
  expect(copyBtn).toBeTruthy()
  expect(screen.getByText('ABC-23D')).toBeTruthy()
  fireEvent.click(copyBtn as HTMLButtonElement)
  expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/lobby/ABC-23D'))
  expect(writeText).not.toHaveBeenCalledWith('ABC-23D')
})

it('LobbyView shows the neutral HUD tone while the game cannot start', () => {
  sessionValue = { ...inSession(), canStart: false }
  const { container } = renderInRouter(<LobbyView />)
  expect(container.querySelector('[data-tone="neutral"]')).toBeTruthy()
  expect(container.querySelector('[data-tone="positive"]')).toBeNull()
})

it('LobbyView turns the HUD tone positive once the game can start', () => {
  sessionValue = { ...inSession(), canStart: true }
  const { container } = renderInRouter(<LobbyView />)
  expect(container.querySelector('[data-tone="positive"]')).toBeTruthy()
  expect(container.querySelector('[data-tone="neutral"]')).toBeNull()
})

it('LobbyView host sees disband button', () => {
  sessionValue = inSession()
  renderInRouter(<LobbyView />)
  expect(screen.getByText('lobbyScreen.disband')).toBeTruthy()
})

it('LobbyView guest does not see disband button', () => {
  sessionValue = { ...inSession(), isHost: false }
  renderInRouter(<LobbyView />)
  expect(screen.queryByText('lobbyScreen.disband')).toBeNull()
})

it('shows the disbanded message instead of the form', () => {
  sessionValue = { ...base(), status: 'disbanded' }
  renderInRouter(<LobbyPage />)
  expect(screen.getByText('lobby.disbandedMessage')).toBeTruthy()
  expect(screen.queryByText('lobby.joinTitle')).toBeNull()
})

it('skips the interstitial when resumed=true', () => {
  sessionValue = inSession()
  render(
    <MemoryRouter initialEntries={[{ pathname: '/lobby/ABC-23D', state: { resumed: true } }]}>
      <LobbyPage />
    </MemoryRouter>,
  )
  expect(screen.queryByText('lobby.activeSession')).toBeNull()
  expect(screen.getByText('ABC-23D')).toBeTruthy()
})

it('walking back from the results screen shows the lobby with everyone still in it', () => {
  // The state the "to lobby" button actually leaves behind: the room is alive
  // and its roster intact, the match id is gone (leaveGame), and the seating the
  // finished match was dealt with is still held. The lobby must show the room,
  // not the join form, and must still list every player.
  sessionValue = {
    ...inSession(),
    gameId: null,
    seats: [
      { playerId: 'p1', peerId: 'h', name: 'Host' },
      { playerId: 'p2', peerId: 'p1', name: 'Pat' },
    ],
  }

  render(
    <MemoryRouter initialEntries={[{ pathname: '/lobby/ABC-23D', state: { resumed: true } }]}>
      <LobbyPage />
    </MemoryRouter>,
  )

  // Not the join form, and not the Continue/Leave interstitial.
  expect(screen.queryByText('invite.formTitle')).toBeNull()
  expect(screen.queryByText('lobby.activeSession')).toBeNull()
  // The room, with its code and both players.
  expect(screen.getByText('ABC-23D')).toBeTruthy()
  expect(screen.getByText('Host')).toBeTruthy()
  expect(screen.getByText('Pat')).toBeTruthy()
})

it('announces the lobby as its whereabouts when arriving back from a match', () => {
  const setWhere = vi.fn()
  sessionValue = { ...inSession(), gameId: null, setWhere }

  render(
    <MemoryRouter initialEntries={[{ pathname: '/lobby/ABC-23D', state: { resumed: true } }]}>
      <LobbyPage />
    </MemoryRouter>,
  )

  // Otherwise everyone else's results table would still show this peer on the
  // results screen after they had left it.
  expect(setWhere).toHaveBeenCalledWith('lobby')
})

it('seats a bot from a free slot and shows it in the row above', () => {
  const session = inSession()
  const setBots = vi.fn()
  sessionValue = {
    ...session,
    isHost: true,
    setBots,
    // biome-ignore lint/style/noNonNullAssertion: inSession() always seeds state
    state: { ...session.state!, maxPlayers: 6, bots: 2 },
  }
  renderInRouter(<LobbyView />)

  // Two bot rows, named by the host-seeded pick: one per bot the host asked for (inSession() seats 2 humans,
  // so 6 - 2 = 4 free seats comfortably cover the 2 asked for).
  for (const name of botNames(session.state?.hostId ?? '', 2)) screen.getByText(name)

  // One button per remaining free seat; pressing any of them asks for one more
  // bot than the table currently shows, not one more than the stored ask.
  const add = screen.getAllByText('lobbyScreen.addBot')
  expect(add).toHaveLength(2)
  fireEvent.click(add[0])
  expect(setBots).toHaveBeenCalledWith(3)
})

it('takes a bot away through the same menu that kicks a person', () => {
  const session = inSession()
  const setBots = vi.fn()
  sessionValue = {
    ...session,
    isHost: true,
    setBots,
    // A table whose seats are full enough to clamp the ask: 2 humans in 3
    // seats leaves room for one of the five bots asked for. What the host sees
    // is one bot, and that is what [remove] must count down from.
    // biome-ignore lint/style/noNonNullAssertion: inSession() always seeds state
    state: { ...session.state!, maxPlayers: 3, bots: 5 },
  }
  renderInRouter(<LobbyView />)

  // The bot row comes after the two human ones, and the humans' menus carry
  // kick rather than this — so opening the third menu opens the bot's.
  const menus = screen.getAllByLabelText('lobbyScreen.actions')
  fireEvent.click(menus[menus.length - 1])
  fireEvent.click(screen.getByText('lobbyScreen.removeBot'))

  // Counted down from the one bot on screen, not from the ask of five.
  expect(setBots).toHaveBeenCalledWith(0)
})

// The controls are the host's, exactly as the capacity slider is. A guest still
// sees the bots — in the rows.
it('hides the bot controls from a guest but not the bots', () => {
  const session = inSession()
  sessionValue = {
    ...session,
    isHost: false,
    // biome-ignore lint/style/noNonNullAssertion: inSession() always seeds state
    state: { ...session.state!, maxPlayers: 6, bots: 1 },
  }
  renderInRouter(<LobbyView />)

  expect(screen.queryByText('lobbyScreen.addBot')).toBeNull()
  expect(screen.queryByText('lobbyScreen.removeBot')).toBeNull()
  screen.getByText(botNames(session.state?.hostId ?? '', 1)[0])
})

it('copies the bare room code through its separate header button', () => {
  writeText.mockClear()
  sessionValue = inSession()
  renderInRouter(<LobbyView />)
  fireEvent.click(screen.getByText('lobbyCode.copyCode'))
  expect(writeText).toHaveBeenCalledWith('ABC-23D')
})
