import { createFakeEngine, FAKE_DECK, FAKE_EVENTS, WINDOW_FIRST_MS } from '@release/engine/fake'
import { act, renderHook as renderTestingHook } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import type { PrivateSeat } from '~/entities/game/seats'
import type { ChatSystemEvent, UserChatEntry } from '~/shared/chat/types'
import {
  clearChat,
  clearKeeper,
  clearSession,
  readChat,
  type StoredKeeper,
  type StoredLobbyConfig,
  type StoredSession,
  writeChat,
} from '~/shared/lib/persistence'
import { backoffMs, MAX_RECONNECT_ATTEMPTS } from './session/reconnect'
import { createSession, type Seat as RefereeSeat } from './session/referee'
import { INTRO_CAP_MS } from './session/startGate'
import { createTransport } from './transport/peer'
import type { Message, Setup, WireMessage } from './types'
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
  relay: ReturnType<typeof vi.fn>
  connectedIds: () => string[]
  authenticate: ReturnType<typeof vi.fn>
  receive: (message: WireMessage) => void
  replaceConnection: (peerId: string) => void
  onError?: (err: { type?: string; message: string }) => void
  onConnection?: (peerId: string) => void
  onDisconnect?: (peerId: string) => void
  onMessage?: (msg: WireMessage) => void
}

// vi.mock is hoisted above the imports, so the array it closes over has to be
// hoisted too — otherwise the factory hits a temporal-dead-zone error.
const { transports } = vi.hoisted(() => ({ transports: [] as FakeTransport[] }))

const renderedLobbies: ReturnType<typeof renderTestingHook<UseLobby, unknown>>[] = []

function renderHook(callback: () => UseLobby) {
  const rendered = renderTestingHook(callback)
  renderedLobbies.push(rendered)
  return rendered
}

vi.mock('./transport/peer', () => ({
  createTransport: vi.fn(
    (args: {
      onError?: (err: { type?: string; message: string }) => void
      onConnection?: (peerId: string) => void
      onDisconnect?: (peerId: string) => void
      onMessage?: (msg: WireMessage) => void
    }) => {
      const authenticated = new Set<string>()
      const fake = {
        id: `peer${transports.length}`,
        close: vi.fn(),
        connectTo: vi.fn(),
        send: vi.fn(),
        broadcast: vi.fn(),
        relay: vi.fn(),
        connectedIds: () => [],
        authenticate: vi.fn((peerId: string) => authenticated.add(peerId)),
        receive: (message: WireMessage) => {
          if (message.type === 'JOIN_REQUEST' || authenticated.has(message.from)) {
            args.onMessage?.(message)
          }
        },
        replaceConnection: (peerId: string) => {
          authenticated.delete(peerId)
          args.onDisconnect?.(peerId)
          args.onConnection?.(peerId)
        },
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
  // createTransport is one shared vi.fn() for the whole file, so its call
  // history accumulates across every test unless cleared here — without this,
  // a solo test asserting `.not.toHaveBeenCalled()` would see every networked
  // test that ran before it and fail no matter what it does itself.
  vi.mocked(createTransport).mockClear()
  // The hook writes `release:session` / `release:keeper` now, so a record left
  // by the previous test would be read as this one's — and now that the mount
  // effect restores from one automatically (host restore, below), a leftover
  // record does not just sit unread, it drives a real reconnect during a later
  // test's mount. `sessionStorage.clear()` alone is not enough: persistence.ts
  // falls back to an in-memory cache when storage throws (Safari private
  // mode), and that cache is a module-level singleton that outlives any one
  // test — clearSession/clearKeeper are what actually empty it, on top of the
  // browser storage.
  sessionStorage.clear()
  clearSession()
  clearKeeper()
  clearChat()
})

function userChatEntry(input: Pick<UserChatEntry, 'id' | 'sequence' | 'text'>): UserChatEntry {
  return {
    kind: 'message',
    createdAt: input.sequence * 1_000,
    author: { memberId: 'member-b', name: 'Bo', role: 'player' },
    ...input,
  }
}

function systemEvents(lobby: UseLobby): ChatSystemEvent[] {
  return lobby.chat.entries.flatMap((entry) => (entry.kind === 'system' ? [entry.event] : []))
}

afterEach(() => {
  act(() => {
    for (const rendered of renderedLobbies) rendered.result.current.leaveSession()
  })
  renderedLobbies.length = 0
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

it('a guest sends text intent only and waits for the canonical entry', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => result.current.joinRoom('F96-NMT', 'Bo'))
  const hostId = parseRoomCode('F96-NMT')
  act(() => transports[0].onConnection?.(hostId))

  act(() => expect(result.current.chat.send('  hello\nroom  ')).toBe(true))

  expect(transports[0].send).toHaveBeenCalledWith(hostId, {
    type: 'CHAT_SEND',
    payload: { text: 'hello\nroom' },
  })
  expect(result.current.chat.entries).toEqual([])
})

it('the host canonicalizes a guest send from the admitted connection', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => result.current.createRoom('Ann', 4))
  act(() =>
    transports[0].onMessage?.({
      type: 'JOIN_REQUEST',
      payload: { name: 'Bo', resumeToken: 'client-b' },
      from: 'peer-b',
      seq: 1,
    }),
  )
  const admitted = result.current.state?.peers['peer-b']
  expect(admitted?.memberId).toBeTruthy()
  transports[0].broadcast.mockClear()

  act(() =>
    transports[0].onMessage?.({
      type: 'CHAT_SEND',
      payload: { text: 'hello' },
      from: 'peer-b',
      seq: 2,
    }),
  )

  expect(result.current.chat.entries.at(-1)).toMatchObject({
    kind: 'message',
    author: { memberId: admitted?.memberId, name: 'Bo', role: 'player' },
    text: 'hello',
    sequence: expect.any(Number),
  })
  expect(result.current.chat.notificationEntryIds).toEqual([result.current.chat.entries.at(-1)?.id])
  expect(transports[0].broadcast).toHaveBeenCalledWith({
    type: 'CHAT_ENTRY',
    payload: { entry: result.current.chat.entries.at(-1) },
  })
})

it('the host ignores malformed text intent from an admitted connection', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => result.current.createRoom('Ann', 4))
  act(() =>
    transports[0].onMessage?.({
      type: 'JOIN_REQUEST',
      payload: { name: 'Bo', resumeToken: 'client-b' },
      from: 'peer-b',
      seq: 1,
    }),
  )
  const beforeMalformedIntent = result.current.chat.entries

  expect(() =>
    act(() =>
      transports[0].onMessage?.({
        type: 'CHAT_SEND',
        payload: { text: 42 },
        from: 'peer-b',
        seq: 2,
      } as unknown as WireMessage),
    ),
  ).not.toThrow()
  expect(result.current.chat.entries).toEqual(beforeMalformedIntent)
})

it('history plus an overlapping live entry stays ordered and unique', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => result.current.joinRoom('F96-NMT', 'Bo'))
  const hostId = parseRoomCode('F96-NMT')
  const one = userChatEntry({ id: 'chat-1', sequence: 1, text: 'one' })
  const two = userChatEntry({ id: 'chat-2', sequence: 2, text: 'two' })
  const three = userChatEntry({ id: 'chat-3', sequence: 3, text: 'three' })

  act(() =>
    transports[0].onMessage?.({
      type: 'CHAT_HISTORY',
      payload: { entries: [one, two], selfMemberId: 'member-b' },
      from: hostId,
      seq: 1,
    }),
  )
  expect(result.current.chat.notificationEntryIds).toEqual([])
  act(() =>
    transports[0].onMessage?.({
      type: 'CHAT_ENTRY',
      payload: { entry: two },
      from: hostId,
      seq: 2,
    }),
  )
  expect(result.current.chat.notificationEntryIds).toEqual([])
  act(() =>
    transports[0].onMessage?.({
      type: 'CHAT_ENTRY',
      payload: { entry: three },
      from: hostId,
      seq: 3,
    }),
  )

  expect(result.current.chat.entries.map((entry) => entry.id)).toEqual([
    'chat-1',
    'chat-2',
    'chat-3',
  ])
  expect(result.current.chat.notificationEntryIds).toEqual(['chat-3'])
  expect(result.current.chat.selfMemberId).toBe('member-b')
})

it('ignores history and canonical entries not authored by the host', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => result.current.joinRoom('F96-NMT', 'Bo'))
  const forged = userChatEntry({ id: 'chat-1', sequence: 1, text: 'forged' })

  act(() =>
    transports[0].onMessage?.({
      type: 'CHAT_HISTORY',
      payload: { entries: [forged], selfMemberId: 'attacker' },
      from: 'peer-attacker',
      seq: 1,
    }),
  )
  act(() =>
    transports[0].onMessage?.({
      type: 'CHAT_ENTRY',
      payload: { entry: forged },
      from: 'peer-attacker',
      seq: 2,
    }),
  )

  expect(result.current.chat.entries).toEqual([])
  expect(result.current.chat.selfMemberId).toBeNull()
})

it('ignores a malformed canonical entry even when it names the host', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => result.current.joinRoom('F96-NMT', 'Bo'))
  const hostId = parseRoomCode('F96-NMT')

  act(() =>
    transports[0].onMessage?.({
      type: 'CHAT_ENTRY',
      payload: { entry: { id: 'bad', text: 42 } },
      from: hostId,
      seq: 1,
    } as unknown as WireMessage),
  )

  expect(result.current.chat.entries).toEqual([])
})

it('ignores malformed history identity even when it names the host', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => result.current.joinRoom('F96-NMT', 'Bo'))
  const hostId = parseRoomCode('F96-NMT')

  act(() =>
    transports[0].onMessage?.({
      type: 'CHAT_HISTORY',
      payload: { entries: [], selfMemberId: 7 },
      from: hostId,
      seq: 1,
    } as unknown as WireMessage),
  )

  expect(result.current.chat.entries).toEqual([])
  expect(result.current.chat.selfMemberId).toBeNull()
})

it('sends a late joiner the complete history including its one join event', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => result.current.createRoom('Ann', 6))
  act(() =>
    transports[0].onMessage?.({
      type: 'JOIN_REQUEST',
      payload: { name: 'Bo', resumeToken: 'client-b' },
      from: 'peer-b',
      seq: 1,
    }),
  )
  act(() =>
    transports[0].onMessage?.({
      type: 'CHAT_SEND',
      payload: { text: 'before Cy' },
      from: 'peer-b',
      seq: 2,
    }),
  )
  act(() =>
    transports[0].onMessage?.({
      type: 'JOIN_REQUEST',
      payload: { name: 'Cy', resumeToken: 'client-c' },
      from: 'peer-c',
      seq: 3,
    }),
  )

  const history = transports[0].send.mock.calls
    .filter(([to]) => to === 'peer-c')
    .map(([, message]) => message as Message)
    .find((message) => message.type === 'CHAT_HISTORY')
  expect(
    history?.type === 'CHAT_HISTORY' && history.payload.entries.map((entry) => entry.id),
  ).toEqual(result.current.chat.entries.map((entry) => entry.id))
  const peerCMemberId = result.current.state?.peers['peer-c'].memberId
  expect(result.current.chat.entries.at(-1)).toMatchObject({
    kind: 'system',
    event: { kind: 'memberJoined', memberId: peerCMemberId, name: 'Cy' },
  })
  expect(
    systemEvents(result.current).filter(
      (event) =>
        'memberId' in event && event.memberId === peerCMemberId && event.kind === 'memberJoined',
    ),
  ).toHaveLength(1)
})

it('reuses memberId and emits reconnected when join beats the stale disconnect', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => result.current.createRoom('Ann', 6))
  act(() =>
    transports[0].onMessage?.({
      type: 'JOIN_REQUEST',
      payload: { name: 'Bo', resumeToken: 'client-b' },
      from: 'peer-old',
      seq: 1,
    }),
  )
  const memberId = result.current.state?.peers['peer-old'].memberId

  act(() =>
    transports[0].onMessage?.({
      type: 'JOIN_REQUEST',
      payload: { name: 'Bo', resumeToken: 'client-b' },
      from: 'peer-new',
      seq: 2,
    }),
  )
  expect(result.current.state?.peers['peer-new'].memberId).toBe(memberId)
  act(() => transports[0].onDisconnect?.('peer-old'))

  expect(result.current.state?.peers['peer-old']).toBeUndefined()
  expect(result.current.state?.peers['peer-new'].memberId).toBe(memberId)
  expect(
    systemEvents(result.current)
      .filter((event) => 'memberId' in event && event.memberId === memberId)
      .map((event) => event.kind),
  ).toEqual(['memberJoined', 'memberReconnected'])
})

it('emits kicked without a later duplicate left event', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => result.current.createRoom('Ann', 6))
  act(() =>
    transports[0].onMessage?.({
      type: 'JOIN_REQUEST',
      payload: { name: 'Bo', resumeToken: 'client-b' },
      from: 'peer-b',
      seq: 1,
    }),
  )
  const memberId = result.current.state?.peers['peer-b'].memberId

  act(() => result.current.kick('peer-b'))
  act(() => transports[0].onDisconnect?.('peer-b'))

  expect(
    systemEvents(result.current)
      .filter((event) => 'memberId' in event && event.memberId === memberId)
      .map((event) => event.kind),
  ).toEqual(['memberJoined', 'memberKicked'])
})

it('emits left for an ordinary disconnect and retains earlier authored messages', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => result.current.createRoom('Ann', 6))
  act(() =>
    transports[0].onMessage?.({
      type: 'JOIN_REQUEST',
      payload: { name: 'Bo', resumeToken: 'client-b' },
      from: 'peer-b',
      seq: 1,
    }),
  )
  const memberId = result.current.state?.peers['peer-b'].memberId
  act(() =>
    transports[0].onMessage?.({
      type: 'CHAT_SEND',
      payload: { text: 'still here' },
      from: 'peer-b',
      seq: 2,
    }),
  )
  act(() => transports[0].onDisconnect?.('peer-b'))

  expect(result.current.chat.entries).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: 'message',
        author: expect.objectContaining({ memberId }),
        text: 'still here',
      }),
      expect.objectContaining({
        kind: 'system',
        event: { kind: 'memberLeft', memberId, name: 'Bo' },
      }),
    ]),
  )
  expect(result.current.chat.entries.at(-1)).toMatchObject({
    kind: 'system',
    event: { kind: 'memberLeft', memberId },
  })
})

it('emits one roleChanged entry for each capacity demotion', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => result.current.createRoom('Ann', 6))
  for (const [index, name] of ['Bo', 'Cy', 'Di'].entries()) {
    act(() =>
      transports[0].onMessage?.({
        type: 'JOIN_REQUEST',
        payload: { name, resumeToken: `client-${name}` },
        from: `peer-${index + 1}`,
        seq: index + 1,
      }),
    )
  }
  const before = result.current.state
  act(() => result.current.setMaxPlayers(2))

  const demotedMemberIds = Object.values(result.current.state?.peers ?? {})
    .filter((peer) => peer.role === 'guest' && before?.peers[peer.id]?.role === 'player')
    .map((peer) => peer.memberId)
    .sort()
  const changed = systemEvents(result.current).filter(
    (event): event is Extract<ChatSystemEvent, { kind: 'roleChanged' }> =>
      event.kind === 'roleChanged',
  )
  expect(changed.map((event) => event.memberId).sort()).toEqual(demotedMemberIds)
  expect(changed.every((event) => event.role === 'spectator')).toBe(true)
})

it('emits modeChanged only for setup keys whose value changed', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => result.current.createRoom('Ann', 6))
  const setup = { ...result.current.state?.setup, gitBranch: 'strategic' }

  act(() => result.current.setSetup(setup))
  act(() => result.current.setSetup(setup))

  expect(systemEvents(result.current).filter((event) => event.kind === 'modeChanged')).toEqual([
    { kind: 'modeChanged', setting: 'gitBranch', value: 'strategic' },
  ])
})

it('restores full host history, member mapping, and the next sequence', async () => {
  const roomCode = formatRoomCode('peer0')
  storedHostSession('g1')
  storedKeeperSnapshot('peer0')
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
        text: 'before reload',
      },
    ],
    nextSequence: 8,
    members: [{ clientId: HOST_RESUME_TOKEN, memberId: 'member-host' }],
    savedAt: Date.now(),
  })

  const { result } = renderHook(() => useLobby())
  await act(async () => Promise.resolve())
  expect(result.current.chat.entries.map((entry) => entry.id)).toEqual(['chat-7'])
  expect(result.current.chat.notificationEntryIds).toEqual([])
  expect(result.current.chat.selfMemberId).toBe('member-host')
  expect(result.current.state?.peers.peer0.memberId).toBe('member-host')

  act(() => expect(result.current.chat.send('after reload')).toBe(true))
  expect(result.current.chat.entries.at(-1)).toMatchObject({
    id: 'chat-8',
    sequence: 8,
    author: { memberId: 'member-host' },
    text: 'after reload',
  })
  expect(result.current.chat.notificationEntryIds).toEqual(['chat-8'])
})

it('leaveGame retains chat while leaveSession clears it', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => result.current.createRoom('Ann', 4))
  const roomCode = result.current.roomCode ?? ''
  act(() => expect(result.current.chat.send('hello')).toBe(true))

  act(() => result.current.leaveGame())
  expect(readChat(roomCode)).not.toBeNull()

  act(() => result.current.leaveSession())
  expect(readChat(roomCode)).toBeNull()
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

async function liveGuestReturningToStart() {
  const rendered = renderHook(() => useLobby())
  await act(async () => {
    await rendered.result.current.joinRoom('ABC-123', 'Bo')
  })
  const hostId = parseRoomCode('ABC-123')
  act(() => {
    transports[0].onConnection?.(hostId)
    transports[0].onMessage?.({
      type: 'GAME_STARTING',
      payload: { gameId: 'abc123-1', seats: SEATING },
      from: hostId,
      seq: 1,
    } as WireMessage)
    transports[0].onMessage?.({
      type: 'SYNC',
      payload: { view: { over: null }, events: [] },
      from: hostId,
      seq: 2,
    } as unknown as WireMessage)
  })
  sessionStorage.setItem('release:keeper', JSON.stringify({ stale: true }))
  sessionStorage.setItem('release:log', JSON.stringify({ stale: true }))
  return rendered
}

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

function publicFrames(transport: FakeTransport): unknown[] {
  return [
    ...transport.send.mock.calls.map((call) => call[1]),
    ...transport.broadcast.mock.calls.map((call) => call[0]),
    ...transport.relay.mock.calls.map((call) => call[1]),
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
const HOST_RESUME_TOKEN = 'resume-host'
const GUEST_RESUME_TOKEN = 'resume-guest'

// A seating as a guest receives it: peers this guest's own roster has never
// heard of, so nothing derived locally could produce it.
const SEATING = [
  { playerId: 'p1', peerId: 'aaa', name: 'Ann' },
  { playerId: 'p2', peerId: 'bbb', name: 'Bo' },
]

async function hostWithGuest(): Promise<ReturnType<typeof renderHook>> {
  const rendered = renderHook(() => useLobby())
  await act(async () => {
    await rendered.result.current.createRoom('Dimbo', 6)
  })
  act(() => {
    transports[0].onMessage?.({
      type: 'JOIN_REQUEST',
      payload: { name: 'Bo', resumeToken: GUEST_RESUME_TOKEN },
      from: GUEST,
    } as WireMessage)
  })
  return rendered
}

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

// --- what survives a reload ---

const SESSION_KEY = 'release:session'
const KEEPER_KEY = 'release:keeper'

function storedSession(): StoredSession | null {
  return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null')
}

function storedKeeper(): StoredKeeper | null {
  return JSON.parse(sessionStorage.getItem(KEEPER_KEY) ?? 'null')
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
    })
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
// arrives as a fresh join carrying the same resume token, which is the only thing
// that says otherwise.
async function hostWhoseGuestDropped(): Promise<ReturnType<typeof renderHook>> {
  const rendered = await hostWithGuest()
  act(() => {
    rendered.result.current.startGame([])
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
      payload: { name: 'Bo', resumeToken: GUEST_RESUME_TOKEN },
      from: RETURNED,
    } as WireMessage)
  })
}

async function hostWithOpenGame(): Promise<ReturnType<typeof renderHook>> {
  const rendered = await hostWithGuest()
  const random = vi.spyOn(crypto, 'getRandomValues').mockImplementation((values) => {
    if (values instanceof Uint32Array) values[0] = 1
    return values
  })
  act(() => {
    rendered.result.current.startGame([])
  })
  random.mockRestore()
  act(() => {
    rendered.result.current.introReady()
    transports[0].onMessage?.({
      type: 'INTRO_READY',
      payload: { gameId: rendered.result.current.gameId },
      from: GUEST,
    } as WireMessage)
  })
  return rendered
}

function forgeFromStalePeerId(): void {
  act(() => {
    transports[0].onMessage?.({
      type: 'JOIN_REQUEST',
      payload: { name: 'Mallory', resumeToken: 'not-the-seat-token' },
      from: GUEST,
    } as WireMessage)
  })
}

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

// --- host restore ---

function storedHostSession(gameId: string | null): void {
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      roomCode: formatRoomCode('peer0'),
      name: 'Dimbo',
      role: 'host',
      gameId,
      joinedAt: Date.now(),
    } satisfies StoredSession),
  )
}

// A snapshot built through the real referee, the same way `startGame` builds
// one — so the state a restore adopts is one the engine could actually have
// produced, not a hand-rolled shape that only happens to typecheck.
// `hostPeerId` is p1's peerId in the stored referee seats; the restore only
// keeps a seat whose peerId matches the freshly reclaimed transport id, so a
// test proving that has to control what that id will be.
function storedKeeperSnapshot(
  hostPeerId: string,
  gameId = 'g1',
  options: { setup?: Setup; lobbyConfig?: StoredLobbyConfig } = {},
): StoredKeeper {
  const engine = createFakeEngine()
  const { session } = createSession({
    gameId,
    keeperId: 'p1',
    engine,
    seed: 1,
    players: [
      { playerId: 'p1', peerId: hostPeerId, name: 'Dimbo' },
      { playerId: 'p2', peerId: 'old-guest', name: 'Bo' },
    ],
    setup: options.setup ?? {},
    deck: FAKE_DECK,
    events: FAKE_EVENTS,
  })
  const snapshot: StoredKeeper = {
    gameId,
    keeperId: 'p1',
    state: session.state,
    seats: session.seats,
    privateSeats: [
      {
        seat: { playerId: 'p1', peerId: hostPeerId, name: 'Dimbo' },
        resumeToken: HOST_RESUME_TOKEN,
      },
      {
        seat: { playerId: 'p2', peerId: 'old-guest', name: 'Bo' },
        resumeToken: GUEST_RESUME_TOKEN,
      },
    ],
    log: session.log,
    savedAt: Date.now(),
    ...(options.lobbyConfig && { lobbyConfig: options.lobbyConfig }),
  }
  sessionStorage.setItem(KEEPER_KEY, JSON.stringify(snapshot))
  return snapshot
}

interface MutableRefereeSeat {
  playerId: string
  peerId: string | null
  absentSince: number | null
}

const invalidKeeperSnapshots: [string, (snapshot: StoredKeeper) => void][] = [
  ['malformed referee seats', (snapshot) => (snapshot.seats = { playerId: 'p1' })],
  ['empty referee seats', (snapshot) => (snapshot.seats = [])],
  [
    'duplicate private player ids',
    (snapshot) => {
      const privateSeats = snapshot.privateSeats as PrivateSeat[]
      snapshot.privateSeats = [
        privateSeats[0],
        {
          ...privateSeats[1],
          seat: { ...privateSeats[1].seat, playerId: privateSeats[0].seat.playerId },
        },
      ]
    },
  ],
  [
    'duplicate referee player ids',
    (snapshot) => {
      const seats = snapshot.seats as MutableRefereeSeat[]
      snapshot.seats = [seats[0], { ...seats[1], playerId: seats[0].playerId }]
    },
  ],
  [
    'duplicate active referee peer ids',
    (snapshot) => {
      const seats = snapshot.seats as MutableRefereeSeat[]
      snapshot.seats = [seats[0], { ...seats[1], peerId: seats[0].peerId }]
    },
  ],
  [
    'duplicate historical peer ids',
    (snapshot) => {
      const privateSeats = snapshot.privateSeats as PrivateSeat[]
      snapshot.privateSeats = [
        privateSeats[0],
        {
          ...privateSeats[1],
          seat: { ...privateSeats[1].seat, peerId: privateSeats[0].seat.peerId },
        },
      ]
    },
  ],
  [
    'duplicate resume tokens',
    (snapshot) => {
      const privateSeats = snapshot.privateSeats as PrivateSeat[]
      snapshot.privateSeats = [
        privateSeats[0],
        { ...privateSeats[1], resumeToken: privateSeats[0].resumeToken },
      ]
    },
  ],
  [
    'cross-ledger player swaps',
    (snapshot) => {
      const seats = snapshot.seats as MutableRefereeSeat[]
      snapshot.seats = [
        { ...seats[0], playerId: seats[1].playerId },
        { ...seats[1], playerId: seats[0].playerId },
      ]
    },
  ],
  [
    'missing host and keeper seat',
    (snapshot) => {
      snapshot.privateSeats = (snapshot.privateSeats as PrivateSeat[]).slice(1)
      snapshot.seats = (snapshot.seats as MutableRefereeSeat[]).slice(1)
    },
  ],
  ['keeper assigned to the non-host seat', (snapshot) => (snapshot.keeperId = 'p2')],
  ['non-array log', (snapshot) => (snapshot.log = {} as unknown as unknown[])],
  ['invalid log element', (snapshot) => (snapshot.log = [null])],
  ['unknown log event', (snapshot) => (snapshot.log = [{ id: 1, type: 'futureEvent' }])],
  ['log event missing required fields', (snapshot) => (snapshot.log = [{ id: 1, type: 'dealt' }])],
  [
    'non-finite log event id',
    (snapshot) => {
      const first = (snapshot.log as Record<string, unknown>[])[0]
      snapshot.log = [{ ...first, id: Number.POSITIVE_INFINITY }]
    },
  ],
  [
    'duplicate log event ids',
    (snapshot) => {
      const events = snapshot.log as Record<string, unknown>[]
      snapshot.log = [events[0], { ...events[1], id: events[0].id }]
    },
  ],
  [
    'out-of-order log event ids',
    (snapshot) => {
      const events = snapshot.log as Record<string, unknown>[]
      snapshot.log = [events[1], events[0]]
    },
  ],
  [
    'malformed log audience',
    (snapshot) => {
      const first = (snapshot.log as Record<string, unknown>[])[0]
      snapshot.log = [{ ...first, visibleTo: 'p1' }]
    },
  ],
  [
    'missing private log audience',
    (snapshot) => {
      snapshot.log = [{ id: 1, type: 'takenFromDiscard', player: 'p1', card: 'sudo', to: 'deck' }]
    },
  ],
  [
    'wrong private log audience',
    (snapshot) => {
      snapshot.log = [
        {
          id: 1,
          type: 'handTransfer',
          from: 'p1',
          to: 'p2',
          card: 'bug',
          visibleTo: ['p1', 'p3'],
        },
      ]
    },
  ],
  [
    'unexpected log payload fields',
    (snapshot) => {
      const first = (snapshot.log as Record<string, unknown>[])[0]
      snapshot.log = [{ ...first, secret: 'card-id' }]
    },
  ],
  [
    'non-numeric lobby config capacity',
    (snapshot) => {
      snapshot.lobbyConfig = { maxPlayers: '3' as unknown as number, setup: {} }
    },
  ],
  [
    'negative lobby config capacity',
    (snapshot) => {
      snapshot.lobbyConfig = { maxPlayers: -1, setup: {} }
    },
  ],
  [
    'zero lobby config capacity',
    (snapshot) => {
      snapshot.lobbyConfig = { maxPlayers: 0, setup: {} }
    },
  ],
  [
    'fractional lobby config capacity',
    (snapshot) => {
      snapshot.lobbyConfig = { maxPlayers: 2.5, setup: {} }
    },
  ],
  [
    'above-maximum lobby config capacity',
    (snapshot) => {
      snapshot.lobbyConfig = { maxPlayers: 7, setup: {} }
    },
  ],
  [
    'non-object lobby config setup',
    (snapshot) => {
      snapshot.lobbyConfig = { maxPlayers: 3, setup: [] }
    },
  ],
  ['malformed state', (snapshot) => (snapshot.state = {})],
  [
    'state for another game',
    (snapshot) => {
      snapshot.state = { ...(snapshot.state as Record<string, unknown>), gameId: 'other-game' }
    },
  ],
]

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

it('does not restore a stored room with no match running', async () => {
  storedHostSession(null)
  storedKeeperSnapshot('peer0')

  renderHook(() => useLobby())
  await act(async () => {
    await Promise.resolve()
  })
  expect(transports).toHaveLength(0)
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

function storedGuestSession(gameId: string | null): void {
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      roomCode: 'ABC-123',
      name: 'Bo',
      role: 'guest',
      gameId,
      joinedAt: Date.now(),
    } satisfies StoredSession),
  )
}

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

// --- fix round: superseded runs must not settle or tear down another run ---

async function replacedGuestTransport(options: { startGame?: boolean } = {}) {
  const rendered = renderHook(() => useLobby())
  await act(async () => {
    await rendered.result.current.joinRoom('ABC-123', 'Bo')
    await rendered.result.current.joinRoom('ABC-123', 'Bo')
  })
  const oldTransport = transports[0]
  const liveTransport = transports[1]
  const hostId = parseRoomCode('ABC-123')
  act(() => {
    liveTransport.onConnection?.(hostId)
    if (options.startGame) {
      liveTransport.onMessage?.({
        type: 'GAME_STARTING',
        payload: {
          gameId: 'abc123-1',
          seats: [{ playerId: 'p1', peerId: liveTransport.id, name: 'Bo' }],
        },
        from: hostId,
        seq: 1,
      } as WireMessage)
    }
  })
  return { ...rendered, oldTransport, liveTransport, hostId }
}

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
