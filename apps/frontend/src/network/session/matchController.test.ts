import { expect, it, vi } from 'vitest'
import { createRoomRuntime, type RoomViewPort } from '../lobby/runtime'
import { createLobbyState } from '../lobby/state'
import type { Transport } from '../transport/peer'
import { createMatchController } from './matchController'
import type { KeeperWriter } from './persistence'

function setup(options: { host?: boolean; bots?: number } = {}) {
  const host = options.host ?? true
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
  const send = vi.fn()
  const transport = {
    id: host ? 'host' : 'guest',
    send,
    broadcast: vi.fn(),
    connectedIds: vi.fn(() => ['guest']),
  } as unknown as Transport
  const runtime = createRoomRuntime(port, writer)
  const attempt = runtime.beginTransportAttempt()
  runtime.attachTransport(attempt, transport, host)
  runtime.commitLobby(
    createLobbyState({
      selfId: transport.id,
      hostId: 'host',
      maxPlayers: 4,
      bots: options.bots ?? 0,
      setup: {},
      peers: [
        {
          id: 'host',
          memberId: 'member-host',
          name: 'Host',
          role: 'host',
          ready: true,
          where: 'lobby',
        },
        {
          id: 'guest',
          memberId: 'member-guest',
          name: 'Guest',
          role: 'player',
          ready: true,
          where: 'lobby',
        },
      ],
    }),
  )
  runtime.replaceResumeTokens(
    new Map([
      ['host', 'host-token'],
      ['guest', 'guest-token'],
    ]),
  )
  const dispatch = vi.fn()
  const rememberGame = vi.fn()
  const clearKeeper = vi.fn()
  const controller = createMatchController({
    runtime,
    keeperWriter: writer,
    dispatch,
    rememberGame,
    clearKeeper,
  })
  return { clearKeeper, controller, dispatch, rememberGame, runtime, send, transport, writer }
}

it('dispatches GAME_STARTING before the keeper sends its first SYNC', () => {
  const { controller, dispatch, runtime, send } = setup()

  controller.start([])

  expect(dispatch).toHaveBeenCalledWith([
    expect.objectContaining({ message: expect.objectContaining({ type: 'GAME_STARTING' }) }),
  ])
  expect(send).toHaveBeenCalledWith('guest', expect.objectContaining({ type: 'SYNC' }))
  expect(dispatch.mock.invocationCallOrder[0]).toBeLessThan(send.mock.invocationCallOrder[0])
  expect(runtime.gameId).toBe('host-1')
  expect(new Set(runtime.privateSeats.map(({ resumeToken }) => resumeToken))).toEqual(
    new Set(['host-token', 'guest-token']),
  )
})

it('keeps a bot address in public seating but nulls it only in the referee', () => {
  const { controller, runtime } = setup({ bots: 1 })
  const lobby = runtime.lobby
  if (!lobby) throw new Error('missing lobby')
  runtime.commitLobby({
    ...lobby,
    peers: { host: lobby.peers.host },
  })

  controller.start(['Bot'])

  expect(runtime.seats[1]).toMatchObject({ peerId: 'bot:1', bot: true })
  expect(runtime.privateSeats[1]).toMatchObject({ resumeToken: null })
  expect(runtime.matchResources.sessionRef?.current.seats[1]).toMatchObject({
    peerId: null,
    bot: true,
  })
})

it('reuses a guest remote link across repeated GAME_STARTING frames', () => {
  const { controller, runtime } = setup({ host: false })
  const seating = [
    { playerId: 'p1', peerId: 'host', name: 'Host' },
    { playerId: 'p2', peerId: 'guest', name: 'Guest' },
  ]

  controller.followStart('host-1', seating)
  const remote = runtime.matchResources.remote
  controller.followStart('host-2', seating)

  expect(runtime.matchResources.remote).toBe(remote)
  expect(runtime.gameId).toBe('host-2')
})

it('leaves the match without clearing frozen seating or live resources', () => {
  const { clearKeeper, controller, rememberGame, runtime } = setup()
  controller.start([])
  const resources = runtime.matchResources
  const seats = runtime.seats

  controller.leaveGame()

  expect(runtime.gameId).toBeNull()
  expect(runtime.seats).toBe(seats)
  expect(runtime.matchResources).toBe(resources)
  expect(clearKeeper).toHaveBeenCalledOnce()
  expect(rememberGame).toHaveBeenCalledWith(null)
})
