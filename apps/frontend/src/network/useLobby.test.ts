import { act, renderHook } from '@testing-library/react'
import { beforeEach, vi } from 'vitest'
import { getClientId, type StoredKeeper, type StoredSession } from '~/shared/lib/persistence'
import { INTRO_CAP_MS } from './session/startGate'
import type { Message, WireMessage } from './types'
import {
  formatRoomCode,
  KEEPER_SAVE_MS,
  makeRoomCode,
  parseRoomCode,
  type UseLobby,
  useLobby,
} from './useLobby'

// Every fake transport createTransport hands out, with the callbacks useLobby
// passed in — so a test can fire an error or a disconnect by hand.
interface FakeTransport {
  id: string
  close: ReturnType<typeof vi.fn>
  broadcast: ReturnType<typeof vi.fn>
  send: ReturnType<typeof vi.fn>
  onError?: (err: { type?: string; message: string }) => void
  onConnection?: (peerId: string) => void
  onDisconnect?: (peerId: string) => void
  onMessage?: (msg: WireMessage) => void
}

// vi.mock is hoisted above the imports, so the array it closes over has to be
// hoisted too — otherwise the factory hits a temporal-dead-zone error.
const { transports } = vi.hoisted(() => ({ transports: [] as FakeTransport[] }))

vi.mock('./transport/peer', () => ({
  createTransport: vi.fn(
    (args: {
      onError?: (err: { type?: string; message: string }) => void
      onConnection?: (peerId: string) => void
      onDisconnect?: (peerId: string) => void
      onMessage?: (msg: WireMessage) => void
    }) => {
      const fake = {
        id: `peer${transports.length}`,
        close: vi.fn(),
        connectTo: vi.fn(),
        send: vi.fn(),
        broadcast: vi.fn(),
        relay: vi.fn(),
        connectedIds: () => [],
        onError: args.onError,
        onConnection: args.onConnection,
        onDisconnect: args.onDisconnect,
        onMessage: args.onMessage,
      }
      transports.push(fake)
      return fake
    },
  ),
}))

beforeEach(() => {
  transports.length = 0
  // The hook writes `release:session` / `release:keeper` now, so a record left
  // by the previous test would be read as this one's.
  localStorage.clear()
})

it('formats a room code as ABC-123 from the peer id', () => {
  expect(formatRoomCode('abc123xyz')).toBe('ABC-123')
})

it('uppercases and handles short ids', () => {
  expect(formatRoomCode('ab1')).toBe('AB1')
})

it('parseRoomCode inverts formatRoomCode for a host-id-sized code', () => {
  const id = makeRoomCode()
  expect(id).toHaveLength(6)
  expect(parseRoomCode(formatRoomCode(id))).toBe(id)
})

it('parseRoomCode tolerates user-entered separators and casing', () => {
  expect(parseRoomCode('ABC-23D')).toBe('abc23d')
  expect(parseRoomCode(' abc 23d ')).toBe('abc23d')
})

it('classifies a peer-unavailable error as not-found', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await result.current.joinRoom('F96-NMT', 'Dimbo')
  })
  act(() => {
    transports[0].onError?.({
      type: 'peer-unavailable',
      message: 'Could not connect to peer f96nmt',
    })
  })
  expect(result.current.status).toBe('error')
  expect(result.current.errorKind).toBe('not-found')
})

it('classifies any other error as a connection failure', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await result.current.joinRoom('F96-NMT', 'Dimbo')
  })
  act(() => {
    transports[0].onError?.({ type: 'network', message: 'Lost connection to server' })
  })
  expect(result.current.status).toBe('error')
  expect(result.current.errorKind).toBe('connection')
})

it('clears errorKind alongside the error', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await result.current.joinRoom('F96-NMT', 'Dimbo')
  })
  act(() => {
    transports[0].onError?.({ type: 'peer-unavailable', message: 'nope' })
  })
  act(() => {
    result.current.clearError()
  })
  expect(result.current.error).toBeNull()
  expect(result.current.errorKind).toBeNull()
})

it('closes the previous transport when joining again after a failure', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await result.current.joinRoom('F96-NMT', 'Dimbo')
  })
  act(() => {
    transports[0].onError?.({ type: 'peer-unavailable', message: 'nope' })
  })

  await act(async () => {
    await result.current.joinRoom('F96-NMT', 'Dimbo')
  })

  expect(transports).toHaveLength(2)
  expect(transports[0].close).toHaveBeenCalledOnce()
  expect(transports[1].close).not.toHaveBeenCalled()
})

it('preserves a not-found errorKind when the never-opened channel then disconnects', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await result.current.joinRoom('F96-NMT', 'Dimbo')
  })
  act(() => {
    transports[0].onError?.({
      type: 'peer-unavailable',
      message: 'Could not connect to peer f96nmt',
    })
  })
  // The channel never opened (no onConnection fired), so hostConnectedRef is
  // still false when PeerJS follows up with a disconnect for the same peer —
  // this must not clobber the more specific 'not-found' already recorded.
  act(() => {
    transports[0].onDisconnect?.(parseRoomCode('F96-NMT'))
  })
  expect(result.current.status).toBe('error')
  expect(result.current.errorKind).toBe('not-found')
})

it('reports connection for a host disconnect after a successful connection, even over a stale kind', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await result.current.joinRoom('F96-NMT', 'Dimbo')
  })
  const hostId = parseRoomCode('F96-NMT')
  // Contrive a stale, unrelated errorKind before the channel opens, so the
  // post-connect disconnect path is proven to overwrite unconditionally
  // rather than accidentally inheriting the same "preserve if set" rule.
  act(() => {
    transports[0].onError?.({ type: 'peer-unavailable', message: 'stale' })
  })
  act(() => {
    transports[0].onConnection?.(hostId)
  })
  act(() => {
    transports[0].onDisconnect?.(hostId)
  })
  expect(result.current.status).toBe('error')
  expect(result.current.errorKind).toBe('connection')
})

// --- leaving the lobby for the board, together ---

it('host startGame broadcasts GAME_STARTING and records the game id', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await result.current.createRoom('Dimbo', 6)
  })
  expect(result.current.gameId).toBeNull()

  act(() => {
    result.current.startGame()
  })

  const hostId = result.current.state?.hostId
  const expectedSeats = [{ playerId: 'p1', peerId: hostId, clientId: getClientId(), name: 'Dimbo' }]
  expect(transports[0].broadcast).toHaveBeenCalledWith({
    type: 'GAME_STARTING',
    payload: {
      gameId: `${hostId}-1`,
      // The seating rides the frame so no peer ever has to derive one.
      seats: expectedSeats,
    },
  })
  expect(result.current.gameId).toBe(`${hostId}-1`)
  expect(result.current.seats).toEqual(expectedSeats)
})

it('a guest follows the host out of the lobby', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await result.current.joinRoom('F96-NMT', 'Dimbo')
  })
  const hostId = parseRoomCode('F96-NMT')

  act(() => {
    transports[0].onMessage?.({
      type: 'GAME_STARTING',
      payload: { gameId: hostId, seats: SEATING },
      from: hostId,
    } as WireMessage)
  })

  // The guest never clicked anything: this is the whole point of broadcasting.
  expect(result.current.gameId).toBe(hostId)
})

it("a guest holds the host's seating rather than deriving one of its own", async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await result.current.joinRoom('F96-NMT', 'Dimbo')
  })
  const hostId = parseRoomCode('F96-NMT')

  act(() => {
    transports[0].onMessage?.({
      type: 'GAME_STARTING',
      payload: { gameId: hostId, seats: SEATING },
      from: hostId,
    } as WireMessage)
  })

  // Named peers this guest's own roster has never heard of: only the frame can
  // be the source. Anything the guest computed locally would seat itself.
  expect(result.current.seats).toEqual(SEATING)
})

it("a rematch drops the previous match's projection before the board remounts", async () => {
  // GAME_STARTING and the new match's first SYNC are separate DataChannel
  // events, and React commits the navigation between them. A projection left in
  // place is the one the rematch's board mounts on: the deal intro arms on the
  // new gameId, finds no opening in match 1's view, reports itself done — and
  // the rematch's opening deal is never played, while match 1's game-over
  // overlay paints for that commit.
  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await result.current.joinRoom('F96-NMT', 'Dimbo')
  })
  const hostId = parseRoomCode('F96-NMT')

  act(() => {
    transports[0].onMessage?.({
      type: 'GAME_STARTING',
      payload: { gameId: 'g1', seats: SEATING },
      from: hostId,
    } as WireMessage)
  })
  act(() => {
    transports[0].onMessage?.({
      type: 'SYNC',
      payload: { view: { over: { winner: 'p1' } }, events: [] },
      from: hostId,
    } as unknown as WireMessage)
  })
  expect(result.current.gameSync).not.toBeNull()

  act(() => {
    transports[0].onMessage?.({
      type: 'GAME_STARTING',
      payload: { gameId: 'g2', seats: SEATING },
      from: hostId,
    } as WireMessage)
  })

  expect(result.current.gameId).toBe('g2')
  expect(result.current.gameSync).toBeNull()
})

it('a repeat of the same GAME_STARTING keeps the projection it already has', async () => {
  // Only a *different* match invalidates the view. A duplicate frame — a relay
  // hiccup, a re-broadcast — must not blank a table that is already playing.
  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await result.current.joinRoom('F96-NMT', 'Dimbo')
  })
  const hostId = parseRoomCode('F96-NMT')
  const starting = {
    type: 'GAME_STARTING',
    payload: { gameId: 'g1', seats: SEATING },
    from: hostId,
  } as WireMessage

  act(() => {
    transports[0].onMessage?.(starting)
  })
  act(() => {
    transports[0].onMessage?.({
      type: 'SYNC',
      payload: { view: { over: null }, events: [] },
      from: hostId,
    } as unknown as WireMessage)
  })
  const held = result.current.gameSync

  act(() => {
    transports[0].onMessage?.(starting)
  })

  expect(result.current.gameSync).toBe(held)
})

it('ignores a GAME_STARTING that did not come from the host', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await result.current.joinRoom('F96-NMT', 'Dimbo')
  })

  act(() => {
    transports[0].onMessage?.({
      type: 'GAME_STARTING',
      payload: { gameId: 'somewhere-else', seats: SEATING },
      from: 'another-guest',
    } as WireMessage)
  })

  // Starting the game is the host's word alone — otherwise any peer could drag
  // the table to a board of its choosing.
  expect(result.current.gameId).toBeNull()
  expect(result.current.seats).toEqual([])
})

it('forgets the game id when the session is torn down', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await result.current.createRoom('Dimbo', 6)
  })
  act(() => {
    result.current.startGame()
  })
  expect(result.current.gameId).not.toBeNull()

  act(() => {
    result.current.leaveSession()
  })
  // A stale id would bounce the player straight back to the board they left.
  expect(result.current.gameId).toBeNull()
  // And the seating describes a match nobody is in any more.
  expect(result.current.seats).toEqual([])
})

it('walking back to the lobby forgets the match but keeps its seating', async () => {
  // The seating outlives leaveGame on purpose. A results screen still mounted
  // would otherwise fall back to seatsFor(live roster) and renumber the seats —
  // one player's counters under another player's name, the departed player's row
  // gone. Nothing paints today because React batches this with the navigation
  // that follows, but that would make the invariant rest on statement order
  // inside a click handler rather than on the data.
  const { result } = await hostWithGuest()
  act(() => {
    result.current.startGame()
  })
  const dealt = result.current.seats
  expect(dealt).toHaveLength(2)

  act(() => {
    result.current.leaveGame()
  })

  // The id goes — it is what would bounce this peer back to the board.
  expect(result.current.gameId).toBeNull()
  // The seating stays, unchanged.
  expect(result.current.seats).toEqual(dealt)
})

it('a new match replaces the seating the last one left behind', async () => {
  // Why keeping it across leaveGame is safe: nothing reads it stale.
  const { result } = await hostWithGuest()
  act(() => {
    result.current.startGame()
  })
  act(() => {
    result.current.leaveGame()
  })

  act(() => {
    result.current.startGame()
  })

  expect(result.current.gameId).toBe(`${result.current.state?.hostId}-2`)
  expect(result.current.seats).toHaveLength(2)
})

// --- reporting the opening deal is done ---

// Every frame the hook addressed to a single peer, in order.
function sentTo(peerId: string): Message[] {
  return transports[0].send.mock.calls
    .filter((call) => call[0] === peerId)
    .map((call) => call[1] as Message)
}

// Everything that left this peer at all — targeted or broadcast.
function sentAll(): Message[] {
  const t = transports[0]
  if (!t) return []
  return [
    ...t.send.mock.calls.map((call) => call[1] as Message),
    ...t.broadcast.mock.calls.map((call) => call[0] as Message),
  ]
}

// A hosted lobby with one other seated player. The guest's peer id sorts after
// the host's ('peer0'), so the host takes seat p1 and holds the opening turn —
// otherwise the intent below would be rejected for being out of turn and prove
// nothing about the gate.
const GUEST = 'zguest'

// The browser behind that guest, as its JOIN_REQUEST announces it. Stable
// across a reload, which is the whole point: it is what says a join is a
// return.
const GUEST_CLIENT = 'client-bo'

// A seating as a guest receives it: peers this guest's own roster has never
// heard of, so nothing derived locally could produce it.
const SEATING = [
  { playerId: 'p1', peerId: 'aaa', name: 'Ann' },
  { playerId: 'p2', peerId: 'bbb', name: 'Bo' },
]

async function hostWithGuest(): Promise<ReturnType<typeof renderHook<UseLobby, unknown>>> {
  const rendered = renderHook(() => useLobby())
  await act(async () => {
    await rendered.result.current.createRoom('Dimbo', 6)
  })
  act(() => {
    transports[0].onMessage?.({
      type: 'JOIN_REQUEST',
      payload: { name: 'Bo', clientId: GUEST_CLIENT },
      from: GUEST,
    } as WireMessage)
  })
  return rendered
}

it('host builds the game behind a gate covering every seat', async () => {
  const { result } = await hostWithGuest()
  act(() => {
    result.current.startGame()
  })
  const syncs = () => sentTo(GUEST).filter((m) => m.type === 'SYNC').length
  // The deal's own projection, and nothing else yet.
  expect(syncs()).toBe(1)

  // A legitimate action from the host's own seat: buffered, not applied, because
  // the table is still watching its cards fly.
  act(() => {
    result.current.gameLink?.submit({ type: 'DRAW' })
  })
  expect(syncs()).toBe(1)

  // The host's own seat reports — it is in the gate's expect list like any
  // other, so the table does not move for it alone.
  act(() => {
    result.current.introReady()
  })
  expect(syncs()).toBe(1)

  // The last seat reports, off the wire, and the buffered action lands.
  act(() => {
    transports[0].onMessage?.({
      type: 'INTRO_READY',
      payload: { gameId: result.current.gameId },
      from: GUEST,
    } as WireMessage)
  })
  expect(syncs()).toBe(2)
})

it('the opening projection carries the deal to every seat', async () => {
  const { result } = await hostWithGuest()
  act(() => {
    result.current.startGame()
  })

  // Asserted on what actually left this peer, not on `createSession`'s return
  // value: production discards that array and delivers through the keeper, so a
  // test reading it passed for a fortnight while no peer ever received a deal.
  const guestSync = sentTo(GUEST).find((m) => m.type === 'SYNC')
  expect(guestSync).toBeDefined()
  const dealt = guestSync?.type === 'SYNC' ? guestSync.payload.events : []
  // One per seat, and public — a hand count is not a secret, so the guest hears
  // about the host's deal as well as its own.
  expect(dealt.filter((e) => e.type === 'dealt')).toHaveLength(2)
  // The ids the engine reserved for the deal (createGame returns
  // eventSeq: seating.length, so play starts at N+1).
  expect(dealt.map((e) => e.id)).toEqual([1, 2])
})

it('gives the local seat its deal too, not only the wire', async () => {
  const { result } = await hostWithGuest()
  act(() => {
    result.current.startGame()
  })
  // The host's own seat is served through its local link rather than a
  // connection to itself, so it is a separate delivery path and a separate way
  // for the deal to go missing.
  const sync = result.current.gameSync
  expect(sync).toBeTruthy()
  expect(sync?.events.filter((e) => e.type === 'dealt')).toHaveLength(2)
})

it('a guest tells the host when its intro is done', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await result.current.joinRoom('F96-NMT', 'Dimbo')
  })
  const hostId = parseRoomCode('F96-NMT')
  act(() => {
    transports[0].onMessage?.({
      type: 'GAME_STARTING',
      payload: { gameId: hostId, seats: SEATING },
      from: hostId,
    } as WireMessage)
  })

  act(() => {
    result.current.introReady()
  })

  expect(sentTo(hostId)).toContainEqual({ type: 'INTRO_READY', payload: { gameId: hostId } })
})

it('reporting ready outside a game is a no-op', async () => {
  // In a lobby, with a live transport and a host to address: only the absence of
  // a game keeps the frame from being sent.
  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await result.current.joinRoom('F96-NMT', 'Dimbo')
  })
  const before = sentAll().length

  act(() => {
    result.current.introReady()
  })

  expect(sentAll()).toHaveLength(before)
  expect(sentAll().some((m) => m.type === 'INTRO_READY')).toBe(false)
})

it('cancels the start gate when the session is torn down', async () => {
  vi.useFakeTimers()
  try {
    const { result } = await hostWithGuest()
    act(() => {
      result.current.startGame()
    })
    // Buffered behind the gate: the cap firing is what would later play it.
    act(() => {
      result.current.gameLink?.submit({ type: 'DRAW' })
    })
    act(() => {
      result.current.leaveSession()
    })

    // The cap is the only thing that unfreezes a table whose peer never
    // reports — but after a teardown there is no table left for it to open, and
    // a pending one would deal a card into a session the player has left.
    act(() => {
      vi.advanceTimersByTime(INTRO_CAP_MS + 1)
    })
    expect(sentTo(GUEST).filter((m) => m.type === 'SYNC')).toHaveLength(1)
  } finally {
    vi.useRealTimers()
  }
})

it("a rematch takes the previous match's keeper and gate down with it", async () => {
  vi.useFakeTimers()
  try {
    const { result } = await hostWithGuest()
    act(() => {
      result.current.startGame()
    })
    // Buffered behind match 1's gate. Match 1's cap is the only thing that would
    // ever play it — and after a rematch there is no match 1 to play it into.
    act(() => {
      result.current.gameLink?.submit({ type: 'DRAW' })
    })

    act(() => {
      result.current.startGame()
    })
    act(() => {
      vi.advanceTimersByTime(INTRO_CAP_MS + 1)
    })

    // Reassigning the refs is not teardown: without an explicit close the old
    // keeper's ticker runs for the life of the tab with setGameSync still in its
    // listener set, and the old gate's cap fires this buffered draw into a game
    // nobody is playing any more.
    const drawn = sentTo(GUEST).filter(
      (m) => m.type === 'SYNC' && m.payload.events.some((e) => e.type === 'drawn'),
    )
    expect(drawn).toHaveLength(0)
  } finally {
    vi.useRealTimers()
  }
})

it('a guest sends its whereabouts to the host', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await result.current.joinRoom('F96-NMT', 'Dimbo')
  })
  const hostId = result.current.state?.hostId ?? ''

  act(() => {
    result.current.setWhere('stats')
  })

  expect(sentTo(hostId)).toContainEqual({ type: 'WHEREABOUTS', payload: { where: 'stats' } })
})

it('a host applies its own whereabouts without sending anything to itself', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await result.current.createRoom('Dimbo', 6)
  })
  const selfId = result.current.state?.selfId ?? ''

  act(() => {
    result.current.setWhere('game')
  })

  expect(result.current.state?.peers[selfId].where).toBe('game')
  expect(sentAll()).not.toContainEqual(expect.objectContaining({ type: 'WHEREABOUTS' }))
})

it('gives each match its own id, so a second one is distinguishable from the first', async () => {
  // hostWithGuest() rather than a bare createRoom: startGame needs a seated
  // table, and this is the file's own helper for one (line ~278).
  const { result } = await hostWithGuest()
  const hostId = result.current.state?.hostId ?? ''

  act(() => {
    result.current.startGame()
  })
  const first = result.current.gameId

  act(() => {
    result.current.startGame()
  })
  const second = result.current.gameId

  expect(first).toBe(`${hostId}-1`)
  expect(second).toBe(`${hostId}-2`)
  // The whole point: a consumer keying a reset on gameId — the follower, the
  // move-history feed, the deal intro — sees a rematch as a different game.
  expect(first).not.toBe(second)
})

// --- what survives a reload ---

const SESSION_KEY = 'release:session'
const KEEPER_KEY = 'release:keeper'

function storedSession(): StoredSession | null {
  return JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null')
}

function storedKeeper(): StoredKeeper | null {
  return JSON.parse(localStorage.getItem(KEEPER_KEY) ?? 'null')
}

// How many times the keeper snapshot was actually serialized. The point of the
// throttle is that this is far smaller than the number of commits behind it.
function keeperWrites(spy: ReturnType<typeof vi.spyOn<Storage, 'setItem'>>): number {
  return spy.mock.calls.filter((call) => call[0] === KEEPER_KEY).length
}

it('persists the session when a room is created', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await result.current.createRoom('Ann', 4)
  })

  expect(storedSession()).toMatchObject({
    roomCode: result.current.roomCode,
    name: 'Ann',
    role: 'host',
    gameId: null,
  })
})

it('persists the session when a room is joined', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await result.current.joinRoom('F96-NMT', 'Bo')
  })

  // The room code, not this peer's own id: it is what a reload has to dial.
  expect(storedSession()).toMatchObject({
    roomCode: 'F96-NMT',
    name: 'Bo',
    role: 'guest',
    gameId: null,
  })
})

it('records the match in the stored session when the host starts one', async () => {
  const { result } = await hostWithGuest()

  act(() => {
    result.current.startGame()
  })

  // Without this a restore knows the room but not that a match is running, and
  // would put the host back in a lobby the table has already left.
  expect(storedSession()?.gameId).toBe(result.current.gameId)
})

it('records the match in the stored session when a guest is called to the board', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await result.current.joinRoom('F96-NMT', 'Bo')
  })
  const hostId = parseRoomCode('F96-NMT')

  act(() => {
    transports[0].onMessage?.({
      type: 'GAME_STARTING',
      payload: { gameId: 'g1', seats: SEATING },
      from: hostId,
    } as WireMessage)
  })

  expect(storedSession()?.gameId).toBe('g1')
})

it('forgets what it stored when the room is left', async () => {
  vi.useFakeTimers()
  try {
    const { result } = await hostWithGuest()
    act(() => {
      result.current.startGame()
    })
    act(() => {
      vi.advanceTimersByTime(KEEPER_SAVE_MS)
    })
    expect(localStorage.getItem(KEEPER_KEY)).not.toBeNull()

    act(() => {
      result.current.leaveSession()
    })

    // Both records describe a room this browser is no longer in; offering to
    // resume it is offering to rejoin a table the player walked away from.
    expect(localStorage.getItem(SESSION_KEY)).toBeNull()
    expect(localStorage.getItem(KEEPER_KEY)).toBeNull()
  } finally {
    vi.useRealTimers()
  }
})

it('forgets what it stored when the host kicks this peer', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await result.current.joinRoom('F96-NMT', 'Bo')
  })
  const hostId = parseRoomCode('F96-NMT')
  const selfId = result.current.state?.selfId ?? ''
  expect(localStorage.getItem(SESSION_KEY)).not.toBeNull()

  act(() => {
    transports[0].onMessage?.({
      type: 'PLAYER_KICKED',
      payload: { peerId: selfId },
      from: hostId,
    } as WireMessage)
  })

  expect(result.current.status).toBe('kicked')
  // A stored record here would walk the kicked player straight back in.
  expect(localStorage.getItem(SESSION_KEY)).toBeNull()
  expect(localStorage.getItem(KEEPER_KEY)).toBeNull()
})

it('coalesces a burst of keeper commits into one serialization', async () => {
  vi.useFakeTimers()
  const writes = vi.spyOn(Storage.prototype, 'setItem')
  try {
    const { result } = await hostWithGuest()
    act(() => {
      result.current.startGame()
    })
    // The write trails the commit; nothing has been serialized yet.
    expect(keeperWrites(writes)).toBe(0)

    // Open the gate so the table is live, then act twice inside the same
    // window — a burst of resolution events, in miniature.
    act(() => {
      result.current.introReady()
    })
    act(() => {
      transports[0].onMessage?.({
        type: 'INTRO_READY',
        payload: { gameId: result.current.gameId },
        from: GUEST,
      } as WireMessage)
    })
    act(() => {
      result.current.gameLink?.submit({ type: 'DRAW' })
    })
    act(() => {
      result.current.gameLink?.submit({ type: 'PUSH' })
    })
    expect(keeperWrites(writes)).toBe(0)

    act(() => {
      vi.advanceTimersByTime(KEEPER_SAVE_MS)
    })

    // The deal and both actions: one whole-GameState serialization, not three.
    expect(keeperWrites(writes)).toBe(1)
  } finally {
    writes.mockRestore()
    vi.useRealTimers()
  }
})

it('does not rewrite the snapshot for a keeper that is only ticking', async () => {
  vi.useFakeTimers()
  const writes = vi.spyOn(Storage.prototype, 'setItem')
  try {
    const { result } = await hostWithGuest()
    act(() => {
      result.current.startGame()
    })
    act(() => {
      result.current.introReady()
    })
    act(() => {
      transports[0].onMessage?.({
        type: 'INTRO_READY',
        payload: { gameId: result.current.gameId },
        from: GUEST,
      } as WireMessage)
    })
    // Let the deal, and the turn clock the first tick starts, settle.
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    const settled = keeperWrites(writes)
    expect(settled).toBeGreaterThan(0)

    act(() => {
      vi.advanceTimersByTime(2500)
    })

    // Ten more ticks, twenty more commits, and nothing at the table moved: the
    // session handed back is the very object already written.
    expect(keeperWrites(writes)).toBe(settled)
  } finally {
    writes.mockRestore()
    vi.useRealTimers()
  }
})

it('cannot let a pending snapshot land after the room is left', async () => {
  vi.useFakeTimers()
  try {
    const { result } = await hostWithGuest()
    act(() => {
      result.current.startGame()
    })
    // Teardown inside the throttle's window, which is where the race lives.
    act(() => {
      result.current.leaveSession()
    })

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    // A trailing write firing after clearKeeper() would put the abandoned match
    // straight back — and /start would offer to resume it.
    expect(localStorage.getItem(KEEPER_KEY)).toBeNull()
  } finally {
    vi.useRealTimers()
  }
})

it("stores the lobby seating beside the referee's, which carries neither name nor client", async () => {
  vi.useFakeTimers()
  try {
    const { result } = await hostWithGuest()
    act(() => {
      result.current.startGame()
    })
    act(() => {
      vi.advanceTimersByTime(KEEPER_SAVE_MS)
    })

    const stored = storedKeeper()
    expect(stored?.gameId).toBe(result.current.gameId)
    // What a restore needs to recognise a returning player and to label a seat
    // whose peer is gone. It cannot be reconstructed from the seats below.
    expect(stored?.lobbySeats).toEqual(result.current.seats)
    expect(stored?.seats).toEqual([
      { playerId: 'p1', peerId: 'peer0', absentSince: null },
      { playerId: 'p2', peerId: GUEST, absentSince: null },
    ])
  } finally {
    vi.useRealTimers()
  }
})

// --- coming back ---

// A host mid-match whose guest has dropped its channel. The returning peer
// arrives as a fresh join carrying the same clientId, which is the only thing
// that says otherwise.
async function hostWhoseGuestDropped(): Promise<ReturnType<typeof renderHook<UseLobby, unknown>>> {
  const rendered = await hostWithGuest()
  act(() => {
    rendered.result.current.startGame()
  })
  act(() => {
    transports[0].onDisconnect?.(GUEST)
  })
  return rendered
}

const RETURNED = 'zguest-again'

function rejoin(): void {
  act(() => {
    transports[0].onMessage?.({
      type: 'JOIN_REQUEST',
      payload: { name: 'Bo', clientId: GUEST_CLIENT },
      from: RETURNED,
    } as WireMessage)
  })
}

it('tells the keeper about a dropped peer, not just the roster', async () => {
  const { result } = await hostWhoseGuestDropped()
  expect(result.current.state?.peers[GUEST]).toBeUndefined()

  rejoin()

  // The roster and the keeper are separate books and both have to be told. Had
  // only the roster heard about the drop, the seat would still be bound to the
  // dead peer id — and `rebind` refuses a seat whose peerId is not null, so the
  // returning player would find their own seat occupied and never receive a
  // projection.
  expect(sentTo(RETURNED).some((m) => m.type === 'SYNC')).toBe(true)
})

it('recovers a returning seat even when its JOIN_REQUEST beats onDisconnect there', async () => {
  const { result } = await hostWithGuest()
  act(() => {
    result.current.startGame()
  })

  // Deliberately do NOT fire onDisconnect for GUEST first. WebRTC disconnect
  // detection can lag a fast manual reload, so the new connection's
  // JOIN_REQUEST can be handled — and the lobby book patched — before the old
  // channel is ever declared closed to the referee. Without the ordering fix
  // in the rejoin branch, the referee's seat still names the dead peer id,
  // `rebind` refuses the claim, and the seat is soft-locked with no
  // self-healing path: every later intent from RETURNED fails seat
  // resolution, and driveAbsent never engages because the referee still
  // believes the seat is connected.
  rejoin()

  // The lobby book alone would show this as recovered (see the previous
  // test's own risk); what proves the *referee's* book also moved is a SYNC
  // reaching the new peer id — `rebind` only emits one once it accepts the
  // claim.
  expect(sentTo(RETURNED).some((m) => m.type === 'SYNC')).toBe(true)
})

it('calls a returning player back to the board it left', async () => {
  const { result } = await hostWhoseGuestDropped()

  rejoin()

  // GAME_STARTING is what useFollowGameStart watches, so it is also what puts
  // the returner back on its board — no new navigation code.
  expect(sentTo(RETURNED)).toContainEqual(
    expect.objectContaining({
      type: 'GAME_STARTING',
      payload: { gameId: result.current.gameId, seats: result.current.seats },
    }),
  )
})

it('the catch-up projection lands behind the frame that routes the returner', async () => {
  await hostWhoseGuestDropped()

  rejoin()

  // DataChannels preserve order, so a SYNC sent first would reach a peer that
  // has not built its remote link yet and be dropped on the floor.
  const frames = sentTo(RETURNED).map((m) => m.type)
  expect(frames.indexOf('GAME_STARTING')).toBeGreaterThanOrEqual(0)
  expect(frames.indexOf('GAME_STARTING')).toBeLessThan(frames.indexOf('SYNC'))
})

it("repoints the host's own copy of the seating at the peer id that came back", async () => {
  const { result } = await hostWhoseGuestDropped()
  expect(result.current.seats.find((s) => s.clientId === GUEST_CLIENT)?.peerId).toBe(GUEST)

  rejoin()

  expect(result.current.seats.find((s) => s.clientId === GUEST_CLIENT)?.peerId).toBe(RETURNED)
  // And everyone else is told, or their winner lookup and results rows keep
  // naming a peer id that no longer exists.
  expect(transports[0].broadcast).toHaveBeenCalledWith({
    type: 'SEAT_REBOUND',
    payload: { playerId: 'p2', peerId: RETURNED },
  })
})

it('a guest repoints the seat a returning player came back on', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await result.current.joinRoom('F96-NMT', 'Bo')
  })
  const hostId = parseRoomCode('F96-NMT')
  act(() => {
    transports[0].onMessage?.({
      type: 'GAME_STARTING',
      payload: { gameId: 'g1', seats: SEATING },
      from: hostId,
    } as WireMessage)
  })

  act(() => {
    transports[0].onMessage?.({
      type: 'SEAT_REBOUND',
      payload: { playerId: 'p2', peerId: 'bbb-again' },
      from: hostId,
    } as WireMessage)
  })

  expect(result.current.seats).toEqual([
    { playerId: 'p1', peerId: 'aaa', name: 'Ann' },
    { playerId: 'p2', peerId: 'bbb-again', name: 'Bo' },
  ])
})

it('ignores a SEAT_REBOUND that did not come from the host', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await result.current.joinRoom('F96-NMT', 'Bo')
  })
  const hostId = parseRoomCode('F96-NMT')
  act(() => {
    transports[0].onMessage?.({
      type: 'GAME_STARTING',
      payload: { gameId: 'g1', seats: SEATING },
      from: hostId,
    } as WireMessage)
  })

  act(() => {
    transports[0].onMessage?.({
      type: 'SEAT_REBOUND',
      payload: { playerId: 'p2', peerId: 'stolen' },
      from: 'another-guest',
    } as WireMessage)
  })

  // Repointing a seat is the host's word alone — otherwise any peer could
  // address another seat's fan-out at itself.
  expect(result.current.seats).toEqual(SEATING)
})

it('a player who left the match rejoins the room as a newcomer, not a returner', async () => {
  const { result } = await hostWhoseGuestDropped()
  // The frozen seating outlives leaveGame on purpose — a results screen still
  // mounted reads it — so it is the match id, not the seating, that says
  // whether there is anything to come back to.
  act(() => {
    result.current.leaveGame()
  })

  rejoin()

  // No board to be sent to, and no seat to be marked mid-match with.
  expect(sentTo(RETURNED).some((m) => m.type === 'GAME_STARTING')).toBe(false)
  expect(result.current.state?.peers[RETURNED]).toMatchObject({ ready: false, where: 'lobby' })
  // And the seating of a match nobody is playing is left exactly as it was.
  expect(result.current.seats.find((s) => s.clientId === GUEST_CLIENT)?.peerId).toBe(GUEST)
  expect(transports[0].broadcast).not.toHaveBeenCalledWith(
    expect.objectContaining({ type: 'SEAT_REBOUND' }),
  )
})

it('walking back to the lobby drops the stored match but keeps the room', async () => {
  vi.useFakeTimers()
  try {
    const { result } = await hostWithGuest()
    act(() => {
      result.current.startGame()
    })
    act(() => {
      vi.advanceTimersByTime(KEEPER_SAVE_MS)
    })
    expect(localStorage.getItem(KEEPER_KEY)).not.toBeNull()

    act(() => {
      result.current.leaveGame()
    })

    // The match is over for this peer; the room is not. A reload has to be able
    // to put them back in the lobby, and must not put them back on the board.
    expect(localStorage.getItem(KEEPER_KEY)).toBeNull()
    expect(storedSession()).toMatchObject({
      roomCode: result.current.roomCode,
      name: 'Dimbo',
      role: 'host',
      gameId: null,
    })
  } finally {
    vi.useRealTimers()
  }
})

it('a snapshot still on its trailing edge cannot survive walking back to the lobby', async () => {
  vi.useFakeTimers()
  try {
    const { result } = await hostWithGuest()
    act(() => {
      result.current.startGame()
    })
    // Left inside the throttle's window: the deal's snapshot is queued and not
    // yet serialized, so only cancelling it keeps it from landing behind the
    // clear below.
    act(() => {
      result.current.leaveGame()
    })

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(localStorage.getItem(KEEPER_KEY)).toBeNull()
  } finally {
    vi.useRealTimers()
  }
})
