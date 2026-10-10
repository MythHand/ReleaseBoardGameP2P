import { afterEach, beforeEach, vi } from 'vitest'
import { createTransport, type Transport } from '../transport/peer'
import type { WireMessage } from '../types'
import { checkRoom, ROOM_CHECK_TIMEOUT_MS } from './checkRoom'

vi.mock('../transport/peer', () => ({ createTransport: vi.fn() }))
vi.mock('../useLobby', () => ({
  parseRoomCode: (code: string) => code.replace(/[^a-z0-9]/gi, '').toLowerCase(),
}))
let callbacks: Parameters<typeof createTransport>[0]
let transport: Transport
beforeEach(() => {
  vi.useFakeTimers()
  transport = {
    id: 'visitor',
    send: vi.fn(),
    connectTo: vi.fn(),
    authenticate: vi.fn(),
    broadcast: vi.fn(),
    relay: vi.fn(),
    disconnectPeer: vi.fn(),
    connectedIds: () => [],
    close: vi.fn(),
  }
  vi.mocked(createTransport).mockImplementation((args) => {
    callbacks = args
    return Promise.resolve(transport)
  })
})
afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

it('checks the host without sending a join or trusting another peer', async () => {
  const pending = checkRoom('ABC-234')
  await Promise.resolve()
  expect(transport.connectTo).toHaveBeenCalledWith('abc234')
  callbacks.onConnection?.('abc234')
  expect(transport.send).toHaveBeenCalledExactlyOnceWith('abc234', {
    type: 'ROOM_CHECK',
    payload: {},
  })
  const response: WireMessage = {
    type: 'ROOM_AVAILABILITY',
    from: 'other',
    seq: 1,
    payload: { player: false, spectator: true },
  }
  callbacks.onMessage(response)
  expect(transport.close).not.toHaveBeenCalled()
  callbacks.onMessage({ ...response, from: 'abc234' })
  await expect(pending).resolves.toEqual({ player: false, spectator: true })
  expect(transport.close).toHaveBeenCalledOnce()
})

it('times out and closes a peer whose data channel never opens', async () => {
  const pending = checkRoom('ABC-234')
  const rejected = expect(pending).rejects.toThrow('timed out')
  await vi.advanceTimersByTimeAsync(ROOM_CHECK_TIMEOUT_MS)
  await rejected
  expect(transport.close).toHaveBeenCalledOnce()
})

it('aborts setup and closes a transport that opens after cancellation', async () => {
  let open: (value: Transport) => void = () => {}
  vi.mocked(createTransport).mockImplementation((args) => {
    callbacks = args
    return new Promise((resolve) => {
      open = resolve
    })
  })
  const controller = new AbortController()
  const pending = checkRoom('ABC-234', controller.signal)
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  controller.abort()
  await rejected
  expect(callbacks.signal?.aborted).toBe(true)
  open(transport)
  await Promise.resolve()
  expect(transport.close).toHaveBeenCalledOnce()
  expect(transport.connectTo).not.toHaveBeenCalled()
})
