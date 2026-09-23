import { createFakeEngine } from '@release/engine/fake'
import { DEFAULT_SETUP } from '@release/ui'
import {
  clearKeeper,
  clearLog,
  clearSession,
  getResumeToken,
  readKeeper,
  readSession,
  type StoredLobbyConfig,
  type StoredSession,
  writeSession,
} from '~/shared/lib/persistence'
import type { ChatController } from '../chat/controller'
import type { ChatSessionModel } from '../chat/useChatSession'
import type { MatchController } from '../session/matchController'
import {
  type KeeperWriter,
  normalizeKeeperSnapshot,
  normalizeLobbyConfig,
} from '../session/persistence'
import { backoffMs, MAX_RECONNECT_ATTEMPTS, type ReconnectEvent } from '../session/reconnect'
import { createTransport, type Transport } from '../transport/peer'
import type { Setup } from '../types'
import type { MessageController } from './messageController'
import { joinRequest } from './messages'
import { formatRoomCode, makeRoomCode, parseRoomCode } from './roomCode'
import type { RoomRuntime } from './runtime'
import { applyPeerLeft, createLobbyState, type LobbyState } from './state'

export type LobbyStatus = 'idle' | 'connecting' | 'in-lobby' | 'kicked' | 'disbanded' | 'error'
export type ErrorKind = 'not-found' | 'connection' | null
export type DialOutcome = { ok: true } | { ok: false; error: unknown }

export interface ConnectionViewPort {
  status(next: LobbyStatus): void
  restoring(next: boolean): void
  error(message: string | null, kind: ErrorKind): void
  hostConnected?(next: boolean): void
  reconnect(next: {
    status: 'idle' | 'trying' | 'failed'
    attempt: number
    events: ReconnectEvent[]
  }): void
}

export interface ConnectionController {
  createRoom(name: string, maxPlayers: number, setup?: Setup): Promise<string>
  joinRoom(
    code: string,
    name: string,
    onDialOutcome?: (outcome: DialOutcome) => void,
    preserveSession?: boolean,
  ): Promise<string>
  restoreOnMount(): Promise<void>
  retryReconnect(): void
  disconnect(peerId: string): void
  leaveSession(flushMs?: number): void
  clearError(): void
}

interface ConnectionControllerDependencies {
  runtime: RoomRuntime
  message: MessageController
  match: MatchController
  chat: ChatController
  chatSession: Pick<ChatSessionModel, 'startHost' | 'restoreHost'>
  keeperWriter: KeeperWriter
  view: ConnectionViewPort
}

function classify(type?: string): Exclude<ErrorKind, null> {
  return type === 'peer-unavailable' ? 'not-found' : 'connection'
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

export function createConnectionController({
  runtime,
  message,
  match,
  chat,
  chatSession,
  keeperWriter,
  view,
}: ConnectionControllerDependencies): ConnectionController {
  let hostConnected = false
  let reconnectSession: StoredSession | null = null
  let reconnectStatus: 'idle' | 'trying' | 'failed' = 'idle'
  let reconnectEvents: ReconnectEvent[] = []
  let reconnectAttempt = 0
  let reconnectDial = 0
  let currentStatus: LobbyStatus = 'idle'
  let currentError: string | null = null
  let currentErrorKind: ErrorKind = null
  let reconnectPending: {
    token: number
    settle: (outcome: DialOutcome) => void
  } | null = null

  const publishReconnect = () => {
    view.reconnect({ status: reconnectStatus, attempt: reconnectAttempt, events: reconnectEvents })
  }
  const publishStatus = (next: LobbyStatus) => {
    currentStatus = next
    view.status(next)
  }
  const publishError = (next: string | null, kind: ErrorKind) => {
    currentError = next
    currentErrorKind = kind
    view.error(next, kind)
  }
  const setHostConnected = (next: boolean) => {
    hostConnected = next
    view.hostConnected?.(next)
  }
  const resetReconnect = () => {
    reconnectStatus = 'idle'
    reconnectAttempt = 0
    reconnectEvents = []
    publishReconnect()
  }
  const pushReconnectEvent = (kind: ReconnectEvent['kind'], attempt: number) => {
    reconnectEvents = [...reconnectEvents, { kind, attempt, at: Date.now() }]
    publishReconnect()
  }
  const surfaceError = (error: { type?: string; message: string }) => {
    const text = error.type ? `${error.type}: ${error.message}` : error.message
    publishError(text, classify(error.type))
    if (error.type !== 'connection' || currentStatus === 'connecting') publishStatus('error')
  }
  const surfaceSetupError = (error: unknown) => {
    const value = error as { type?: string; message?: string }
    const errorMessage = value?.message ?? String(error)
    publishError(
      value?.type ? `${value.type}: ${errorMessage}` : errorMessage,
      classify(value?.type),
    )
    publishStatus('error')
  }
  const rememberLobbyConfig = (lobby: LobbyState) => {
    const stored = readSession()
    if (stored?.role !== 'host') return
    const lobbyConfig: StoredLobbyConfig = {
      maxPlayers: lobby.maxPlayers,
      setup: lobby.setup,
      bots: lobby.bots,
    }
    writeSession({ ...stored, lobbyConfig })
  }

  const leaveSession = (flushMs?: number) => {
    const transport = runtime.invalidateSession()
    reconnectSession = null
    reconnectPending?.settle({ ok: false, error: new Error('session left') })
    reconnectPending = null
    resetReconnect()
    setHostConnected(false)
    runtime.commitLobby(null)
    publishStatus('idle')
    view.restoring(false)
    runtime.commitRoomCode(null)
    publishError(null, null)
    runtime.commitGameId(null)
    match.teardownRoom()
    runtime.replaceResumeTokens(new Map())
    keeperWriter.cancel()
    clearSession()
    clearKeeper()
    chat.clearRoom()
    clearLog()
    if (!transport) return
    if (flushMs) setTimeout(() => transport.close(), flushMs)
    else transport.close()
  }

  const joinRoom: ConnectionController['joinRoom'] = async (
    code,
    name,
    onDialOutcome,
    preserveSession = false,
  ) => {
    if (preserveSession) {
      const resources = runtime.matchResources
      resources.remote?.link.close()
      runtime.setMatchResources({ ...resources, remote: null })
      runtime.commitGameLink(null)
      runtime.detachTransport()?.close()
    } else {
      leaveSession()
    }
    const attempt = runtime.beginTransportAttempt()
    publishStatus('connecting')
    publishError(null, null)
    setHostConnected(false)
    const hostId = parseRoomCode(code)
    const roomCode = formatRoomCode(hostId)
    let owner: Transport | null = null
    const ownsTransport = () => runtime.ownsTransport(attempt, owner)
    try {
      const transport = await createTransport({
        onMessage: (frame) => {
          if (ownsTransport()) message.handle(frame)
        },
        onError: (error) => {
          if (!ownsTransport()) return
          surfaceError(error)
          onDialOutcome?.({ ok: false, error })
        },
        onDisconnect: (peerId) => {
          if (!ownsTransport()) return
          controller.disconnect(peerId)
          onDialOutcome?.({ ok: false, error: new Error('host disconnected') })
        },
        onConnection: (peerId) => {
          if (!ownsTransport() || peerId !== hostId) return
          setHostConnected(true)
          if (owner) owner.send(hostId, joinRequest(hostId, name, getResumeToken(roomCode)).message)
          publishStatus('in-lobby')
          onDialOutcome?.({ ok: true })
        },
      })
      owner = transport
      if (!runtime.attachTransport(attempt, transport, false)) {
        transport.close()
        throw new Error('join cancelled')
      }
      runtime.commitRoomCode(roomCode)
      runtime.commitLobby(
        createLobbyState({
          selfId: transport.id,
          hostId,
          maxPlayers: 6,
          setup: DEFAULT_SETUP,
          peers: [
            {
              id: transport.id,
              memberId: transport.id,
              name,
              role: 'guest',
              ready: false,
              where: 'lobby',
            },
          ],
        }),
      )
      writeSession({
        roomCode,
        name,
        role: 'guest',
        gameId: preserveSession ? (runtime.gameId ?? readSession()?.gameId ?? null) : null,
        joinedAt: Date.now(),
      })
      transport.connectTo(hostId)
      return roomCode
    } catch (error) {
      if (!runtime.ownsTransport(attempt, owner)) throw error
      surfaceSetupError(error)
      throw error
    }
  }

  const runGuestReconnect = async () => {
    const stored = reconnectSession
    if (!stored) return
    const reconnect = runtime.beginReconnectAttempt()
    reconnectStatus = 'trying'
    reconnectAttempt = 0
    reconnectEvents = []
    publishReconnect()

    for (let attempt = 1; attempt <= MAX_RECONNECT_ATTEMPTS; attempt += 1) {
      if (!runtime.ownsReconnect(reconnect)) return
      reconnectAttempt = attempt
      publishReconnect()
      pushReconnectEvent('dialing', attempt)
      const dialToken = ++reconnectDial
      let settledAlready = false
      let resolveAttempt: (() => void) | undefined
      let rejectAttempt: ((error: unknown) => void) | undefined
      const settled = new Promise<void>((resolve, reject) => {
        resolveAttempt = resolve
        rejectAttempt = reject
      })
      const settleAttempt = (outcome: DialOutcome) => {
        if (settledAlready) return
        settledAlready = true
        if (outcome.ok) resolveAttempt?.()
        else rejectAttempt?.(outcome.error)
      }
      reconnectPending = { token: dialToken, settle: settleAttempt }
      let connected = false
      try {
        await joinRoom(stored.roomCode, stored.name, settleAttempt, true)
        if (runtime.ownsReconnect(reconnect)) {
          await settled
          connected = true
        }
      } catch {
        // This attempt failed; retry policy below owns the next step.
      } finally {
        if (reconnectPending?.token === dialToken) reconnectPending = null
      }
      if (!runtime.ownsReconnect(reconnect)) return
      if (connected) {
        pushReconnectEvent('channel-open', attempt)
        pushReconnectEvent('handshake', attempt)
        reconnectSession = null
        reconnectStatus = 'idle'
        publishReconnect()
        return
      }
      if (attempt === MAX_RECONNECT_ATTEMPTS) {
        pushReconnectEvent('failed', attempt)
        reconnectStatus = 'failed'
        publishReconnect()
        return
      }
      pushReconnectEvent('backoff', attempt)
      await new Promise((resolve) => setTimeout(resolve, backoffMs(attempt)))
    }
  }

  const restoreHost = async (): Promise<boolean> => {
    const stored = readSession()
    const snapshot = readKeeper()
    if (stored?.role !== 'host') return false
    const rejectStored = () => {
      clearKeeper()
      clearSession()
      return false
    }
    if (!isNonEmptyString(stored.roomCode)) return rejectStored()
    const hostPeerId = parseRoomCode(stored.roomCode)
    if (!hostPeerId) return rejectStored()
    const engine = stored.gameId ? createFakeEngine() : null
    const normalized =
      stored.gameId && snapshot && engine
        ? normalizeKeeperSnapshot(snapshot, stored.gameId, hostPeerId, engine)
        : null
    if (stored.gameId && !normalized) return rejectStored()
    if (!stored.gameId) clearKeeper()
    const transportAttempt = runtime.beginTransportAttempt()
    let owner: Transport | null = null
    const ownsTransport = () => runtime.ownsTransport(transportAttempt, owner)
    publishStatus('connecting')
    publishError(null, null)
    view.restoring(true)
    try {
      let transport: Transport | null = null
      let lastError: unknown
      for (let attempt = 1; attempt <= MAX_RECONNECT_ATTEMPTS; attempt += 1) {
        try {
          transport = await createTransport({
            peerId: hostPeerId,
            onMessage: (frame) => {
              if (ownsTransport()) message.handle(frame)
            },
            onError: (error) => {
              if (ownsTransport()) surfaceError(error)
            },
            onDisconnect: (peerId) => {
              if (ownsTransport()) controller.disconnect(peerId)
            },
          })
          owner = transport
          break
        } catch (error) {
          lastError = error
          if (attempt === MAX_RECONNECT_ATTEMPTS) break
          await new Promise((resolve) => setTimeout(resolve, backoffMs(attempt)))
        }
      }
      if (!transport) {
        if (runtime.ownsTransport(transportAttempt, owner)) surfaceSetupError(lastError)
        return false
      }
      if (!runtime.attachTransport(transportAttempt, transport, true)) {
        transport.close()
        return false
      }
      runtime.commitRoomCode(stored.roomCode)
      const hostToken = getResumeToken(stored.roomCode)
      const hostMemberId = chatSession.restoreHost(stored.roomCode, hostToken)
      if (!stored.gameId) {
        const config = normalizeLobbyConfig(stored.lobbyConfig)
        runtime.commitSeats([], [])
        runtime.replaceResumeTokens(new Map([[transport.id, hostToken]]))
        const lobby = createLobbyState({
          selfId: transport.id,
          hostId: transport.id,
          maxPlayers: config?.maxPlayers ?? 6,
          bots: config?.bots ?? 0,
          setup: config?.setup ?? DEFAULT_SETUP,
          peers: [
            {
              id: transport.id,
              memberId: hostMemberId,
              name: stored.name,
              role: 'host',
              ready: true,
              where: 'lobby',
            },
          ],
        })
        runtime.commitLobby(lobby)
        rememberLobbyConfig(lobby)
        runtime.commitGameId(null)
        publishStatus('in-lobby')
        return true
      }
      if (!normalized || !engine) {
        transport.close()
        return rejectStored()
      }
      const config = normalized.lobbyConfig
      runtime.commitLobby(
        createLobbyState({
          selfId: transport.id,
          hostId: transport.id,
          maxPlayers: config?.maxPlayers ?? 6,
          bots: config?.bots ?? 0,
          setup: config?.setup ?? normalized.state.setup,
          peers: [
            {
              id: transport.id,
              memberId: hostMemberId,
              name: stored.name,
              role: 'host',
              ready: true,
              where: 'game',
            },
          ],
        }),
      )
      match.attachRestored({ snapshot: normalized, engine, transport })
      publishStatus('in-lobby')
      return true
    } finally {
      view.restoring(false)
    }
  }

  const controller: ConnectionController = {
    async createRoom(name, maxPlayers, setup) {
      leaveSession()
      const attempt = runtime.beginTransportAttempt()
      let owner: Transport | null = null
      const ownsTransport = () => runtime.ownsTransport(attempt, owner)
      publishStatus('connecting')
      publishError(null, null)
      try {
        const transport = await createTransport({
          peerId: makeRoomCode(),
          onMessage: (frame) => {
            if (ownsTransport()) message.handle(frame)
          },
          onError: (error) => {
            if (ownsTransport()) surfaceError(error)
          },
          onDisconnect: (peerId) => {
            if (ownsTransport()) controller.disconnect(peerId)
          },
        })
        owner = transport
        if (!runtime.attachTransport(attempt, transport, true)) {
          transport.close()
          throw new Error('create cancelled')
        }
        const roomCode = formatRoomCode(transport.id)
        runtime.commitRoomCode(roomCode)
        const hostToken = getResumeToken(roomCode)
        const memberId = chatSession.startHost(roomCode, hostToken)
        runtime.replaceResumeTokens(new Map([[transport.id, hostToken]]))
        runtime.commitSeats([], [])
        const lobby = createLobbyState({
          selfId: transport.id,
          hostId: transport.id,
          maxPlayers,
          setup: setup ?? DEFAULT_SETUP,
          peers: [
            {
              id: transport.id,
              memberId,
              name,
              role: 'host',
              ready: true,
              where: 'lobby',
            },
          ],
        })
        runtime.commitLobby(lobby)
        writeSession({
          roomCode,
          name,
          role: 'host',
          gameId: null,
          joinedAt: Date.now(),
          lobbyConfig: { maxPlayers: lobby.maxPlayers, setup: lobby.setup, bots: lobby.bots },
        })
        publishStatus('in-lobby')
        return roomCode
      } catch (error) {
        if (!runtime.ownsTransport(attempt, owner)) {
          if (error instanceof Error && error.message === 'create cancelled') throw error
          throw new Error('create cancelled')
        }
        surfaceSetupError(error)
        throw error
      }
    },

    joinRoom,

    async restoreOnMount() {
      if (await restoreHost()) return
      const stored = readSession()
      if (stored?.role !== 'guest') return
      reconnectSession = stored
      await runGuestReconnect()
    },

    retryReconnect() {
      if (reconnectStatus !== 'trying' && reconnectStatus !== 'failed') return
      void runGuestReconnect()
    },

    disconnect(peerId) {
      const lobby = runtime.lobby
      if (!lobby) return
      if (runtime.isHost) {
        message.hostPeerDisconnected(peerId)
        return
      }
      if (peerId !== lobby.hostId) {
        runtime.commitLobby(applyPeerLeft(lobby, peerId))
        return
      }
      const stored = readSession()
      if (hostConnected && stored?.role === 'guest') {
        reconnectSession = stored
        void runGuestReconnect()
        return
      }
      if (hostConnected) publishError('disconnected: host left the lobby', 'connection')
      else if (currentError === null) {
        publishError('could not connect to the lobby', currentErrorKind ?? 'connection')
      }
      publishStatus('error')
    },

    leaveSession,

    clearError() {
      publishError(null, null)
      if (currentStatus === 'error') publishStatus('idle')
    },
  }

  return controller
}
