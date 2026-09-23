import { describe, expect, it, vi } from 'vitest'
import type { ChatController } from '../chat/controller'
import type { KeeperWriter } from '../session/persistence'
import type { Transport } from '../transport/peer'
import type { PeerInfo } from '../types'
import { createLobbyActionsController, DISBAND_FLUSH_MS } from './actionsController'
import { createRoomRuntime, type RoomViewPort } from './runtime'
import { createLobbyState } from './state'

const host: PeerInfo = {
  id: 'host',
  memberId: 'member-host',
  name: 'Host',
  role: 'host',
  ready: true,
  where: 'lobby',
}
const player: PeerInfo = {
  id: 'player',
  memberId: 'member-player',
  name: 'Player',
  role: 'player',
  ready: false,
  where: 'lobby',
}

function setup(options: { self?: PeerInfo; host?: boolean } = {}) {
  const self = options.self ?? host
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
  const runtime = createRoomRuntime(port, writer)
  const attempt = runtime.beginTransportAttempt()
  runtime.attachTransport(attempt, { id: self.id } as Transport, options.host ?? true)
  runtime.commitLobby(
    createLobbyState({
      selfId: self.id,
      hostId: host.id,
      maxPlayers: 4,
      bots: 0,
      setup: { releases: 'slow', ai: 'less' },
      peers: [host, player],
    }),
  )
  runtime.replaceResumeTokens(
    new Map([
      ['host', 'host-token'],
      ['player', 'player-token'],
    ]),
  )
  const chat = {
    appendKicked: vi.fn(() => ({ id: 'kicked' })),
    appendCapacityRoleChanges: vi.fn(() => [{ id: 'role' }]),
    appendModeChanges: vi.fn(() => [{ id: 'mode' }]),
    broadcast: vi.fn(),
  } as unknown as ChatController
  const dispatch = vi.fn()
  const rememberLobbyConfig = vi.fn()
  const leaveSession = vi.fn()
  const controller = createLobbyActionsController({
    runtime,
    chat,
    dispatch,
    rememberLobbyConfig,
    leaveSession,
  })
  return { chat, controller, dispatch, leaveSession, rememberLobbyConfig, runtime }
}

describe('lobby actions controller', () => {
  it('applies host ready locally and sends guest ready to the host', () => {
    const hostSetup = setup()
    hostSetup.controller.ready()
    expect(hostSetup.runtime.lobby?.peers.host.ready).toBe(false)
    expect(hostSetup.dispatch).toHaveBeenCalledWith([
      expect.objectContaining({ message: expect.objectContaining({ type: 'PEER_JOINED' }) }),
    ])

    const guestSetup = setup({ self: player, host: false })
    guestSetup.controller.ready()
    expect(guestSetup.dispatch).toHaveBeenCalledWith([
      { to: 'host', message: { type: 'PLAYER_READY', payload: {} } },
    ])
  })

  it('applies host whereabouts locally and sends guest whereabouts to the host', () => {
    const hostSetup = setup()
    hostSetup.controller.setWhere('game')
    expect(hostSetup.runtime.lobby?.peers.host.where).toBe('game')

    const guestSetup = setup({ self: player, host: false })
    guestSetup.controller.setWhere('game')
    expect(guestSetup.dispatch).toHaveBeenCalledWith([
      { to: 'host', message: { type: 'WHEREABOUTS', payload: { where: 'game' } } },
    ])
  })

  it('ignores a missing kick target and removes a real token before broadcasting', () => {
    const { chat, controller, dispatch, runtime } = setup()
    controller.kick('missing')
    expect(dispatch).not.toHaveBeenCalled()

    dispatch.mockImplementationOnce(() => {
      expect(runtime.resumeTokens.has('player')).toBe(false)
    })
    controller.kick('player')

    expect(chat.appendKicked).toHaveBeenCalledWith(player)
    expect(chat.broadcast).toHaveBeenCalledWith([{ id: 'kicked' }])
  })

  it('persists capacity and bot changes and broadcasts capacity role events', () => {
    const { chat, controller, rememberLobbyConfig } = setup()
    controller.setMaxPlayers(2)
    expect(rememberLobbyConfig).toHaveBeenCalledWith(expect.objectContaining({ maxPlayers: 2 }))
    expect(chat.appendCapacityRoleChanges).toHaveBeenCalledOnce()
    expect(chat.broadcast).toHaveBeenCalledWith([{ id: 'role' }])

    controller.setBots(2)
    expect(rememberLobbyConfig).toHaveBeenLastCalledWith(expect.objectContaining({ bots: 2 }))
  })

  it('records only changed mode events and persists setup', () => {
    const { chat, controller, rememberLobbyConfig } = setup()
    const setupValue = { releases: 'fast', ai: 'less' }
    controller.setSetup(setupValue)

    expect(chat.appendModeChanges).toHaveBeenCalledWith(
      { releases: 'slow', ai: 'less' },
      setupValue,
    )
    expect(chat.broadcast).toHaveBeenCalledWith([{ id: 'mode' }])
    expect(rememberLobbyConfig).toHaveBeenCalledWith(expect.objectContaining({ setup: setupValue }))
  })

  it('sends transfer intent and broadcasts disband before teardown', () => {
    const { controller, dispatch, leaveSession } = setup()
    controller.transferHost('player')
    expect(dispatch).toHaveBeenCalledWith([
      {
        to: 'broadcast',
        message: { type: 'TRANSFER_HOST', payload: { newHostId: 'player' } },
      },
    ])

    const order: string[] = []
    dispatch.mockImplementationOnce(() => order.push('dispatch'))
    leaveSession.mockImplementationOnce(() => order.push('leave'))
    controller.disband()
    expect(order).toEqual(['dispatch', 'leave'])
    expect(leaveSession).toHaveBeenCalledWith(DISBAND_FLUSH_MS)
  })
})
