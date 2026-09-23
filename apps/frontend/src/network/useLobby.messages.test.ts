import { act } from '@testing-library/react'
import { vi } from 'vitest'
import type { PrivateSeat } from '~/entities/game/seats'
import { clearSession } from '~/shared/lib/persistence'
import type { Seat as RefereeSeat } from './session/referee'
import {
  forgeFromStalePeerId,
  GUEST,
  GUEST_RESUME_TOKEN,
  HOST_RESUME_TOKEN,
  hostWhoseGuestDropped,
  hostWithGuest,
  hostWithOpenGame,
  publicFrames,
  RETURNED,
  rejoin,
  renderHook,
  SEATING,
  sentTo,
  storedKeeper,
  transports,
} from './testing/lobbyHarness'
import type { Message, WireMessage } from './types'
import { KEEPER_SAVE_MS, parseRoomCode, useLobby } from './useLobby'

it('keeps resume tokens out of every public host frame', async () => {
  vi.useFakeTimers()
  try {
    sessionStorage.setItem('release:resumeToken', HOST_RESUME_TOKEN)
    const hosted = await hostWithGuest()
    act(() => {
      hosted.result.current.startGame([])
      transports[0].onDisconnect?.(GUEST)
      transports[0].onMessage?.({
        type: 'JOIN_REQUEST',
        payload: { name: 'Mallory', resumeToken: 'wrong-token' },
        from: 'mallory-peer',
        seq: 10,
      } as WireMessage)
      transports[0].onMessage?.({
        type: 'JOIN_REQUEST',
        payload: { name: 'Bo', resumeToken: GUEST_RESUME_TOKEN },
        from: RETURNED,
        seq: 11,
      } as WireMessage)
      transports[0].connectedIds = () => ['peer0', RETURNED, 'observer']
      transports[0].onMessage?.({
        type: 'TRANSFER_HOST',
        payload: { newHostId: 'observer' },
        from: RETURNED,
        seq: 12,
      } as WireMessage)
      vi.advanceTimersByTime(KEEPER_SAVE_MS)
    })
    const liveFrames = publicFrames(transports[0])

    hosted.unmount()
    transports.length = 0
    const restored = renderHook(() => useLobby())
    await act(async () => {
      await Promise.resolve()
    })
    act(() => {
      transports[0].onMessage?.({
        type: 'JOIN_REQUEST',
        payload: { name: 'Bo', resumeToken: GUEST_RESUME_TOKEN },
        from: 'restored-returner',
        seq: 13,
      } as WireMessage)
    })

    const frames = [...liveFrames, ...publicFrames(transports[0])]
    const serialized = JSON.stringify(frames)
    expect(serialized).not.toContain('resumeToken')
    expect(serialized).not.toContain(HOST_RESUME_TOKEN)
    expect(serialized).not.toContain(GUEST_RESUME_TOKEN)
    restored.unmount()
  } finally {
    vi.useRealTimers()
  }
})

it('seats the asked-for bots after the humans when the match starts', async () => {
  const { result } = await hostWithGuest()
  act(() => {
    result.current.setBots(2)
  })
  act(() => {
    result.current.startGame(['Бот 1', 'Бот 2'])
  })

  const seats = result.current.seats
  expect(seats.map((s) => s.playerId)).toEqual(['p1', 'p2', 'p3', 'p4'])
  expect(seats.filter((s) => s.bot).map((s) => s.name)).toEqual(['Бот 1', 'Бот 2'])
  // The humans are untouched by the presence of bots.
  expect(seats.filter((s) => !s.bot)).toHaveLength(2)
})

it('seats nobody extra when no bots were asked for', async () => {
  const { result } = await hostWithGuest()
  act(() => {
    result.current.startGame([])
  })
  expect(result.current.seats.some((s) => s.bot)).toBe(false)
})

// The regression this closes: a bot seat's wire address (`bot:N`, the roster
// row's key) used to be handed straight to the referee as its seat's peerId
// too. `driveUnattended` (session/referee.ts) only ever plays a seat whose
// peerId is null, so a bot seated from the lobby had a non-null peerId and
// was never selected — the table just waited on it forever. `storedKeeper()`
// is how this file already reaches the referee's own seats (see "stores the
// lobby seating beside the referee's" above): the wire seating (`result.
// current.seats`) is a different array on purpose and would not have caught
// this.
it("nulls a bot's peerId in the referee even though the wire seating keeps its bot:N address", async () => {
  vi.useFakeTimers()
  try {
    const { result } = await hostWithGuest()
    act(() => {
      result.current.setBots(1)
    })
    act(() => {
      result.current.startGame(['Бот 1'])
    })
    act(() => {
      vi.advanceTimersByTime(KEEPER_SAVE_MS)
    })

    const botSeat = result.current.seats.find((s) => s.bot)
    expect(botSeat?.peerId).toBe('bot:1')

    // `StoredKeeper.seats` is `unknown` (persistence.ts does not import
    // engine/referee types), so this is exactly the referee's own `Seat[]`
    // read back through the one seam that exposes it to a test.
    const refereeSeats = storedKeeper()?.seats as RefereeSeat[] | undefined
    const refereeSeat = refereeSeats?.find((s) => s.playerId === botSeat?.playerId)
    expect(refereeSeat?.peerId).toBeNull()
  } finally {
    vi.useRealTimers()
  }
})

it('puts the local resume token only in the guest-to-host join request', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await result.current.joinRoom('ABC-123', 'Bo')
  })
  act(() => {
    transports[0].onConnection?.('abc123')
  })

  const frames = publicFrames(transports[0])
  const messages = transports[0].send.mock.calls.map((call) => call[1] as Message)
  const joinRequest = messages.find((frame) => frame.type === 'JOIN_REQUEST')
  const resumeToken = joinRequest?.type === 'JOIN_REQUEST' ? joinRequest.payload.resumeToken : null
  expect(resumeToken).toBeTruthy()
  expect(frames.filter((frame) => JSON.stringify(frame).includes(resumeToken ?? ''))).toEqual([
    {
      type: 'JOIN_REQUEST',
      payload: { name: 'Bo', resumeToken },
    },
  ])
})

it('rotates credentials between rooms so a former host cannot claim the later seat', async () => {
  const guest = renderHook(() => useLobby())
  await act(async () => {
    await guest.result.current.joinRoom('AAA-111', 'Bo')
  })
  act(() => {
    transports[0].onConnection?.('aaa111')
  })
  const roomAJoin = transports[0].send.mock.calls
    .filter((call) => call[0] === 'aaa111')
    .map((call) => call[1] as Message)
    .find((message) => message.type === 'JOIN_REQUEST')
  const roomAToken = roomAJoin?.type === 'JOIN_REQUEST' ? roomAJoin.payload.resumeToken : ''

  await act(async () => {
    await guest.result.current.joinRoom('BBB-222', 'Bo')
  })
  act(() => {
    transports[1].onConnection?.('bbb222')
  })
  const roomBJoin = transports[1].send.mock.calls
    .filter((call) => call[0] === 'bbb222')
    .map((call) => call[1] as Message)
    .find((message) => message.type === 'JOIN_REQUEST')
  const roomBToken = roomBJoin?.type === 'JOIN_REQUEST' ? roomBJoin.payload.resumeToken : ''
  expect(roomAToken).toBeTruthy()
  expect(roomBToken).toBeTruthy()
  expect(roomBToken).not.toBe(roomAToken)

  guest.unmount()
  clearSession()
  const host = renderHook(() => useLobby())
  await act(async () => {
    await host.result.current.createRoom('Host', 6)
  })
  const hostTransport = transports[2]
  act(() => {
    hostTransport.onMessage?.({
      type: 'JOIN_REQUEST',
      payload: { name: 'Bo', resumeToken: roomBToken },
      from: GUEST,
      seq: 1,
    })
    host.result.current.startGame([])
    hostTransport.onDisconnect?.(GUEST)
    hostTransport.onMessage?.({
      type: 'JOIN_REQUEST',
      payload: { name: 'Mallory', resumeToken: roomAToken },
      from: 'mallory-peer',
      seq: 2,
    })
  })

  expect(host.result.current.seats.find(({ name }) => name === 'Bo')?.peerId).toBe(GUEST)
  expect(host.result.current.state?.peers['mallory-peer']?.role).toBe('guest')
  expect(hostTransport.authenticate).not.toHaveBeenCalledWith('mallory-peer')
})

it('rejects a duplicate credential during live lobby admission', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await result.current.createRoom('Host', 6)
  })
  act(() => {
    transports[0].onMessage?.({
      type: 'JOIN_REQUEST',
      payload: { name: 'Bo', resumeToken: 'duplicate-token' },
      from: 'guest-one',
      seq: 1,
    })
    transports[0].onMessage?.({
      type: 'JOIN_REQUEST',
      payload: { name: 'Mallory', resumeToken: 'duplicate-token' },
      from: 'guest-two',
      seq: 2,
    })
  })

  expect(result.current.state?.peers['guest-one']).toBeDefined()
  expect(result.current.state?.peers['guest-two']).toBeUndefined()
  expect(transports[0].authenticate).toHaveBeenCalledWith('guest-one')
  expect(transports[0].authenticate).not.toHaveBeenCalledWith('guest-two')
})

it.each([
  ['missing payload', { type: 'JOIN_REQUEST', from: 'missing-payload', seq: 1 }],
  ['null payload', { type: 'JOIN_REQUEST', payload: null, from: 'null-payload', seq: 2 }],
  [
    'missing name',
    {
      type: 'JOIN_REQUEST',
      payload: { resumeToken: 'valid-token' },
      from: 'missing-name',
      seq: 3,
    },
  ],
  [
    'non-string name',
    {
      type: 'JOIN_REQUEST',
      payload: { name: 42, resumeToken: 'valid-token' },
      from: 'number-name',
      seq: 4,
    },
  ],
  [
    'empty name',
    {
      type: 'JOIN_REQUEST',
      payload: { name: '', resumeToken: 'valid-token' },
      from: 'empty-name',
      seq: 5,
    },
  ],
  [
    'missing token',
    { type: 'JOIN_REQUEST', payload: { name: 'Bo' }, from: 'missing-token', seq: 6 },
  ],
  [
    'non-string token',
    {
      type: 'JOIN_REQUEST',
      payload: { name: 'Bo', resumeToken: 42 },
      from: 'number-token',
      seq: 7,
    },
  ],
] as const)('drops a malformed join request with %s', async (_case, frame) => {
  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await result.current.createRoom('Dimbo', 6)
  })

  expect(() => {
    act(() => {
      transports[0].onMessage?.(frame as unknown as WireMessage)
    })
  }).not.toThrow()
  expect(result.current.state?.peers[frame.from]).toBeUndefined()
})

it('drops an empty resume token without poisoning game start', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await result.current.createRoom('Dimbo', 6)
  })
  act(() => {
    transports[0].onMessage?.({
      type: 'JOIN_REQUEST',
      payload: { name: 'Bo', resumeToken: '' },
      from: GUEST,
    } as WireMessage)
  })

  expect(result.current.state?.peers[GUEST]).toBeUndefined()
  expect(() => {
    act(() => {
      result.current.startGame([])
    })
  }).not.toThrow()
  expect(result.current.seats).toEqual([
    { playerId: 'p1', peerId: result.current.state?.hostId, name: 'Dimbo' },
  ])
})

it('revokes a stale same-id seat before a wrong-token guest can receive private sync', async () => {
  const { result } = await hostWithOpenGame()
  transports[0].send.mockClear()

  forgeFromStalePeerId()
  expect(result.current.state?.peers[GUEST].role).toBe('guest')
  transports[0].send.mockClear()

  act(() => {
    result.current.gameLink?.submit({ type: 'DRAW' })
  })

  expect(sentTo(GUEST).filter((message) => message.type === 'SYNC')).toEqual([])
})

it('revokes a stale same-id seat when the replacement sends malformed credentials', async () => {
  const { result } = await hostWithOpenGame()
  transports[0].send.mockClear()

  act(() => {
    transports[0].onMessage?.({
      type: 'JOIN_REQUEST',
      payload: { name: 'Mallory', resumeToken: '' },
      from: GUEST,
    } as WireMessage)
  })
  transports[0].send.mockClear()
  act(() => {
    result.current.gameLink?.submit({ type: 'DRAW' })
  })

  expect(sentTo(GUEST).filter((message) => message.type === 'SYNC')).toEqual([])
})

it('revokes a stale same-id seat before a wrong-token guest can execute an intent', async () => {
  const { result } = await hostWithOpenGame()
  forgeFromStalePeerId()
  act(() => {
    result.current.gameLink?.submit({ type: 'DRAW' })
    result.current.gameLink?.submit({ type: 'PUSH' })
  })
  transports[0].send.mockClear()
  const beforeForgedIntent = result.current.gameSync

  act(() => {
    transports[0].onMessage?.({
      type: 'INTENT',
      payload: { intent: { type: 'DRAW' } },
      from: GUEST,
    } as WireMessage)
  })

  expect(result.current.gameSync).toBe(beforeForgedIntent)
  expect(sentTo(GUEST).filter((message) => message.type === 'SYNC')).toEqual([])
})

it('rejects intents before and after invalid authentication, then accepts one after valid rejoin', async () => {
  const { result } = await hostWithOpenGame()
  act(() => {
    result.current.gameLink?.submit({ type: 'DRAW' })
    result.current.gameLink?.submit({ type: 'PUSH' })
    transports[0].replaceConnection(GUEST)
  })
  transports[0].send.mockClear()
  const beforeAuthentication = result.current.gameSync

  act(() => {
    transports[0].receive({
      type: 'INTENT',
      payload: { intent: { type: 'DRAW' } },
      from: GUEST,
    } as WireMessage)
  })
  expect(result.current.gameSync).toBe(beforeAuthentication)
  expect(sentTo(GUEST).filter((message) => message.type === 'SYNC')).toEqual([])

  act(() => {
    transports[0].receive({
      type: 'JOIN_REQUEST',
      payload: { name: 'Mallory', resumeToken: 'wrong-token' },
      from: GUEST,
    } as WireMessage)
    transports[0].receive({
      type: 'INTENT',
      payload: { intent: { type: 'DRAW' } },
      from: GUEST,
    } as WireMessage)
  })
  expect(result.current.gameSync).toBe(beforeAuthentication)
  expect(sentTo(GUEST).filter((message) => message.type === 'SYNC')).toEqual([])

  act(() => {
    transports[0].receive({
      type: 'JOIN_REQUEST',
      payload: { name: 'Bo', resumeToken: GUEST_RESUME_TOKEN },
      from: GUEST,
    } as WireMessage)
  })
  transports[0].send.mockClear()
  const beforeAuthenticatedIntent = result.current.gameSync
  act(() => {
    transports[0].receive({
      type: 'INTENT',
      payload: { intent: { type: 'DRAW' } },
      from: GUEST,
    } as WireMessage)
  })

  expect(result.current.gameSync).not.toBe(beforeAuthenticatedIntent)
  expect(sentTo(GUEST).some((message) => message.type === 'SYNC')).toBe(true)
})

it('rejects intro readiness before and after invalid authentication, then accepts it after valid rejoin', async () => {
  const { result } = await hostWithGuest()
  act(() => {
    result.current.startGame([])
  })
  act(() => {
    result.current.introReady()
    transports[0].replaceConnection(GUEST)
  })
  act(() => {
    result.current.gameLink?.submit({ type: 'DRAW' })
  })
  transports[0].send.mockClear()

  act(() => {
    transports[0].receive({
      type: 'INTRO_READY',
      payload: { gameId: result.current.gameId },
      from: GUEST,
    } as WireMessage)
  })
  expect(sentTo(GUEST).filter((message) => message.type === 'SYNC')).toEqual([])

  act(() => {
    transports[0].receive({
      type: 'JOIN_REQUEST',
      payload: { name: 'Mallory', resumeToken: 'wrong-token' },
      from: GUEST,
    } as WireMessage)
    transports[0].receive({
      type: 'INTRO_READY',
      payload: { gameId: result.current.gameId },
      from: GUEST,
    } as WireMessage)
  })
  expect(sentTo(GUEST).filter((message) => message.type === 'SYNC')).toEqual([])

  act(() => {
    transports[0].receive({
      type: 'JOIN_REQUEST',
      payload: { name: 'Bo', resumeToken: GUEST_RESUME_TOKEN },
      from: GUEST,
    } as WireMessage)
  })
  const beforeReady = sentTo(GUEST).filter((message) => message.type === 'SYNC').length
  act(() => {
    transports[0].receive({
      type: 'INTRO_READY',
      payload: { gameId: result.current.gameId },
      from: GUEST,
    } as WireMessage)
  })

  expect(sentTo(GUEST).filter((message) => message.type === 'SYNC')).toHaveLength(beforeReady + 1)
})

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
    result.current.startGame([])
  })

  // Deliberately do NOT fire onDisconnect for GUEST first. WebRTC disconnect
  // detection can lag a fast manual reload, so the new connection's
  // JOIN_REQUEST can be handled — and the lobby book patched — before the old
  // channel is ever declared closed to the referee. Without the ordering fix
  // in the rejoin branch, the referee's seat still names the dead peer id,
  // `rebind` refuses the claim, and the seat is soft-locked with no
  // self-healing path: every later intent from RETURNED fails seat
  // resolution, and driveUnattended never engages because the referee still
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

it('reclaims a seat only with its exact private resume token', async () => {
  vi.useFakeTimers()
  try {
    const { result } = await hostWhoseGuestDropped()
    act(() => {
      vi.advanceTimersByTime(KEEPER_SAVE_MS)
    })
    const bo = (storedKeeper()?.privateSeats as PrivateSeat[]).find(
      ({ seat }) => seat.name === 'Bo',
    )

    act(() => {
      transports[0].onMessage?.({
        type: 'JOIN_REQUEST',
        payload: { name: 'Bo', resumeToken: bo?.resumeToken ?? '' },
        from: 'bo-returned',
        seq: 10,
      } as WireMessage)
    })
    expect(sentTo('bo-returned').some((message) => message.type === 'GAME_STARTING')).toBe(true)
    expect(transports[0].broadcast).toHaveBeenCalledWith({
      type: 'SEAT_REBOUND',
      payload: { playerId: bo?.seat.playerId, peerId: 'bo-returned' },
    })

    transports[0].send.mockClear()
    transports[0].broadcast.mockClear()
    act(() => {
      transports[0].onMessage?.({
        type: 'JOIN_REQUEST',
        payload: { name: 'Mallory', resumeToken: 'not-the-seat-token' },
        from: 'mallory-peer',
        seq: 11,
      } as WireMessage)
    })
    expect(sentTo('mallory-peer').some((message) => message.type === 'GAME_STARTING')).toBe(false)
    expect(transports[0].broadcast).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SEAT_REBOUND' }),
    )
    expect(result.current.state?.peers['mallory-peer'].role).toBe('guest')
  } finally {
    vi.useRealTimers()
  }
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
  expect(result.current.seats.find((s) => s.name === 'Bo')?.peerId).toBe(GUEST)

  rejoin()

  expect(result.current.seats.find((s) => s.name === 'Bo')?.peerId).toBe(RETURNED)
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
  expect(result.current.seats.find((s) => s.name === 'Bo')?.peerId).toBe(GUEST)
  expect(transports[0].broadcast).not.toHaveBeenCalledWith(
    expect.objectContaining({ type: 'SEAT_REBOUND' }),
  )
})

it('does not rebind or route a newcomer claiming a bot resume token into the match', async () => {
  const { result, unmount } = renderHook(() => useLobby())
  try {
    await act(async () => {
      await result.current.createRoom('Host', 6)
    })
    act(() => result.current.setBots(1))
    act(() => result.current.startGame(['Bot 1']))
    const seating = result.current.seats
    transports[0].send.mockClear()
    act(() => {
      transports[0].onMessage?.({
        type: 'JOIN_REQUEST',
        from: 'new-peer',
        payload: { name: 'Newcomer', resumeToken: 'bot:1' },
      } as WireMessage)
    })
    expect(result.current.state?.peers['new-peer'].role).toBe('guest')
    expect(result.current.seats).toEqual(seating)
    expect(
      transports[0].send.mock.calls.some(([, message]) => message.type === 'GAME_STARTING'),
    ).toBe(false)
  } finally {
    unmount()
  }
})
