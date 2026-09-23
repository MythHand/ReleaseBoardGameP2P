import { act } from '@testing-library/react'
import type { ChatSystemEvent } from '~/shared/chat/types'
import { readChat, writeChat } from '~/shared/lib/persistence'
import {
  HOST_RESUME_TOKEN,
  renderHook,
  storedHostSession,
  storedKeeperSnapshot,
  systemEvents,
  transports,
  userChatEntry,
} from './testing/lobbyHarness'
import type { Message, WireMessage } from './types'
import { formatRoomCode, parseRoomCode, useLobby } from './useLobby'

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
    event: { kind: 'memberJoined', memberId: peerCMemberId, name: 'Cy', role: 'player' },
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
  await act(async () => result.current.createRoom('Ann', 2))
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
      type: 'PLAYER_READY',
      payload: {},
      from: 'peer-old',
      seq: 2,
    }),
  )

  act(() =>
    transports[0].onMessage?.({
      type: 'JOIN_REQUEST',
      payload: { name: 'Bo', resumeToken: 'client-b' },
      from: 'peer-new',
      seq: 3,
    }),
  )
  expect(result.current.state?.peers['peer-old']).toBeUndefined()
  expect(result.current.state?.peers['peer-new']).toMatchObject({
    memberId,
    role: 'player',
    ready: true,
  })
  expect(transports[0].broadcast).toHaveBeenCalledWith({
    type: 'PLAYER_KICKED',
    payload: { peerId: 'peer-old' },
  })
  act(() => transports[0].onDisconnect?.('peer-old'))

  expect(result.current.state?.peers['peer-old']).toBeUndefined()
  expect(result.current.state?.peers['peer-new'].memberId).toBe(memberId)
  expect(
    systemEvents(result.current)
      .filter((event) => 'memberId' in event && event.memberId === memberId)
      .map((event) => event.kind),
  ).toEqual(['memberJoined', 'memberReconnected'])
})

it('records a changed role when a disconnected player returns as a spectator', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => result.current.createRoom('Ann', 2))
  act(() =>
    transports[0].onMessage?.({
      type: 'JOIN_REQUEST',
      payload: { name: 'Bo', resumeToken: 'client-b' },
      from: 'peer-old',
      seq: 1,
    }),
  )
  const memberId = result.current.state?.peers['peer-old'].memberId
  act(() => transports[0].onDisconnect?.('peer-old'))
  act(() =>
    transports[0].onMessage?.({
      type: 'JOIN_REQUEST',
      payload: { name: 'Cy', resumeToken: 'client-c' },
      from: 'peer-c',
      seq: 2,
    }),
  )
  act(() =>
    transports[0].onMessage?.({
      type: 'JOIN_REQUEST',
      payload: { name: 'Bo', resumeToken: 'client-b' },
      from: 'peer-new',
      seq: 3,
    }),
  )

  expect(result.current.state?.peers['peer-new']).toMatchObject({ memberId, role: 'guest' })
  expect(
    systemEvents(result.current)
      .filter((event) => 'memberId' in event && event.memberId === memberId)
      .slice(-2),
  ).toEqual([
    { kind: 'memberReconnected', memberId, name: 'Bo' },
    { kind: 'roleChanged', memberId, name: 'Bo', role: 'spectator' },
  ])
})

it('does not record a role change when a silent player reconnects to the same role', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => result.current.createRoom('Ann', 3))
  act(() =>
    transports[0].onMessage?.({
      type: 'JOIN_REQUEST',
      payload: { name: 'Bo', resumeToken: 'client-b' },
      from: 'peer-old',
      seq: 1,
    }),
  )
  const memberId = result.current.state?.peers['peer-old'].memberId
  act(() => transports[0].onDisconnect?.('peer-old'))
  act(() =>
    transports[0].onMessage?.({
      type: 'JOIN_REQUEST',
      payload: { name: 'Bo', resumeToken: 'client-b' },
      from: 'peer-new',
      seq: 2,
    }),
  )

  expect(result.current.state?.peers['peer-new']).toMatchObject({ memberId, role: 'player' })
  expect(
    systemEvents(result.current)
      .filter((event) => 'memberId' in event && event.memberId === memberId)
      .map((event) => event.kind),
  ).toEqual(['memberJoined', 'memberLeft', 'memberReconnected'])
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
