import { act, renderHook } from '@testing-library/react'
import { beforeEach, vi } from 'vitest'
import { getClientId } from '~/shared/lib/persistence'
import { INTRO_CAP_MS } from './session/startGate'
import type { Message, WireMessage } from './types'
import { formatRoomCode, makeRoomCode, parseRoomCode, type UseLobby, useLobby } from './useLobby'

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
      payload: { name: 'Bo' },
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
