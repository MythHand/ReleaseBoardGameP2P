import type { ChatController } from '../chat/controller'
import type { Setup, Where } from '../types'
import {
  disbandLobby,
  handleReady,
  handleWhereabouts,
  kick as kickPeer,
  transferHost as requestHostTransfer,
  setBots as updateBots,
  setMaxPlayers as updateMaxPlayers,
} from './host'
import { lobbyConfigUpdated, type Outgoing, playerReady, whereabouts } from './messages'
import type { RoomRuntime } from './runtime'
import { applyConfig, type LobbyState } from './state'

export const DISBAND_FLUSH_MS = 200

export interface LobbyActionsController {
  ready(): void
  setWhere(where: Where): void
  kick(peerId: string): void
  setMaxPlayers(maxPlayers: number): void
  setBots(bots: number): void
  transferHost(peerId: string): void
  setSetup(setup: Setup): void
  disband(): void
}

interface LobbyActionsDependencies {
  runtime: RoomRuntime
  chat: ChatController
  dispatch(outgoing: Outgoing[]): void
  rememberLobbyConfig(lobby: LobbyState): void
  leaveSession(flushMs?: number): void
}

export function createLobbyActionsController({
  runtime,
  chat,
  dispatch,
  rememberLobbyConfig,
  leaveSession,
}: LobbyActionsDependencies): LobbyActionsController {
  return {
    ready() {
      const transport = runtime.transport
      const lobby = runtime.lobby
      if (!transport || !lobby) return
      if (runtime.isHost) {
        const result = handleReady(lobby, lobby.selfId)
        runtime.commitLobby(result.state)
        dispatch(result.outgoing)
        return
      }
      dispatch([playerReady(lobby.hostId)])
    },

    setWhere(where) {
      const transport = runtime.transport
      const lobby = runtime.lobby
      if (!transport || !lobby) return
      if (runtime.isHost) {
        const result = handleWhereabouts(lobby, lobby.selfId, where)
        runtime.commitLobby(result.state)
        dispatch(result.outgoing)
        return
      }
      dispatch([whereabouts(lobby.hostId, where)])
    },

    kick(peerId) {
      const lobby = runtime.lobby
      if (!lobby || !runtime.isHost) return
      const peer = lobby.peers[peerId]
      if (!peer) return
      const resumeTokens = new Map(runtime.resumeTokens)
      resumeTokens.delete(peerId)
      runtime.replaceResumeTokens(resumeTokens)
      const result = kickPeer(lobby, peerId)
      const entry = chat.appendKicked(peer)
      runtime.commitLobby(result.state)
      dispatch(result.outgoing)
      chat.broadcast([entry])
    },

    setMaxPlayers(maxPlayers) {
      const lobby = runtime.lobby
      if (!lobby || !runtime.isHost) return
      const result = updateMaxPlayers(lobby, maxPlayers)
      const entries = chat.appendCapacityRoleChanges(lobby, result.state)
      runtime.commitLobby(result.state)
      rememberLobbyConfig(result.state)
      dispatch(result.outgoing)
      chat.broadcast(entries)
    },

    setBots(bots) {
      const lobby = runtime.lobby
      if (!lobby || !runtime.isHost) return
      const result = updateBots(lobby, bots)
      runtime.commitLobby(result.state)
      rememberLobbyConfig(result.state)
      dispatch(result.outgoing)
    },

    transferHost(peerId) {
      const lobby = runtime.lobby
      if (!lobby || !runtime.isHost) return
      dispatch(requestHostTransfer(lobby, peerId).outgoing)
    },

    setSetup(setup) {
      const lobby = runtime.lobby
      if (!lobby || !runtime.isHost) return
      const entries = chat.appendModeChanges(lobby.setup, setup)
      const next = applyConfig(lobby, { setup })
      runtime.commitLobby(next)
      rememberLobbyConfig(next)
      dispatch([lobbyConfigUpdated('broadcast', { setup })])
      chat.broadcast(entries)
    },

    disband() {
      const lobby = runtime.lobby
      if (!lobby || !runtime.isHost) return
      dispatch(disbandLobby(lobby).outgoing)
      leaveSession(DISBAND_FLUSH_MS)
    },
  }
}
