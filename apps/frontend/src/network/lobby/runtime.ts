import type { PlayerId } from '@release/engine'
import type { PrivateSeat } from '~/entities/game/seats'
import type { GameLink, Sync } from '../session/link'
import type { KeeperWriter } from '../session/persistence'
import type { SessionRef } from '../session/referee'
import type { KeeperHandle, RemoteHandle } from '../session/remoteLink'
import type { StartGate } from '../session/startGate'
import type { Transport } from '../transport/peer'
import type { Seat } from '../types'
import type { LobbyState } from './state'

export interface TransportAttempt {
  generation: number
  sessionEpoch: number
}

export interface ReconnectAttempt {
  reconnectEpoch: number
  sessionEpoch: number
}

export interface PickPreview {
  gameId: string
  player: PlayerId
  card: string | null
}

export interface MatchResources {
  sessionRef: SessionRef | null
  keeper: KeeperHandle | null
  remote: RemoteHandle | null
  gate: StartGate | null
}

export interface RoomViewPort {
  lobby(next: LobbyState | null): void
  host(next: boolean): void
  roomCode(next: string | null): void
  gameId(next: string | null): void
  seats(next: Seat[]): void
  gameLink(next: GameLink | null): void
  gameSync(next: Sync | null): void
  pickPreview(next: PickPreview | null): void
}

export interface RoomRuntime {
  readonly lobby: LobbyState | null
  readonly isHost: boolean
  readonly transport: Transport | null
  readonly gameId: string | null
  readonly seats: Seat[]
  readonly privateSeats: PrivateSeat[]
  readonly resumeTokens: ReadonlyMap<string, string>
  readonly matchResources: Readonly<MatchResources>
  readonly sessionEpoch: number
  readonly reconnectEpoch: number
  beginTransportAttempt(): TransportAttempt
  beginReconnectAttempt(): ReconnectAttempt
  ownsTransport(attempt: TransportAttempt, owner: Transport | null): boolean
  ownsReconnect(attempt: ReconnectAttempt): boolean
  attachTransport(attempt: TransportAttempt, transport: Transport, host: boolean): boolean
  detachTransport(): Transport | null
  commitLobby(next: LobbyState | null): void
  commitRoomCode(next: string | null): void
  commitGameId(next: string | null): void
  commitSeats(next: Seat[], privateSeats?: PrivateSeat[]): void
  commitGameLink(next: GameLink | null): void
  commitGameSync(next: Sync | null): void
  commitPickPreview(next: PickPreview | null): void
  replaceResumeTokens(next: Map<string, string>): void
  setMatchResources(resources: MatchResources): void
  closeMatchResources(options: { clearView: boolean }): void
  invalidateSession(): Transport | null
}

const EMPTY_MATCH_RESOURCES: MatchResources = {
  sessionRef: null,
  keeper: null,
  remote: null,
  gate: null,
}

export function createRoomRuntime(viewPort: RoomViewPort, keeperWriter: KeeperWriter): RoomRuntime {
  let lobby: LobbyState | null = null
  let isHost = false
  let transport: Transport | null = null
  let gameId: string | null = null
  let seats: Seat[] = []
  let privateSeats: PrivateSeat[] = []
  let resumeTokens = new Map<string, string>()
  let matchResources: MatchResources = EMPTY_MATCH_RESOURCES
  let transportGeneration = 0
  let sessionEpoch = 0
  let reconnectEpoch = 0

  const runtime: RoomRuntime = {
    get lobby() {
      return lobby
    },
    get isHost() {
      return isHost
    },
    get transport() {
      return transport
    },
    get gameId() {
      return gameId
    },
    get seats() {
      return seats
    },
    get privateSeats() {
      return privateSeats
    },
    get resumeTokens() {
      return resumeTokens
    },
    get matchResources() {
      return matchResources
    },
    get sessionEpoch() {
      return sessionEpoch
    },
    get reconnectEpoch() {
      return reconnectEpoch
    },

    beginTransportAttempt() {
      transportGeneration += 1
      return { generation: transportGeneration, sessionEpoch }
    },

    beginReconnectAttempt() {
      reconnectEpoch += 1
      return { reconnectEpoch, sessionEpoch }
    },

    ownsTransport(attempt, owner) {
      return (
        attempt.generation === transportGeneration &&
        attempt.sessionEpoch === sessionEpoch &&
        transport === owner
      )
    },

    ownsReconnect(attempt) {
      return attempt.reconnectEpoch === reconnectEpoch && attempt.sessionEpoch === sessionEpoch
    },

    attachTransport(attempt, next, host) {
      if (attempt.generation !== transportGeneration || attempt.sessionEpoch !== sessionEpoch) {
        return false
      }
      transport = next
      isHost = host
      viewPort.host(host)
      return true
    },

    detachTransport() {
      transportGeneration += 1
      const detached = transport
      transport = null
      return detached
    },

    commitLobby(next) {
      lobby = next
      viewPort.lobby(next)
    },

    commitRoomCode(next) {
      viewPort.roomCode(next)
    },

    commitGameId(next) {
      gameId = next
      viewPort.gameId(next)
    },

    commitSeats(next, nextPrivateSeats) {
      seats = next
      if (nextPrivateSeats !== undefined) privateSeats = nextPrivateSeats
      viewPort.seats(next)
    },

    commitGameLink(next) {
      viewPort.gameLink(next)
    },

    commitGameSync(next) {
      viewPort.gameSync(next)
    },

    commitPickPreview(next) {
      viewPort.pickPreview(next)
    },

    replaceResumeTokens(next) {
      resumeTokens = next
    },

    setMatchResources(next) {
      matchResources = next
    },

    closeMatchResources({ clearView }) {
      const current = matchResources
      matchResources = EMPTY_MATCH_RESOURCES
      current.gate?.cancel()
      current.keeper?.close()
      current.remote?.link.close()
      keeperWriter.cancel()
      if (clearView) {
        runtime.commitGameLink(null)
        runtime.commitGameSync(null)
        runtime.commitPickPreview(null)
      }
    },

    invalidateSession() {
      transportGeneration += 1
      sessionEpoch += 1
      reconnectEpoch += 1
      const detached = transport
      transport = null
      isHost = false
      viewPort.host(false)
      return detached
    },
  }

  return runtime
}
