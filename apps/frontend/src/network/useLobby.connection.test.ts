import { act } from '@testing-library/react'
import { vi } from 'vitest'
import { type StoredSession, writeChat } from '~/shared/lib/persistence'
import { backoffMs, MAX_RECONNECT_ATTEMPTS } from './session/reconnect'
import {
  type FakeTransport,
  HOST_RESUME_TOKEN,
  KEEPER_KEY,
  renderHook,
  replacedGuestTransport,
  SEATING,
  SESSION_KEY,
  sentTo,
  storedGuestSession,
  storedHostSession,
  storedKeeperSnapshot,
  transports,
} from './testing/lobbyHarness'
import { createTransport } from './transport/peer'
import type { Setup, WireMessage } from './types'
import { formatRoomCode, parseRoomCode, useLobby } from './useLobby'

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

it('reconnects after a host disconnect instead of keeping a stale error', async () => {
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
  await act(async () => {
    transports[0].onDisconnect?.(hostId)
    await Promise.resolve()
  })
  expect(transports).toHaveLength(2)
  expect(result.current.status).toBe('connecting')
  expect(result.current.error).toBeNull()
  expect(result.current.errorKind).toBeNull()
})

it("reclaims the room code's exact peer id rather than minting a fresh one", async () => {
  storedHostSession('g1')
  storedKeeperSnapshot('peer0')

  renderHook(() => useLobby())
  await act(async () => {
    await Promise.resolve()
  })

  expect(createTransport).toHaveBeenCalledWith(
    expect.objectContaining({ peerId: parseRoomCode(formatRoomCode('peer0')) }),
  )
})

it('passes no gate: a submitted intent applies right away instead of waiting on INTRO_READY', async () => {
  storedHostSession('g1')
  storedKeeperSnapshot('peer0')

  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await Promise.resolve()
  })
  // The restore's own projection, before any intent — so "a sync exists" can no
  // longer stand in for "the intent was applied". Identity is the discriminator.
  const beforeIntent = result.current.gameSync
  expect(beforeIntent).not.toBeNull()

  act(() => {
    result.current.gameLink?.submit({ type: 'DRAW' })
  })

  // A gate still closed would buffer this behind INTRO_READY and emit nothing,
  // leaving the restore's own projection as the latest one.
  expect(result.current.gameSync).not.toBe(beforeIntent)
})

it('does nothing on mount when no session was ever stored', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await Promise.resolve()
  })
  expect(transports).toHaveLength(0)
  // The early return happens before setRestoring(true) is ever reached, so a
  // no-op restore must never flip the overlay flag on.
  expect(result.current.restoring).toBe(false)
})

it('hands a stored guest session to the guest reconnect path, not the host restore', async () => {
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      roomCode: 'ABC-123',
      name: 'Bo',
      role: 'guest',
      // Mid-match at the time of reload. The guest reconnect path (Task 7)
      // covers this the same way it covers a lobby reload — restoreHost stays
      // strictly host-only.
      gameId: 'g1',
      joinedAt: Date.now(),
    } satisfies StoredSession),
  )
  storedKeeperSnapshot('peer0')

  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await Promise.resolve()
  })
  // restoreHost never touched this: no keeper adopted, no host role taken.
  expect(result.current.isHost).toBe(false)
  // The guest reconnect path re-dials instead of sitting idle on /start.
  expect(transports).toHaveLength(1)
  expect(result.current.roomCode).toBe('ABC-123')
})

it('restores a stored host room and its chat when no match is running', async () => {
  const roomCode = formatRoomCode('peer0')
  const setup: Setup = {
    handLimit: 'memory',
    releases: 'fast',
    releaseCond: 'easy',
    ai: 'less',
    gitBranch: 'strategic',
  }
  storedHostSession(null, { maxPlayers: 3, setup, bots: 2 })
  sessionStorage.setItem(
    'release:resumeCredential',
    JSON.stringify({ roomCode, token: HOST_RESUME_TOKEN }),
  )
  writeChat({
    roomCode,
    entries: [
      {
        kind: 'message',
        id: 'chat-7',
        sequence: 7,
        createdAt: 700,
        author: { memberId: 'member-host', name: 'Dimbo', role: 'host' },
        text: 'before lobby reload',
      },
    ],
    nextSequence: 8,
    members: [{ clientId: HOST_RESUME_TOKEN, memberId: 'member-host' }],
    savedAt: Date.now(),
  })

  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await Promise.resolve()
  })

  expect(transports).toHaveLength(1)
  expect(result.current.status).toBe('in-lobby')
  expect(result.current.isHost).toBe(true)
  expect(result.current.roomCode).toBe(roomCode)
  expect(result.current.gameId).toBeNull()
  expect(result.current.state).toMatchObject({ maxPlayers: 3, setup, bots: 2 })
  expect(result.current.state?.peers.peer0).toMatchObject({
    memberId: 'member-host',
    name: 'Dimbo',
    role: 'host',
    where: 'lobby',
  })
  expect(result.current.chat.entries.map((entry) => entry.id)).toEqual(['chat-7'])

  act(() => expect(result.current.chat.send('after lobby reload')).toBe(true))
  expect(result.current.chat.entries.at(-1)).toMatchObject({
    id: 'chat-8',
    sequence: 8,
    author: { memberId: 'member-host' },
  })
  expect(sessionStorage.getItem(KEEPER_KEY)).toBeNull()
})

it('does not restore when the keeper snapshot belongs to a different match', async () => {
  storedHostSession('g-live')
  storedKeeperSnapshot('peer0') // snapshot itself carries gameId 'g1'

  renderHook(() => useLobby())
  await act(async () => {
    await Promise.resolve()
  })
  expect(transports).toHaveLength(0)
  expect(sessionStorage.getItem(KEEPER_KEY)).toBeNull()
  expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
})

it('clears a stored host match when its keeper snapshot is missing', async () => {
  storedHostSession('g1')

  renderHook(() => useLobby())
  await act(async () => {
    await Promise.resolve()
  })

  expect(transports).toHaveLength(0)
  expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
})

it('clears a stored host match when its keeper snapshot has expired', async () => {
  storedHostSession('g1')
  const snapshot = storedKeeperSnapshot('peer0')
  sessionStorage.setItem(KEEPER_KEY, JSON.stringify({ ...snapshot, savedAt: 0 }))

  renderHook(() => useLobby())
  await act(async () => {
    await Promise.resolve()
  })

  expect(transports).toHaveLength(0)
  expect(sessionStorage.getItem(KEEPER_KEY)).toBeNull()
  expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
})

it('fails closed and clears a legacy keeper without private seats', async () => {
  storedHostSession('g1')
  const snapshot = storedKeeperSnapshot('peer0')
  const { privateSeats: _privateSeats, ...legacy } = snapshot
  const legacyCredentialKey = ['client', 'Id'].join('')
  sessionStorage.setItem(
    KEEPER_KEY,
    JSON.stringify({
      ...legacy,
      lobbySeats: [
        {
          playerId: 'p1',
          peerId: 'peer0',
          [legacyCredentialKey]: 'client-host',
          name: 'Dimbo',
        },
        {
          playerId: 'p2',
          peerId: 'old-guest',
          [legacyCredentialKey]: 'client-guest',
          name: 'Bo',
        },
      ],
    }),
  )

  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await Promise.resolve()
  })

  expect(result.current.gameId).toBeNull()
  expect(result.current.gameSync).toBeNull()
  expect(transports).toHaveLength(0)
  expect(sessionStorage.getItem(KEEPER_KEY)).toBeNull()
  expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
})

it('retries past a stale unavailable-id left by a fast reload, and recovers', async () => {
  vi.useFakeTimers()
  try {
    storedHostSession('g1')
    storedKeeperSnapshot('peer0')
    // The broker still answers for the old registration on the first dial;
    // by the retry it has let go.
    vi.mocked(createTransport).mockImplementationOnce(() =>
      Promise.reject({ type: 'unavailable-id', message: 'still registered' }),
    )

    const { result } = renderHook(() => useLobby())
    await act(async () => {
      await Promise.resolve()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(backoffMs(1))
    })

    expect(result.current.status).toBe('in-lobby')
    expect(result.current.isHost).toBe(true)
    // The rejected attempt never produced a transport of its own.
    expect(transports).toHaveLength(1)
  } finally {
    vi.useRealTimers()
  }
})

it('surfaces the error once every reconnect attempt is spent', async () => {
  vi.useFakeTimers()
  try {
    storedHostSession('g1')
    storedKeeperSnapshot('peer0')
    for (let i = 0; i < MAX_RECONNECT_ATTEMPTS; i++) {
      vi.mocked(createTransport).mockImplementationOnce(() =>
        Promise.reject({ type: 'unavailable-id', message: 'still registered' }),
      )
    }

    const { result } = renderHook(() => useLobby())
    await act(async () => {
      await Promise.resolve()
    })
    let totalBackoff = 0
    for (let attempt = 1; attempt < MAX_RECONNECT_ATTEMPTS; attempt++) {
      totalBackoff += backoffMs(attempt)
    }
    await act(async () => {
      await vi.advanceTimersByTimeAsync(totalBackoff)
    })

    expect(result.current.status).toBe('error')
    // Never surfaced through a bare createTransport rejection path that would
    // leave 'connecting' spinning forever.
    expect(transports).toHaveLength(0)
  } finally {
    vi.useRealTimers()
  }
})

// `restoring` is the host's half of the reconnect overlay (Task 8 derives the
// board's `connection` prop from it): true only while restoreHost is actually
// working, false the rest of the time — including once it settles, on either
// path. A stuck `true` would leave the overlay up over a board that has
// already recovered or already given up.
it('restoring is true only while the restore is in flight, and clears once it recovers', async () => {
  vi.useFakeTimers()
  try {
    storedHostSession('g1')
    storedKeeperSnapshot('peer0')
    // A rejected first attempt buys a real window (the backoff wait) in which
    // to observe `restoring` mid-flight — a same-tick success would collapse
    // start and end into a single microtask and prove nothing.
    vi.mocked(createTransport).mockImplementationOnce(() =>
      Promise.reject({ type: 'unavailable-id', message: 'still registered' }),
    )

    const { result } = renderHook(() => useLobby())
    // Everything up to the first genuine await (createTransport) runs
    // synchronously inside the mount effect, and renderHook flushes that
    // through act() before returning — so `restoring` is already true here,
    // not merely "eventually".
    expect(result.current.restoring).toBe(true)

    await act(async () => {
      await Promise.resolve()
    })
    // The first attempt has failed and the retry is behind its backoff wait —
    // still in flight.
    expect(result.current.restoring).toBe(true)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(backoffMs(1))
    })

    expect(result.current.status).toBe('in-lobby')
    expect(result.current.restoring).toBe(false)
  } finally {
    vi.useRealTimers()
  }
})

it('restoring clears back to false once every reconnect attempt is spent', async () => {
  vi.useFakeTimers()
  try {
    storedHostSession('g1')
    storedKeeperSnapshot('peer0')
    for (let i = 0; i < MAX_RECONNECT_ATTEMPTS; i++) {
      vi.mocked(createTransport).mockImplementationOnce(() =>
        Promise.reject({ type: 'unavailable-id', message: 'still registered' }),
      )
    }

    const { result } = renderHook(() => useLobby())
    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current.restoring).toBe(true)

    let totalBackoff = 0
    for (let attempt = 1; attempt < MAX_RECONNECT_ATTEMPTS; attempt++) {
      totalBackoff += backoffMs(attempt)
    }
    await act(async () => {
      await vi.advanceTimersByTimeAsync(totalBackoff)
    })

    expect(result.current.status).toBe('error')
    // The finally clears it on the failure path too — a stuck `true` here
    // would leave the board's reconnect overlay up with nothing left trying.
    expect(result.current.restoring).toBe(false)
  } finally {
    vi.useRealTimers()
  }
})

// --- guest reconnect ---

// A stored guest session, the shape a reload would find. `gameId` distinguishes
// a lobby reload (null) from a match reload — the guest reconnect path covers
// both the same way, by re-dialing the same room.
// Reloading is not the only way a peer ends up off the table: when the HOST
// reloads, every guest's channel dies under it. Before this, that guest sat on
// a frozen board with `status: 'error'` and no dial running — it recovered only
// if the player thought to reload too. A drop mid-match starts the same
// reconnect run a reload does.
it('rebuilds the guest game link on reconnect without dropping the frozen sync', async () => {
  sessionStorage.clear()
  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await result.current.joinRoom('ABC-123', 'Bo')
  })
  const hostId = parseRoomCode('ABC-123')
  const first = transports[0]
  act(() => {
    first.onConnection?.(hostId)
  })
  // A live match, which is what separates this from a lobby disconnect.
  act(() => {
    first.onMessage?.({
      type: 'GAME_STARTING',
      payload: { gameId: 'g1', seats: SEATING },
      from: hostId,
      seq: 1,
    } as WireMessage)
  })
  act(() => {
    first.onMessage?.({
      type: 'SYNC',
      payload: { view: { over: null }, events: [] },
      from: hostId,
      seq: 2,
    } as unknown as WireMessage)
  })
  expect(result.current.gameId).toBe('g1')
  const frozen = result.current.gameSync
  expect(frozen).not.toBeNull()
  const firstLink = result.current.gameLink
  if (!firstLink) throw new Error('expected guest game link')
  const close = vi.spyOn(firstLink, 'close')

  await act(async () => {
    first.onDisconnect?.(hostId)
    await Promise.resolve()
  })
  const linkDuringReconnect = result.current.gameLink

  const second = transports[1]
  await act(async () => {
    second.onConnection?.(hostId)
    await Promise.resolve()
  })
  act(() => {
    second.onMessage?.({
      type: 'GAME_STARTING',
      payload: { gameId: 'g1', seats: SEATING },
      from: hostId,
      seq: 3,
    } as WireMessage)
  })
  act(() => {
    result.current.gameLink?.submit({ type: 'DRAW' })
  })

  expect(second.send).toHaveBeenCalledWith(hostId, {
    type: 'INTENT',
    payload: { intent: { type: 'DRAW' } },
  })
  expect(first.send).not.toHaveBeenLastCalledWith(
    hostId,
    expect.objectContaining({ type: 'INTENT' }),
  )
  expect(close).toHaveBeenCalledOnce()
  expect(linkDuringReconnect).toBeNull()
  expect(result.current.gameLink).not.toBe(firstLink)
  expect(result.current.gameSync).toBe(frozen)
})

it('re-dials the stored room when the reload happened in the lobby', async () => {
  storedGuestSession(null)

  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await Promise.resolve()
  })
  // It dialed the stored room rather than sitting idle on /start.
  expect(transports.length).toBe(1)
  expect(result.current.roomCode).toBe('ABC-123')

  // JOIN_REQUEST only goes out once the DataChannel to the host actually
  // opens — the same onConnection callback joinRoom always used, driven the
  // same way every other guest test in this file drives it.
  const hostId = parseRoomCode('ABC-123')
  await act(async () => {
    transports[0].onConnection?.(hostId)
    await Promise.resolve()
  })

  // And it announced itself with the private token that gets its match seat back.
  const join = sentTo(hostId).find((m) => m.type === 'JOIN_REQUEST')
  expect(join?.type === 'JOIN_REQUEST' && join.payload.resumeToken).toBeTruthy()
  // A successful reconnect must not leave the overlay up over a working table.
  expect(result.current.reconnect.status).toBe('idle')
})

it('re-dials when an established lobby connection loses the restoring host', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await result.current.joinRoom('ABC-123', 'Bo')
  })
  const hostId = parseRoomCode('ABC-123')
  const first = transports[0]
  act(() => {
    first.onConnection?.(hostId)
  })
  expect(result.current.gameId).toBeNull()

  await act(async () => {
    first.onDisconnect?.(hostId)
    await Promise.resolve()
  })

  expect(transports).toHaveLength(2)
  expect(result.current.reconnect.status).toBe('trying')
  expect(result.current.status).toBe('connecting')
})

it('does not run the guest reconnect when the host restore already succeeded', async () => {
  storedHostSession('g1')
  storedKeeperSnapshot('peer0')

  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await Promise.resolve()
  })

  expect(result.current.isHost).toBe(true)
  // Exactly the one dial the host restore made — restoreHost succeeding must
  // not also fire off a guest-shaped reconnect on top of it.
  expect(transports).toHaveLength(1)
  expect(result.current.reconnect.status).toBe('idle')
})

it('retries the guest dial with backoff, and gives up once every attempt is spent', async () => {
  vi.useFakeTimers()
  try {
    storedGuestSession(null)

    const { result } = renderHook(() => useLobby())
    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current.reconnect.status).toBe('trying')
    expect(result.current.reconnect.attempt).toBe(1)
    expect(result.current.reconnect.maxAttempts).toBe(MAX_RECONNECT_ATTEMPTS)

    for (let attempt = 1; attempt <= MAX_RECONNECT_ATTEMPTS; attempt++) {
      // The host never answers — PeerJS reports it unreachable.
      await act(async () => {
        transports[attempt - 1].onError?.({ type: 'peer-unavailable', message: 'nope' })
        await Promise.resolve()
      })
      if (attempt < MAX_RECONNECT_ATTEMPTS) {
        expect(result.current.reconnect.status).toBe('trying')
        await act(async () => {
          await vi.advanceTimersByTimeAsync(backoffMs(attempt))
        })
      }
    }

    expect(result.current.reconnect.status).toBe('failed')
    expect(result.current.reconnect.attempt).toBe(MAX_RECONNECT_ATTEMPTS)
    // One dial per attempt, no more.
    expect(transports).toHaveLength(MAX_RECONNECT_ATTEMPTS)
    expect(result.current.reconnect.events.at(-1)).toMatchObject({
      kind: 'failed',
      attempt: MAX_RECONNECT_ATTEMPTS,
    })
  } finally {
    vi.useRealTimers()
  }
})

it('a teardown mid-backoff stops the guest reconnect loop for good', async () => {
  vi.useFakeTimers()
  try {
    storedGuestSession(null)

    const { result } = renderHook(() => useLobby())
    await act(async () => {
      await Promise.resolve()
    })
    // Fail the first attempt, landing the loop inside its backoff wait.
    await act(async () => {
      transports[0].onError?.({ type: 'peer-unavailable', message: 'nope' })
      await Promise.resolve()
    })
    expect(result.current.reconnect.status).toBe('trying')

    act(() => {
      result.current.leaveSession()
    })
    // The player walked away — the overlay this feeds must not keep showing a
    // reconnect that is no longer happening.
    expect(result.current.reconnect.status).toBe('idle')

    // Advance well past every remaining backoff: no further dial may happen,
    // and a late-resolving joinRoom must not resurrect the abandoned session.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })

    expect(transports).toHaveLength(1)
    expect(result.current.reconnect.status).toBe('idle')
    expect(result.current.status).toBe('idle')
  } finally {
    vi.useRealTimers()
  }
})

it('retry starts a fresh run from attempt 1', async () => {
  vi.useFakeTimers()
  try {
    storedGuestSession(null)

    const { result } = renderHook(() => useLobby())
    await act(async () => {
      await Promise.resolve()
    })
    for (let attempt = 1; attempt <= MAX_RECONNECT_ATTEMPTS; attempt++) {
      await act(async () => {
        transports[attempt - 1].onError?.({ type: 'peer-unavailable', message: 'nope' })
        await Promise.resolve()
      })
      if (attempt < MAX_RECONNECT_ATTEMPTS) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(backoffMs(attempt))
        })
      }
    }
    expect(result.current.reconnect.status).toBe('failed')
    const spentTransports = transports.length

    act(() => {
      result.current.reconnect.retry()
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(result.current.reconnect.status).toBe('trying')
    expect(result.current.reconnect.attempt).toBe(1)
    // A fresh dial, not a resumption of the spent run.
    expect(transports.length).toBe(spentTransports + 1)
  } finally {
    vi.useRealTimers()
  }
})

it('ignores a channel-open callback owned by a superseded transport', async () => {
  const { result, oldTransport, liveTransport, hostId } = await replacedGuestTransport()
  const sendsBefore = liveTransport.send.mock.calls.length

  act(() => {
    oldTransport.onConnection?.(hostId)
  })

  expect(liveTransport.send).toHaveBeenCalledTimes(sendsBefore)
  expect(result.current.status).toBe('in-lobby')
  expect(result.current.error).toBeNull()
})

it('ignores an error callback owned by a superseded transport', async () => {
  const { result, oldTransport } = await replacedGuestTransport()

  act(() => {
    oldTransport.onError?.({ type: 'network', message: 'stale failure' })
  })

  expect(result.current.status).toBe('in-lobby')
  expect(result.current.error).toBeNull()
})

it('ignores a message callback owned by a superseded transport', async () => {
  const { result, oldTransport, hostId } = await replacedGuestTransport()

  act(() => {
    oldTransport.onMessage?.({
      type: 'PEER_JOINED',
      payload: { id: 'stale-peer', name: 'Stale', role: 'player', ready: false, where: 'lobby' },
      from: hostId,
      seq: 1,
    } as WireMessage)
  })

  expect(result.current.state?.peers['stale-peer']).toBeUndefined()
})

it('ignores a disconnect callback owned by a superseded transport', async () => {
  const { result, oldTransport, liveTransport, hostId } = await replacedGuestTransport({
    startGame: true,
  })
  const liveLink = result.current.gameLink
  const closeLink = vi.spyOn(liveLink as NonNullable<typeof liveLink>, 'close')

  await act(async () => {
    oldTransport.onDisconnect?.(hostId)
    await Promise.resolve()
  })

  expect(transports).toHaveLength(2)
  expect(result.current.reconnect.status).toBe('idle')
  expect(result.current.status).toBe('in-lobby')
  expect(result.current.gameLink).toBe(liveLink)
  expect(closeLink).not.toHaveBeenCalled()
  expect(liveTransport.close).not.toHaveBeenCalled()
})

it('does not resurrect a host create that resolves after teardown', async () => {
  const lateTransport: FakeTransport = {
    id: 'late-host',
    close: vi.fn(),
    connectTo: vi.fn(),
    broadcast: vi.fn(),
    send: vi.fn(),
    relay: vi.fn(),
    connectedIds: () => [],
    authenticate: vi.fn(),
    receive: vi.fn(),
    replaceConnection: vi.fn(),
  }
  let resolveTransport: ((transport: FakeTransport) => void) | undefined
  vi.mocked(createTransport).mockReturnValueOnce(
    new Promise((resolve) => {
      resolveTransport = resolve
    }) as never,
  )

  const { result } = renderHook(() => useLobby())
  let createResult: Promise<string> | undefined
  act(() => {
    createResult = result.current.createRoom('Host', 4)
  })
  act(() => {
    result.current.leaveSession()
    resolveTransport?.(lateTransport)
  })

  await expect(createResult).rejects.toThrow('create cancelled')
  expect(lateTransport.close).toHaveBeenCalledOnce()
  expect(result.current.status).toBe('idle')
  expect(result.current.roomCode).toBeNull()
  expect(result.current.state).toBeNull()
})

it('ignores callbacks from a superseded created-host transport', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await result.current.createRoom('First Host', 4)
  })
  const oldTransport = transports[0]
  await act(async () => {
    await result.current.createRoom('Current Host', 4)
  })
  const liveTransport = transports[1]
  act(() => {
    liveTransport.onMessage?.({
      type: 'JOIN_REQUEST',
      payload: { name: 'Current Guest', resumeToken: 'current-token' },
      from: 'shared-peer',
      seq: 1,
    } as WireMessage)
  })

  act(() => {
    oldTransport.onMessage?.({
      type: 'JOIN_REQUEST',
      payload: { name: 'Stale Guest', resumeToken: 'stale-token' },
      from: 'stale-peer',
      seq: 2,
    } as WireMessage)
    oldTransport.onError?.({ type: 'network', message: 'stale failure' })
    oldTransport.onDisconnect?.('shared-peer')
  })

  expect(result.current.status).toBe('in-lobby')
  expect(result.current.error).toBeNull()
  expect(result.current.state?.peers['stale-peer']).toBeUndefined()
  expect(result.current.state?.peers['shared-peer']?.name).toBe('Current Guest')
  expect(liveTransport.close).not.toHaveBeenCalled()
})

it('ignores callbacks from a superseded restored-host transport', async () => {
  storedHostSession('g1')
  storedKeeperSnapshot('peer0')
  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await Promise.resolve()
  })
  const restoredTransport = transports[0]

  await act(async () => {
    await result.current.createRoom('Current Host', 4)
  })
  const liveTransport = transports[1]
  act(() => {
    liveTransport.onMessage?.({
      type: 'JOIN_REQUEST',
      payload: { name: 'Current Guest', resumeToken: 'current-token' },
      from: 'shared-peer',
      seq: 1,
    } as WireMessage)
  })

  act(() => {
    restoredTransport.onMessage?.({
      type: 'JOIN_REQUEST',
      payload: { name: 'Stale Guest', resumeToken: 'stale-token' },
      from: 'stale-peer',
      seq: 2,
    } as WireMessage)
    restoredTransport.onError?.({ type: 'network', message: 'stale failure' })
    restoredTransport.onDisconnect?.('shared-peer')
  })

  expect(result.current.status).toBe('in-lobby')
  expect(result.current.error).toBeNull()
  expect(result.current.state?.peers['stale-peer']).toBeUndefined()
  expect(result.current.state?.peers['shared-peer']?.name).toBe('Current Guest')
  expect(liveTransport.close).not.toHaveBeenCalled()
})

it('retry() after a successful reconnect leaves the live transport alone', async () => {
  storedGuestSession(null)

  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await Promise.resolve()
  })
  const hostId = parseRoomCode('ABC-123')
  await act(async () => {
    transports[0].onConnection?.(hostId)
    await Promise.resolve()
  })
  expect(result.current.reconnect.status).toBe('idle')

  // A stray double-invoke, or anything else reaching retry() outside the
  // 'trying'/'failed' gate — the button the next task wires this to must
  // never be able to disconnect a player who is already back at the table.
  act(() => {
    result.current.reconnect.retry()
  })
  await act(async () => {
    await Promise.resolve()
  })

  // No re-entry: no new dial, and — the actual danger — the live transport
  // was never closed. joinRoom's very first act is transportRef.current?.close(),
  // so a re-entered run would have torn down the working connection.
  expect(transports).toHaveLength(1)
  expect(transports[0].close).not.toHaveBeenCalled()
  expect(result.current.reconnect.status).toBe('idle')
})

it("a superseded run's belated channel-open does not settle the run that replaced it", async () => {
  storedGuestSession(null)

  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await Promise.resolve()
  })
  // Attempt 1 has dialed and is genuinely in flight — connectTo was called,
  // but nothing has reported an outcome yet (not sleeping in backoff).
  expect(transports).toHaveLength(1)
  expect(result.current.reconnect.status).toBe('trying')

  // retry() supersedes it mid-dial, the same window a stray click or the
  // overlay's own retry button could land in.
  act(() => {
    result.current.reconnect.retry()
  })
  await act(async () => {
    await Promise.resolve()
  })
  expect(transports).toHaveLength(2)
  expect(result.current.reconnect.attempt).toBe(1)

  const hostId = parseRoomCode('ABC-123')
  // The abandoned dial's own channel opens moments after being superseded —
  // exactly the "had opened its channel when superseded" case: closing it
  // from the new joinRoom() call fires a real close later, but here it
  // reports success instead, on the outcome PeerJS actually delivered to it.
  await act(async () => {
    transports[0].onConnection?.(hostId)
    await Promise.resolve()
  })

  // Without the epoch guard, transports[0]'s onConnection unconditionally
  // resolves whatever is currently in reconnectSettleRef — which by now is
  // run 2's own pending settle — reporting a connection nobody's actual live
  // dial (transports[1]) ever confirmed.
  expect(result.current.reconnect.status).toBe('trying')

  // The genuinely new dial's own outcome is still honored normally.
  await act(async () => {
    transports[1].onConnection?.(hostId)
    await Promise.resolve()
  })
  expect(result.current.reconnect.status).toBe('idle')
})

it("an earlier attempt's belated channel-open does not settle the next attempt in the same run", async () => {
  // The within-run counterpart to the retry() test above: reconnectEpochRef
  // is bumped once per RUN, not once per attempt, so an epoch-only guard
  // cannot tell attempt 1's belated event apart from attempt 2's own — even
  // with no retry() anywhere in this test. This is the loop's own ordinary
  // multi-attempt operation on a flaky connection, which is the ordinary
  // condition the whole feature exists to survive, not a player clicking
  // anything at an unlucky moment.
  vi.useFakeTimers()
  try {
    storedGuestSession(null)

    const { result } = renderHook(() => useLobby())
    await act(async () => {
      await Promise.resolve()
    })
    expect(transports).toHaveLength(1)
    expect(result.current.reconnect.attempt).toBe(1)

    const hostId = parseRoomCode('ABC-123')
    // Attempt 1 fails normally (the host is unreachable), settling its own
    // promise through the ordinary onError path.
    await act(async () => {
      transports[0].onError?.({ type: 'peer-unavailable', message: 'nope' })
      await Promise.resolve()
    })
    expect(result.current.reconnect.status).toBe('trying')

    // The backoff elapses and attempt 2 dials — a fresh transport, still the
    // same run.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(backoffMs(1))
    })
    expect(transports).toHaveLength(2)
    expect(result.current.reconnect.attempt).toBe(2)

    // Attempt 1's own, now-abandoned transport reports a belated
    // channel-open — its own dial closure, fired directly the same way
    // every guest test in this file drives onConnection, arriving after
    // attempt 2 has already begun.
    await act(async () => {
      transports[0].onConnection?.(hostId)
      await Promise.resolve()
    })
    // Without a per-attempt (not merely per-run) token, this resolves
    // whatever is currently in reconnectSettleRef — attempt 2's own pending
    // settle — reporting a connection attempt 2's actual dial
    // (transports[1]) never confirmed, and falsely clearing the overlay
    // over a table that was never actually reached: status would read
    // 'idle' while transports[1] sits open but never joined.
    expect(result.current.reconnect.status).toBe('trying')
    expect(result.current.reconnect.attempt).toBe(2)

    // Attempt 2's own outcome is still honored normally.
    await act(async () => {
      transports[1].onConnection?.(hostId)
      await Promise.resolve()
    })
    expect(result.current.reconnect.status).toBe('idle')
  } finally {
    vi.useRealTimers()
  }
})

it("retry() firing while an earlier attempt's dial is still inside createTransport does not leave the new run stuck", async () => {
  // The fix-round-3 scenario, precisely: retry() lands before the earlier
  // attempt has even reached `await settled` — it is still awaiting
  // createTransport itself. That earlier attempt's belated conclusion
  // (however it resolves) must not prevent the run that superseded it from
  // ever reaching a terminal state.
  storedGuestSession(null)

  // Attempt 1's own createTransport call is held open by hand rather than
  // resolving on the next microtask like the default mock — this is what
  // makes it "genuinely in flight, inside createTransport" at the moment
  // retry() fires, rather than already at `await settled`.
  let rejectStuckDial: ((err: unknown) => void) | undefined
  const stuckDial = new Promise<never>((_resolve, reject) => {
    rejectStuckDial = reject
  })
  vi.mocked(createTransport).mockImplementationOnce(() => stuckDial)

  const { result } = renderHook(() => useLobby())
  await act(async () => {
    await Promise.resolve()
  })
  // Attempt 1 is stuck before ever producing a transport of its own.
  expect(transports).toHaveLength(0)
  expect(result.current.reconnect.status).toBe('trying')
  expect(result.current.reconnect.attempt).toBe(1)

  // retry() supersedes it. The new run's own attempt 1 uses the default
  // mock (only one override was queued above), so it dials normally.
  act(() => {
    result.current.reconnect.retry()
  })
  await act(async () => {
    await Promise.resolve()
  })
  expect(transports).toHaveLength(1)
  expect(result.current.reconnect.attempt).toBe(1)

  // The abandoned attempt's createTransport call now concludes — belatedly,
  // after the new run has already installed its own pending attempt. This
  // is what used to null out the new run's settle handle out from under it.
  await act(async () => {
    rejectStuckDial?.(new Error('stale dial'))
    await Promise.resolve()
  })

  const hostId = parseRoomCode('ABC-123')
  // The new run's own dial succeeds normally.
  await act(async () => {
    transports[0].onConnection?.(hostId)
    await Promise.resolve()
  })

  // Without a per-attempt settle handle, the abandoned attempt's belated
  // conclusion silences the new run's own handle before its onConnection
  // ever fires, so `await settled` inside the new run's own loop iteration
  // never resolves or rejects — reconnect.status hangs at 'trying' forever,
  // even though the connection the player is actually looking at (this
  // transport) succeeded.
  expect(result.current.reconnect.status).toBe('idle')
})
