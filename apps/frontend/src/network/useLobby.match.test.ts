import { WINDOW_FIRST_MS } from '@release/engine/fake'
import { act } from '@testing-library/react'
import { vi } from 'vitest'
import { INTRO_CAP_MS } from './session/startGate'
import {
  GUEST,
  hostWithGuest,
  liveGuestReturningToStart,
  renderHook,
  SEATING,
  sentAll,
  sentTo,
  storedSession,
  transports,
} from './testing/lobbyHarness'
import type { WireMessage } from './types'
import { parseRoomCode, useLobby } from './useLobby'

// --- leaving the lobby for the board, together ---

it('host startGame broadcasts GAME_STARTING and records the game id', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await result.current.createRoom('Dimbo', 6)
  })
  expect(result.current.gameId).toBeNull()

  act(() => {
    result.current.startGame([])
  })

  const hostId = result.current.state?.hostId
  const expectedSeats = [{ playerId: 'p1', peerId: hostId, name: 'Dimbo' }]
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

it('fully retires a live guest match before Create from the browser-back start screen', async () => {
  const { result } = await liveGuestReturningToStart()
  const oldTransport = transports[0]
  const oldLink = result.current.gameLink
  const closeLink = vi.spyOn(oldLink as NonNullable<typeof oldLink>, 'close')

  await act(async () => {
    await result.current.createRoom('Host', 4)
  })

  expect(oldTransport.close).toHaveBeenCalledOnce()
  expect(closeLink).toHaveBeenCalledOnce()
  expect(result.current.gameId).toBeNull()
  expect(result.current.gameSync).toBeNull()
  expect(result.current.seats).toEqual([])
  expect(result.current.gameLink).toBeNull()
  expect(Object.values(result.current.state?.peers ?? {})).toEqual([
    expect.objectContaining({ id: transports[1].id, name: 'Host', role: 'host' }),
  ])
  expect(sessionStorage.getItem('release:keeper')).toBeNull()
  expect(sessionStorage.getItem('release:log')).toBeNull()
  expect(storedSession()).toMatchObject({ role: 'host', gameId: null })
})

it('fully retires a live guest match before Join from the browser-back start screen', async () => {
  const { result } = await liveGuestReturningToStart()
  const oldTransport = transports[0]
  const oldLink = result.current.gameLink
  const closeLink = vi.spyOn(oldLink as NonNullable<typeof oldLink>, 'close')

  await act(async () => {
    await result.current.joinRoom('XYZ-789', 'Bo')
  })

  expect(oldTransport.close).toHaveBeenCalledOnce()
  expect(closeLink).toHaveBeenCalledOnce()
  expect(result.current.gameId).toBeNull()
  expect(result.current.gameSync).toBeNull()
  expect(result.current.seats).toEqual([])
  expect(result.current.gameLink).toBeNull()
  expect(Object.values(result.current.state?.peers ?? {})).toEqual([
    expect.objectContaining({ id: transports[1].id, name: 'Bo', role: 'guest' }),
  ])
  expect(sessionStorage.getItem('release:keeper')).toBeNull()
  expect(sessionStorage.getItem('release:log')).toBeNull()
  expect(storedSession()).toMatchObject({ roomCode: 'XYZ-789', role: 'guest', gameId: null })
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
    result.current.startGame([])
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
    result.current.startGame([])
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
    result.current.startGame([])
  })
  act(() => {
    result.current.leaveGame()
  })

  act(() => {
    result.current.startGame([])
  })

  expect(result.current.gameId).toBe(`${result.current.state?.hostId}-2`)
  expect(result.current.seats).toHaveLength(2)
})

// The other half of the same regression: nulling the referee's peerId is only
// worth anything if `driveUnattended` actually then plays the seat. A solo
// host (no guest) plus one bot mirrors session/botPlay.test.ts's own
// `botGame(1)` fixture — same two-seat shape, same seed — so the same
// vetted script (a clean opening draw, five ticks to hand the turn back)
// applies here too, this time reached through `startGame` itself rather than
// a hand-built session.
it('drives a bot seat to completion once startGame has seated it', async () => {
  vi.useFakeTimers()
  const seed = vi.spyOn(crypto, 'getRandomValues').mockImplementation(((arr: Uint32Array) => {
    arr[0] = 17
    return arr
  }) as typeof crypto.getRandomValues)
  try {
    const rendered = renderHook(() => useLobby())
    await act(async () => {
      await rendered.result.current.createRoom('Ann', 6)
    })
    act(() => {
      rendered.result.current.setBots(1)
    })
    act(() => {
      rendered.result.current.startGame(['Бот 1'])
    })
    // Opens the gate: a solo host is the only seat it waits on.
    act(() => {
      rendered.result.current.introReady()
    })
    expect(rendered.result.current.gameSync?.view.turn.player).toBe('p1')

    // The host's own opening turn — a human seat, so nothing plays it but the
    // human. Once it ends, only the bot (p2) is left to move.
    act(() => {
      rendered.result.current.gameLink?.submit({ type: 'DRAW' })
    })
    act(() => {
      rendered.result.current.gameLink?.submit({ type: 'PUSH' })
    })
    expect(rendered.result.current.gameSync?.view.turn.player).toBe('p2')

    // One action per tick, exactly as botPlay.test.ts drives the same seed —
    // nothing here submits anything on the bot's behalf. The budget is a
    // duration rather than a tick count for the reason given there: a bot that
    // releases opens a contest window, and the window closes on elapsed time,
    // which only the keeper's own `tick` may spend.
    const budget = WINDOW_FIRST_MS + 5_000
    for (
      let i = 0;
      i < budget / 250 && rendered.result.current.gameSync?.view.turn.player === 'p2';
      i += 1
    ) {
      act(() => {
        vi.advanceTimersByTime(250)
      })
    }
    expect(rendered.result.current.gameSync?.view.turn.player).toBe('p1')
  } finally {
    seed.mockRestore()
    vi.useRealTimers()
  }
})

it('host builds the game behind a gate covering every seat', async () => {
  const { result } = await hostWithGuest()
  act(() => {
    result.current.startGame([])
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
    result.current.startGame([])
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
    result.current.startGame([])
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
      result.current.startGame([])
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
      result.current.startGame([])
    })
    // Buffered behind match 1's gate. Match 1's cap is the only thing that would
    // ever play it — and after a rematch there is no match 1 to play it into.
    act(() => {
      result.current.gameLink?.submit({ type: 'DRAW' })
    })

    act(() => {
      result.current.startGame([])
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

it('gives each match its own id, so a second one is distinguishable from the first', async () => {
  // hostWithGuest() rather than a bare createRoom: startGame needs a seated
  // table, and this is the file's own helper for one (line ~278).
  const { result } = await hostWithGuest()
  const hostId = result.current.state?.hostId ?? ''

  act(() => {
    result.current.startGame([])
  })
  const first = result.current.gameId

  act(() => {
    result.current.startGame([])
  })
  const second = result.current.gameId

  expect(first).toBe(`${hostId}-1`)
  expect(second).toBe(`${hostId}-2`)
  // The whole point: a consumer keying a reset on gameId — the follower, the
  // move-history feed, the deal intro — sees a rematch as a different game.
  expect(first).not.toBe(second)
})
