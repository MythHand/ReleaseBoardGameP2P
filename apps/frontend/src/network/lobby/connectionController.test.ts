import { beforeEach, expect, it, vi } from 'vitest'
import type { ChatController } from '../chat/controller'
import type { ChatSessionModel } from '../chat/useChatSession'
import type { MatchController } from '../session/matchController'
import type { KeeperWriter } from '../session/persistence'
import type { Transport } from '../transport/peer'
import { type ConnectionViewPort, createConnectionController } from './connectionController'
import type { MessageController } from './messageController'
import { createRoomRuntime, type RoomViewPort } from './runtime'

const transportMock = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('../transport/peer', () => ({ createTransport: transportMock.create }))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, reject, resolve }
}

function setup() {
  const roomPort = {
    lobby: vi.fn(),
    host: vi.fn(),
    roomCode: vi.fn(),
    gameId: vi.fn(),
    seats: vi.fn(),
    gameLink: vi.fn(),
    gameSync: vi.fn(),
    pickPreview: vi.fn(),
  } satisfies RoomViewPort
  const keeperWriter = { queue: vi.fn(), cancel: vi.fn() } satisfies KeeperWriter
  const runtime = createRoomRuntime(roomPort, keeperWriter)
  const view = {
    status: vi.fn(),
    restoring: vi.fn(),
    error: vi.fn(),
    reconnect: vi.fn(),
  } satisfies ConnectionViewPort
  const match = {
    teardownRoom: vi.fn(() => runtime.closeMatchResources({ clearView: true })),
  } as unknown as MatchController
  const controller = createConnectionController({
    runtime,
    message: { handle: vi.fn(), hostPeerDisconnected: vi.fn() } as MessageController,
    match,
    chat: { clearRoom: vi.fn() } as unknown as ChatController,
    chatSession: {
      startHost: vi.fn(() => 'member-host'),
      restoreHost: vi.fn(() => 'member-host'),
    } as unknown as ChatSessionModel,
    keeperWriter,
    view,
  })
  return { controller, keeperWriter, match, runtime, view }
}

beforeEach(() => {
  transportMock.create.mockReset()
  sessionStorage.clear()
})

it('cannot attach a transport after leaveSession cancels an in-flight create', async () => {
  const pending = deferred<Transport>()
  transportMock.create.mockReturnValueOnce(pending.promise)
  const { controller, runtime } = setup()
  const close = vi.fn()
  const creating = controller.createRoom('Host', 4)

  controller.leaveSession()
  pending.resolve({ id: 'host', close } as unknown as Transport)

  await expect(creating).rejects.toThrow('create cancelled')
  expect(runtime.transport).toBeNull()
  expect(close).toHaveBeenCalledOnce()
})

it('invalidates ownership immediately but delays only the detached transport close', () => {
  vi.useFakeTimers()
  try {
    const { controller, keeperWriter, match, runtime, view } = setup()
    const close = vi.fn()
    const attempt = runtime.beginTransportAttempt()
    runtime.attachTransport(attempt, { id: 'host', close } as unknown as Transport, true)

    controller.leaveSession(200)

    expect(runtime.transport).toBeNull()
    expect(match.teardownRoom).toHaveBeenCalledOnce()
    expect(keeperWriter.cancel).toHaveBeenCalled()
    expect(view.status).toHaveBeenLastCalledWith('idle')
    expect(close).not.toHaveBeenCalled()
    vi.advanceTimersByTime(200)
    expect(close).toHaveBeenCalledOnce()
  } finally {
    vi.useRealTimers()
  }
})
