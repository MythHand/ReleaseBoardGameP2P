import { expect, it, vi } from 'vitest'
import type { ChatController } from '../chat/controller'
import type { MatchController } from '../session/matchController'
import type { KeeperWriter } from '../session/persistence'
import type { Transport } from '../transport/peer'
import type { WireMessage } from '../types'
import { createMessageController } from './messageController'
import type { Outgoing } from './messages'
import { createRoomRuntime, type RoomViewPort } from './runtime'
import { createLobbyState } from './state'

function setup(host = true) {
  const port = {
    lobby: vi.fn(),
    host: vi.fn(),
    roomCode: vi.fn(),
    gameId: vi.fn(),
    seats: vi.fn(),
    gameLink: vi.fn(),
    gameSync: vi.fn(),
    pickPreview: vi.fn(),
  } satisfies RoomViewPort
  const writer = { queue: vi.fn(), cancel: vi.fn() } satisfies KeeperWriter
  const transport = {
    id: host ? 'host' : 'guest',
    authenticate: vi.fn(),
    connectedIds: vi.fn(() => ['one', 'two']),
    relay: vi.fn(),
  } as unknown as Transport
  const runtime = createRoomRuntime(port, writer)
  const attempt = runtime.beginTransportAttempt()
  runtime.attachTransport(attempt, transport, host)
  runtime.commitLobby(
    createLobbyState({
      selfId: transport.id,
      hostId: 'host',
      maxPlayers: 4,
      bots: 0,
      setup: {},
      peers: [
        {
          id: transport.id,
          memberId: `member-${transport.id}`,
          name: host ? 'Host' : 'Guest',
          role: host ? 'host' : 'player',
          ready: host,
          where: 'lobby',
        },
      ],
    }),
  )
  const joinedEntry = {
    id: 'entry-1',
    sequence: 1,
    createdAt: 1,
    kind: 'system',
    event: {
      kind: 'memberJoined',
      memberId: 'member-client',
      name: 'Client',
      role: 'player',
    },
  } as const
  const chat = {
    admit: vi.fn(() => ({ memberId: 'member-client', isNew: true })),
    appendJoin: vi.fn(() => joinedEntry),
    appendRoleChange: vi.fn(),
    appendLeft: vi.fn(),
    appendUser: vi.fn(),
    lastKnownRole: vi.fn(),
    history: vi.fn((to, memberId) => ({
      to,
      message: {
        type: 'CHAT_HISTORY',
        payload: { entries: [joinedEntry], selfMemberId: memberId },
      },
    })),
    receiveHistory: vi.fn(),
    receiveEntry: vi.fn(),
    clearRoom: vi.fn(),
  } as unknown as ChatController
  const match = {
    peerLeft: vi.fn(),
    returnSeat: vi.fn(),
    followStart: vi.fn(),
    reboundSeat: vi.fn(),
    receiveSync: vi.fn(),
  } as unknown as MatchController
  const dispatch = vi.fn()
  const forgetStored = vi.fn()
  const setStatus = vi.fn()
  const leaveSession = vi.fn()
  const controller = createMessageController({
    runtime,
    chat,
    match,
    dispatch,
    forgetStored,
    setStatus,
    leaveSession,
  })
  return {
    chat,
    controller,
    dispatch,
    leaveSession,
    match,
    port,
    runtime,
    setStatus,
    transport,
  }
}

it('rejects a malformed join during a live game and marks that peer absent', () => {
  const { controller, match, runtime } = setup()
  runtime.commitGameId('host-1')

  controller.handle({
    type: 'JOIN_REQUEST',
    payload: { name: '', resumeToken: '' },
    from: 'bad',
    seq: 1,
  })

  expect(match.peerLeft).toHaveBeenCalledWith('bad')
})

it('makes host admission order explicit and authenticates after acceptance', () => {
  const { controller, dispatch, transport } = setup()

  controller.handle({
    type: 'JOIN_REQUEST',
    payload: { name: 'Client', resumeToken: 'client-token' },
    from: 'client',
    seq: 1,
  })

  expect((dispatch.mock.calls[0][0] as Outgoing[]).map(({ message }) => message.type)).toEqual([
    'PEER_LIST',
    'LOBBY_CONFIG_UPDATED',
    'PEER_JOINED',
    'CHAT_HISTORY',
    'CHAT_ENTRY',
  ])
  expect(transport.authenticate).toHaveBeenCalledWith('client')
})

it('relays a host-side relayable frame without changing its sender', () => {
  const { controller, transport } = setup()
  const message = {
    type: 'PICK_PREVIEW',
    payload: { gameId: 'host-1', player: 'p2', card: 'card-1' },
    from: 'one',
  } as WireMessage

  controller.handle(message)

  expect(transport.relay).toHaveBeenCalledWith(['two'], message)
})

it('guards guest roster frames but accepts PICK_PREVIEW from any sender', () => {
  const { controller, port } = setup(false)
  controller.handle({
    type: 'PEER_LIST',
    payload: { peers: [], yourRole: 'guest' },
    from: 'attacker',
    seq: 1,
  })
  expect(port.lobby).toHaveBeenCalledTimes(1)

  controller.handle({
    type: 'PICK_PREVIEW',
    payload: { gameId: 'host-1', player: 'p2', card: 'card-1' },
    from: 'attacker',
    seq: 2,
  })
  expect(port.pickPreview).toHaveBeenCalledWith({
    gameId: 'host-1',
    player: 'p2',
    card: 'card-1',
  })
})

it('tears down a guest only for an authoritative disband', () => {
  const { controller, leaveSession, setStatus } = setup(false)
  controller.handle({ type: 'LOBBY_DISBANDED', payload: {}, from: 'attacker', seq: 1 })
  expect(leaveSession).not.toHaveBeenCalled()

  controller.handle({ type: 'LOBBY_DISBANDED', payload: {}, from: 'host', seq: 2 })
  expect(leaveSession).toHaveBeenCalledOnce()
  expect(setStatus).toHaveBeenCalledWith('disbanded')
})
