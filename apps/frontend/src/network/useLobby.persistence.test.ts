import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from '@release/engine/fake'
import { act } from '@testing-library/react'
import { vi } from 'vitest'
import type { PrivateSeat } from '~/entities/game/seats'
import type { StoredKeeper } from '~/shared/lib/persistence'
import { createSession } from './session/referee'
import {
  GUEST,
  GUEST_RESUME_TOKEN,
  HOST_RESUME_TOKEN,
  hostWithGuest,
  invalidKeeperSnapshots,
  KEEPER_KEY,
  keeperWrites,
  type MutableRefereeSeat,
  RETURNED,
  renderHook,
  SEATING,
  SESSION_KEY,
  sentTo,
  storedHostSession,
  storedKeeper,
  storedKeeperSnapshot,
  storedSession,
  transports,
} from './testing/lobbyHarness'
import type { Setup, WireMessage } from './types'
import { formatRoomCode, KEEPER_SAVE_MS, parseRoomCode, useLobby } from './useLobby'

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

it('keeps the latest host lobby configuration in the stored room session', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await result.current.createRoom('Ann', 6)
  })
  const setup: Setup = {
    handLimit: '8bit',
    releases: 'fast',
    releaseCond: 'easy',
    ai: 'no',
    gitBranch: 'strategic',
  }

  act(() => {
    result.current.setMaxPlayers(3)
    result.current.setSetup(setup)
    result.current.setBots(2)
  })

  expect(storedSession()?.lobbyConfig).toEqual({ maxPlayers: 3, setup, bots: 2 })
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
    result.current.startGame([])
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
      result.current.startGame([])
    })
    act(() => {
      vi.advanceTimersByTime(KEEPER_SAVE_MS)
    })
    expect(sessionStorage.getItem(KEEPER_KEY)).not.toBeNull()

    act(() => {
      result.current.leaveSession()
    })

    // Both records describe a room this browser is no longer in; offering to
    // resume it is offering to rejoin a table the player walked away from.
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
    expect(sessionStorage.getItem(KEEPER_KEY)).toBeNull()
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
  expect(sessionStorage.getItem(SESSION_KEY)).not.toBeNull()

  act(() => {
    transports[0].onMessage?.({
      type: 'PLAYER_KICKED',
      payload: { peerId: selfId },
      from: hostId,
    } as WireMessage)
  })

  expect(result.current.status).toBe('kicked')
  // A stored record here would walk the kicked player straight back in.
  expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
  expect(sessionStorage.getItem(KEEPER_KEY)).toBeNull()
})

it('coalesces a burst of keeper commits into one serialization', async () => {
  vi.useFakeTimers()
  const writes = vi.spyOn(Storage.prototype, 'setItem')
  try {
    const { result } = await hostWithGuest()
    act(() => {
      result.current.startGame([])
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
      result.current.startGame([])
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
      result.current.startGame([])
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
    expect(sessionStorage.getItem(KEEPER_KEY)).toBeNull()
  } finally {
    vi.useRealTimers()
  }
})

it("stores private seating beside the referee's public seats", async () => {
  vi.useFakeTimers()
  try {
    const { result } = await hostWithGuest()
    act(() => {
      result.current.setBots(2)
      result.current.startGame([])
    })
    act(() => {
      vi.advanceTimersByTime(KEEPER_SAVE_MS)
    })

    const stored = storedKeeper()
    expect(stored?.gameId).toBe(result.current.gameId)
    expect(stored?.privateSeats).toEqual([
      { seat: result.current.seats[0], resumeToken: expect.any(String) },
      { seat: result.current.seats[1], resumeToken: GUEST_RESUME_TOKEN },
    ])
    expect(stored?.lobbyConfig).toEqual({
      maxPlayers: result.current.state?.maxPlayers,
      setup: result.current.state?.setup,
      bots: 2,
    })
    expect(stored?.seats).toEqual([
      { playerId: 'p1', peerId: 'peer0', absentSince: null },
      { playerId: 'p2', peerId: GUEST, absentSince: null },
    ])
  } finally {
    vi.useRealTimers()
  }
})

it('walking back to the lobby drops the stored match but keeps the room', async () => {
  vi.useFakeTimers()
  try {
    const { result } = await hostWithGuest()
    act(() => {
      result.current.startGame([])
    })
    act(() => {
      vi.advanceTimersByTime(KEEPER_SAVE_MS)
    })
    expect(sessionStorage.getItem(KEEPER_KEY)).not.toBeNull()

    act(() => {
      result.current.leaveGame()
    })

    // The match is over for this peer; the room is not. A reload has to be able
    // to put them back in the lobby, and must not put them back on the board.
    expect(sessionStorage.getItem(KEEPER_KEY)).toBeNull()
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
      result.current.startGame([])
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

    expect(sessionStorage.getItem(KEEPER_KEY)).toBeNull()
  } finally {
    vi.useRealTimers()
  }
})

it.each(invalidKeeperSnapshots)('rejects %s before creating a transport', async (_case, mutate) => {
  storedHostSession('g1')
  const snapshot = storedKeeperSnapshot('peer0')
  mutate(snapshot)
  sessionStorage.setItem(KEEPER_KEY, JSON.stringify(snapshot))

  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await Promise.resolve()
  })

  expect(result.current.gameId).toBeNull()
  expect(transports).toHaveLength(0)
  expect(sessionStorage.getItem(KEEPER_KEY)).toBeNull()
  expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
})

it('restores a valid snapshot whose guest seat was already absent', async () => {
  storedHostSession('g1')
  const snapshot = storedKeeperSnapshot('peer0')
  const seats = snapshot.seats as MutableRefereeSeat[]
  snapshot.seats = [seats[0], { ...seats[1], peerId: null, absentSince: 500 }]
  sessionStorage.setItem(KEEPER_KEY, JSON.stringify(snapshot))

  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await Promise.resolve()
  })

  expect(result.current.status).toBe('in-lobby')
  expect(result.current.gameId).toBe('g1')
  expect(transports).toHaveLength(1)
})

it('hands the restored host its own table back without waiting for it to act', async () => {
  storedHostSession('g1')
  const snapshot = storedKeeperSnapshot('peer0')

  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await Promise.resolve()
  })

  // The whole point of restoring: the board has something to render the moment
  // it mounts. `useGame` derives its view from this, and the page falls through
  // to EMPTY_TABLE while it is null — the blank table this feature exists to
  // fix. A keeper the host has merely SUBSCRIBED to sends nothing on its own;
  // something has to ask it for the current state.
  expect(result.current.gameSync).not.toBeNull()

  // It is the hand the snapshot described, not a fresh deal.
  const engine = createFakeEngine()
  const expected = engine.project(snapshot.state as Parameters<typeof engine.project>[0], 'p1')
  expect(result.current.gameSync?.view.self.hand.map((c) => c.uid)).toEqual(
    expected.self.hand.map((c) => c.uid),
  )

  // And it carries no events, so the board's deal intro finds nothing to replay
  // and hands over at once. This is what separates `resync()` from the
  // `resync(setupEvents(...))` that opens a brand new match.
  expect(result.current.gameSync?.events).toEqual([])
})

it('restores the host to the match it was keeping, without replaying the deal', async () => {
  storedHostSession('g1')
  storedKeeperSnapshot('peer0')

  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await Promise.resolve()
  })

  expect(result.current.status).toBe('in-lobby')
  expect(result.current.isHost).toBe(true)
  expect(result.current.roomCode).toBe(formatRoomCode('peer0'))
  expect(result.current.gameId).toBe('g1')
  expect(result.current.seats).toEqual([
    { playerId: 'p1', peerId: 'peer0', name: 'Dimbo' },
    { playerId: 'p2', peerId: 'old-guest', name: 'Bo' },
  ])
  // A restore DOES send one projection — the host has to be given the table it
  // came back to. What it must not do is replay the deal, so the discriminator
  // is the SYNC's events, not its existence: `resync()` carries none, while the
  // `resync(setupEvents(...))` that opens a new match carries the whole opening.
  // Asserting the absence of any SYNC would pass just as well for a host that
  // was never handed its table at all.
  expect(result.current.gameSync).not.toBeNull()
  expect(result.current.gameSync?.events).toEqual([])
})

it('does not replace restored private seating in the trailing snapshot', async () => {
  vi.useFakeTimers()
  try {
    storedHostSession('g1')
    const original = storedKeeperSnapshot('peer0')

    const restored = renderHook(() => useLobby())
    await act(async () => {
      await Promise.resolve()
    })
    act(() => {
      vi.advanceTimersByTime(KEEPER_SAVE_MS)
    })

    expect(storedKeeper()?.privateSeats).toEqual(original.privateSeats)
    restored.unmount()
  } finally {
    vi.useRealTimers()
  }
})

it('preserves non-default lobby configuration when starting a rematch after restore', async () => {
  vi.useFakeTimers()
  try {
    const nonDefaultSetup: Setup = {
      handLimit: '8bit',
      releases: 'fast',
      releaseCond: 'easy',
      ai: 'no',
      gitBranch: 'strategic',
    }
    const restoredGameId = 'peer0-1'
    storedHostSession(restoredGameId)
    storedKeeperSnapshot('peer0', restoredGameId, {
      setup: nonDefaultSetup,
      lobbyConfig: { maxPlayers: 3, setup: nonDefaultSetup },
    })

    const { result } = renderHook(() => useLobby())
    await act(async () => {
      await Promise.resolve()
    })
    act(() => {
      result.current.leaveGame()
      result.current.startGame([])
    })

    const rematchGameId = result.current.gameId
    expect(rematchGameId).toBe('peer0-2')
    expect(result.current.state?.maxPlayers).toBe(3)
    expect(result.current.state?.setup).toEqual(nonDefaultSetup)

    act(() => {
      vi.advanceTimersByTime(KEEPER_SAVE_MS)
    })
    const rematchSnapshot = storedKeeper()
    expect(rematchSnapshot?.gameId).toBe(rematchGameId)
    expect((rematchSnapshot?.state as { setup?: unknown }).setup).toEqual(nonDefaultSetup)
  } finally {
    vi.useRealTimers()
  }
})

it('falls back to the restored game setup for an older snapshot without lobby config', async () => {
  const legacySetup: Setup = {
    handLimit: 'memory',
    releases: 'fast',
    releaseCond: 'easy',
    ai: 'less',
    gitBranch: 'strategic',
  }
  storedHostSession('g1')
  storedKeeperSnapshot('peer0', 'g1', { setup: legacySetup })

  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await Promise.resolve()
  })

  expect(result.current.state?.maxPlayers).toBe(6)
  expect(result.current.state?.setup).toEqual(legacySetup)
})

it('normalizes restored private seats before sending rejoin seating', async () => {
  storedHostSession('g1')
  const snapshot = storedKeeperSnapshot('peer0')
  const legacyCredentialKey = ['client', 'Id'].join('')
  snapshot.privateSeats = (snapshot.privateSeats as PrivateSeat[]).map((privateSeat) => ({
    ...privateSeat,
    seat: {
      ...privateSeat.seat,
      resumeToken: 'nested-private-token',
      [legacyCredentialKey]: 'nested-legacy-credential',
    },
  }))
  sessionStorage.setItem(KEEPER_KEY, JSON.stringify(snapshot))

  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await Promise.resolve()
  })
  act(() => {
    transports[0].onMessage?.({
      type: 'JOIN_REQUEST',
      payload: { name: 'Bo', resumeToken: GUEST_RESUME_TOKEN },
      from: RETURNED,
    } as WireMessage)
  })

  expect(sentTo(RETURNED)).toContainEqual({
    type: 'GAME_STARTING',
    payload: {
      gameId: result.current.gameId,
      seats: [
        { playerId: 'p1', peerId: 'peer0', name: 'Dimbo' },
        { playerId: 'p2', peerId: RETURNED, name: 'Bo' },
      ],
    },
  })
  expect(JSON.stringify(sentTo(RETURNED))).not.toContain('nested-private-token')
  expect(JSON.stringify(sentTo(RETURNED))).not.toContain('nested-legacy-credential')
})

// From the outside, a session that adopted no log plays identically to one
// that adopted the real thing — it syncs, it accepts intents, nothing errors.
// The only way the difference shows is a later commit: whatever `Session.log`
// held when it was made is what the next keeper write persists, so a restore
// that dropped the deal on the floor would surface here as a persisted log
// containing only the new action, with the match's own history gone.
it('carries the log the match already had forward, not just its position', async () => {
  vi.useFakeTimers()
  try {
    storedHostSession('g1')
    const snapshot = storedKeeperSnapshot('peer0')
    // Sanity: there is history here to lose in the first place.
    expect(snapshot.log.length).toBeGreaterThan(0)

    const { result } = renderHook(() => useLobby())
    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      result.current.gameLink?.submit({ type: 'DRAW' })
    })
    act(() => {
      vi.advanceTimersByTime(KEEPER_SAVE_MS)
    })

    const persisted = storedKeeper()
    expect(persisted?.log.length).toBeGreaterThan(snapshot.log.length)
    expect(persisted?.log.slice(0, snapshot.log.length)).toEqual(snapshot.log)
  } finally {
    vi.useRealTimers()
  }
})

// A restored session's gameId is `${hostId}-N}`, exactly what startGame itself
// would have minted — matchSeqRef has to be reseeded from that N, or a rematch
// in the same tab (no reload in between) mints the SAME id a second time. That
// id collision is silent: useGame keys its move-history reset on `gameId`
// changing, so a repeat would open the rematch's board still carrying the
// finished match's events.
it('reseeds the match counter on restore, so a rematch does not reuse the restored gameId', async () => {
  const restoredGameId = 'peer0-1'
  storedHostSession(restoredGameId)
  storedKeeperSnapshot('peer0', restoredGameId)

  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await Promise.resolve()
  })
  expect(result.current.gameId).toBe(restoredGameId)

  // The restored match is over; walk back to the lobby and start a rematch
  // without ever reloading the tab.
  act(() => {
    result.current.leaveGame()
  })
  act(() => {
    result.current.startGame([])
  })

  expect(result.current.gameId).not.toBeNull()
  expect(result.current.gameId).not.toBe(restoredGameId)
})

it('restores a host with a bot and continues its turn without human absence grace', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(1_000_000)
  const engine = createFakeEngine()
  const { session } = createSession({
    gameId: 'g1',
    keeperId: 'p1',
    engine,
    seed: 17,
    players: [
      { playerId: 'p1', peerId: 'peer0', name: 'Host' },
      { playerId: 'p2', peerId: null, name: 'Bot 1', bot: true },
    ],
    setup: {},
    deck: FAKE_DECK,
    events: FAKE_EVENTS,
  })
  const drawn = engine.reduce(session.state, { type: 'DRAW', player: 'p1', at: Date.now() })
  const pushed = engine.reduce(drawn.state, { type: 'PUSH', player: 'p1', at: Date.now() })
  expect(pushed.state.turn.player).toBe('p2')
  storedHostSession('g1')
  const botSeat = { playerId: 'p2', peerId: 'bot:1', name: 'Bot 1', bot: true }
  sessionStorage.setItem(
    KEEPER_KEY,
    JSON.stringify({
      gameId: 'g1',
      keeperId: 'p1',
      state: pushed.state,
      seats: session.seats,
      privateSeats: [
        { seat: { playerId: 'p1', peerId: 'peer0', name: 'Host' }, resumeToken: HOST_RESUME_TOKEN },
        { seat: botSeat, resumeToken: null },
      ],
      log: [...session.log, ...drawn.events, ...pushed.events],
      savedAt: Date.now(),
    } satisfies StoredKeeper),
  )
  const { result, unmount } = renderHook(() => useLobby())
  try {
    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current.gameId).toBe('g1')
    expect(result.current.seats).toContainEqual(botSeat)
    expect(result.current.gameSync?.view.turn.player).toBe('p2')
    expect(result.current.gameSync?.events).toEqual([])
    act(() => {
      vi.advanceTimersByTime(250)
    })
    expect(result.current.gameSync?.view.pending).toMatchObject({
      kind: 'discardForRelease',
      player: 'p2',
    })
    act(() => {
      vi.advanceTimersByTime(KEEPER_SAVE_MS)
    })
    const restored = JSON.parse(sessionStorage.getItem(KEEPER_KEY) ?? '{}') as StoredKeeper
    expect(restored.seats).toContainEqual({
      playerId: 'p2',
      peerId: null,
      absentSince: null,
      bot: true,
    })
  } finally {
    unmount()
    vi.useRealTimers()
  }
})

it('rebinds only the human seat when its resume token collides with a bot id', async () => {
  const { result, unmount } = renderHook(() => useLobby())
  try {
    await act(async () => {
      await result.current.createRoom('Host', 6)
    })
    act(() => {
      transports[0].onMessage?.({
        type: 'JOIN_REQUEST',
        from: GUEST,
        payload: { name: 'Human', resumeToken: 'bot:1' },
      } as WireMessage)
    })
    act(() => result.current.setBots(1))
    act(() => result.current.startGame(['Bot 1']))
    const botSeat = result.current.seats.find((seat) => seat.bot)
    expect(botSeat?.peerId).toBe('bot:1')
    act(() => {
      transports[0].onMessage?.({
        type: 'JOIN_REQUEST',
        from: RETURNED,
        payload: { name: 'Human', resumeToken: 'bot:1' },
      } as WireMessage)
    })
    expect(result.current.seats.find((seat) => seat.bot)).toEqual(botSeat)
    expect(result.current.seats.find((seat) => !seat.bot && seat.name === 'Human')?.peerId).toBe(
      RETURNED,
    )
    expect(sentTo(RETURNED).some((message) => message.type === 'SYNC')).toBe(true)
  } finally {
    unmount()
  }
})
