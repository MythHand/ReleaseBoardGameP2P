import { createTransport, type Transport } from '../transport/peer'
import type { JoinAvailability } from '../types'
import { parseRoomCode } from '../useLobby'

export const ROOM_CHECK_TIMEOUT_MS = 10_000

// A temporary, unauthenticated connection. It never sends JOIN_REQUEST or
// receives a roster, chat history, or game sync.
export function checkRoom(code: string, signal?: AbortSignal): Promise<JoinAvailability> {
  const hostId = parseRoomCode(code)
  if (!hostId) return Promise.reject(new Error('Missing room code'))
  return new Promise((resolve, reject) => {
    const controller = new AbortController()
    let transport: Transport | null = null
    let settled = false
    const finish = (result?: JoinAvailability, error?: unknown) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abort)
      transport?.close()
      controller.abort()
      if (result) resolve(result)
      else reject(error)
    }
    const abort = () => finish(undefined, new DOMException('Request aborted', 'AbortError'))
    const timeout = setTimeout(
      () => finish(undefined, new Error('Room check timed out')),
      ROOM_CHECK_TIMEOUT_MS,
    )
    if (signal?.aborted) {
      abort()
      return
    }
    signal?.addEventListener('abort', abort, { once: true })
    void createTransport({
      signal: controller.signal,
      onConnection: (id) => {
        if (!settled && id === hostId) transport?.send(hostId, { type: 'ROOM_CHECK', payload: {} })
      },
      onMessage: (message) => {
        if (message.from !== hostId || message.type !== 'ROOM_AVAILABILITY') return
        const payload = message.payload
        if (typeof payload?.player !== 'boolean' || typeof payload?.spectator !== 'boolean') return
        finish({ player: payload.player, spectator: payload.spectator })
      },
      onError: (error) => finish(undefined, error),
      onDisconnect: (id) => {
        if (id === hostId) finish(undefined, new Error('Host disconnected'))
      },
    }).then(
      (opened) => {
        if (settled) {
          opened.close()
          return
        }
        transport = opened
        opened.connectTo(hostId)
      },
      (error: unknown) => finish(undefined, error),
    )
  })
}
