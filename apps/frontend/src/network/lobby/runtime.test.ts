import { describe, expect, it, vi } from 'vitest'
import type { PrivateSeat } from '~/entities/game/seats'
import type { KeeperWriter } from '../session/persistence'
import type { MatchResources, RoomViewPort } from './runtime'
import { createRoomRuntime } from './runtime'
import { createLobbyState } from './state'

function setup() {
  const calls: string[] = []
  const viewPort: RoomViewPort = {
    lobby: vi.fn(),
    host: vi.fn(),
    roomCode: vi.fn(),
    gameId: vi.fn(),
    seats: vi.fn(),
    gameLink: vi.fn(),
    gameSync: vi.fn(),
    pickPreview: vi.fn(),
  }
  const keeperWriter: KeeperWriter = {
    queue: vi.fn(),
    cancel: vi.fn(() => calls.push('writer')),
  }
  return { calls, keeperWriter, runtime: createRoomRuntime(viewPort, keeperWriter), viewPort }
}

describe('room runtime synchronized writes', () => {
  it('updates live values and each React port exactly once', () => {
    const { runtime, viewPort } = setup()
    const lobby = createLobbyState({
      selfId: 'host',
      hostId: 'host',
      maxPlayers: 4,
      bots: 0,
      setup: {},
      peers: [],
    })
    const seats = [{ playerId: 'p1', peerId: 'host', name: 'Host' }]
    const gameLink = { submit: vi.fn(), subscribe: vi.fn(), close: vi.fn() }
    const gameSync = { view: {} as never, events: [] }

    runtime.commitLobby(lobby)
    runtime.commitGameId('host-1')
    runtime.commitSeats(seats)
    runtime.commitGameLink(gameLink)
    runtime.commitGameSync(gameSync)

    expect(runtime.lobby).toBe(lobby)
    expect(runtime.gameId).toBe('host-1')
    expect(runtime.seats).toBe(seats)
    expect(viewPort.lobby).toHaveBeenCalledOnce()
    expect(viewPort.gameId).toHaveBeenCalledOnce()
    expect(viewPort.seats).toHaveBeenCalledOnce()
    expect(viewPort.gameLink).toHaveBeenCalledOnce()
    expect(viewPort.gameSync).toHaveBeenCalledOnce()
  })
})

describe('room runtime ownership', () => {
  it('does not let an older transport attempt attach after a newer one begins', () => {
    const { runtime } = setup()
    const stale = runtime.beginTransportAttempt()
    const current = runtime.beginTransportAttempt()
    const staleTransport = { id: 'stale' } as never
    const currentTransport = { id: 'current' } as never

    expect(runtime.attachTransport(stale, staleTransport, true)).toBe(false)
    expect(runtime.attachTransport(current, currentTransport, true)).toBe(true)
    expect(runtime.transport).toBe(currentTransport)
    expect(runtime.isHost).toBe(true)
  })

  it('invalidates every async owner before returning the detached transport', () => {
    const { runtime, viewPort } = setup()
    const attempt = runtime.beginTransportAttempt()
    const transport = { id: 'host' } as never
    runtime.attachTransport(attempt, transport, true)
    const sessionEpoch = runtime.sessionEpoch
    const reconnectEpoch = runtime.reconnectEpoch

    const detached = runtime.invalidateSession()

    expect(detached).toBe(transport)
    expect(runtime.transport).toBeNull()
    expect(runtime.sessionEpoch).toBe(sessionEpoch + 1)
    expect(runtime.reconnectEpoch).toBe(reconnectEpoch + 1)
    expect(runtime.ownsTransport(attempt, transport)).toBe(false)
    expect(runtime.isHost).toBe(false)
    expect(viewPort.host).toHaveBeenLastCalledWith(false)
  })
})

describe('room runtime match resources', () => {
  it('cancels the gate before closing links and the keeper writer', () => {
    const { calls, keeperWriter, runtime } = setup()
    const resources: MatchResources = {
      sessionRef: {} as never,
      gate: { cancel: vi.fn(() => calls.push('gate')) } as never,
      keeper: {
        close: vi.fn(() => calls.push('keeper')),
        link: { close: vi.fn() },
      } as never,
      remote: { link: { close: vi.fn(() => calls.push('remote')) } } as never,
    }
    runtime.setMatchResources(resources)

    runtime.closeMatchResources({ clearView: true })

    expect(calls).toEqual(['gate', 'keeper', 'remote', 'writer'])
    expect(runtime.matchResources).toEqual({
      sessionRef: null,
      keeper: null,
      remote: null,
      gate: null,
    })
    expect(keeperWriter.cancel).toHaveBeenCalledOnce()
  })

  it('keeps frozen seating during match cleanup until room teardown clears it', () => {
    const { runtime, viewPort } = setup()
    const privateSeats: PrivateSeat[] = [
      {
        seat: { playerId: 'p1', peerId: 'host', name: 'Host' },
        resumeToken: 'token',
      },
    ]
    runtime.commitSeats([privateSeats[0].seat], privateSeats)

    runtime.closeMatchResources({ clearView: true })

    expect(runtime.seats).toEqual([privateSeats[0].seat])
    expect(runtime.privateSeats).toBe(privateSeats)
    expect(viewPort.seats).toHaveBeenCalledOnce()

    runtime.commitSeats([], [])
    expect(runtime.seats).toEqual([])
    expect(runtime.privateSeats).toEqual([])
  })
})
