import type { ChatEntry } from '~/shared/chat/types'
import type { ChatController } from '../chat/controller'
import type { MatchController } from '../session/matchController'
import { isRelayable, relayTargets } from '../session/relay'
import type { PeerInfo, WireMessage } from '../types'
import { handleJoinRequest, handleReady, handleWhereabouts } from './host'
import { chatEntry, type Outgoing, playerKicked } from './messages'
import type { RoomRuntime } from './runtime'
import { applyConfig, applyPeerJoined, applyPeerLeft, applyPeerList } from './state'

export interface MessageController {
  handle(message: WireMessage): void
  hostPeerDisconnected(peerId: string): void
}

interface MessageControllerDependencies {
  runtime: RoomRuntime
  chat: ChatController
  match: MatchController
  dispatch(outgoing: Outgoing[]): void
  forgetStored(): void
  setStatus(status: 'kicked' | 'disbanded'): void
  leaveSession(): void
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function parseJoinRequestPayload(value: unknown): { name: string; resumeToken: string } | null {
  if (typeof value !== 'object' || value === null) return null
  const { name, resumeToken } = value as { name?: unknown; resumeToken?: unknown }
  if (!isNonEmptyString(name) || !isNonEmptyString(resumeToken)) return null
  return { name, resumeToken }
}

export function createMessageController({
  runtime,
  chat,
  match,
  dispatch,
  forgetStored,
  setStatus,
  leaveSession,
}: MessageControllerDependencies): MessageController {
  const hostPeerDisconnected = (peerId: string) => {
    const lobby = runtime.lobby
    if (!lobby || !runtime.isHost) return
    const leaving = lobby.peers[peerId]
    if (!leaving) return
    const resumeTokens = new Map(runtime.resumeTokens)
    resumeTokens.delete(peerId)
    runtime.replaceResumeTokens(resumeTokens)
    match.peerLeft(peerId)
    const next = applyPeerLeft(lobby, peerId)
    const stillConnected = Object.values(next.peers).some(
      (peer) => peer.memberId === leaving.memberId,
    )
    const entry = stillConnected ? null : chat.appendLeft(leaving)
    runtime.commitLobby(next)
    dispatch([playerKicked(peerId)])
    if (entry) chat.broadcast([entry])
  }

  const handleHostJoin = (message: Extract<WireMessage, { type: 'JOIN_REQUEST' }>) => {
    const lobby = runtime.lobby
    if (!lobby) return
    const liveGameId = runtime.gameId
    const payload = parseJoinRequestPayload((message as { payload?: unknown }).payload)
    if (!payload) {
      if (liveGameId) match.peerLeft(message.from)
      return
    }

    const privateSeat = liveGameId
      ? runtime.privateSeats.find(({ resumeToken }) => resumeToken === payload.resumeToken)
      : undefined
    if (liveGameId && !privateSeat) match.peerLeft(message.from)
    let joinState = lobby
    let replacedLobbyPeer: PeerInfo | undefined
    if (!liveGameId) {
      const credentialPeer = [...runtime.resumeTokens].find(
        ([peerId, resumeToken]) => peerId !== message.from && resumeToken === payload.resumeToken,
      )
      if (credentialPeer) {
        const existing = lobby.peers[credentialPeer[0]]
        if (!existing || existing.name !== payload.name) return
        replacedLobbyPeer = existing
        joinState = applyPeerLeft(lobby, existing.id)
        const resumeTokens = new Map(runtime.resumeTokens)
        resumeTokens.delete(existing.id)
        runtime.replaceResumeTokens(resumeTokens)
      }
      const resumeTokens = new Map(runtime.resumeTokens)
      resumeTokens.set(message.from, payload.resumeToken)
      runtime.replaceResumeTokens(resumeTokens)
    }

    const chatAdmission = chat.admit(payload.resumeToken)
    const previousRole = replacedLobbyPeer
      ? replacedLobbyPeer.role === 'guest'
        ? 'spectator'
        : replacedLobbyPeer.role
      : privateSeat
        ? 'player'
        : chat.lastKnownRole(chatAdmission.memberId)
    const admission = handleJoinRequest(
      joinState,
      message.from,
      chatAdmission.memberId,
      payload.name,
      {
        matchRunning: Boolean(liveGameId),
        returningSeat: privateSeat?.seat,
        returningLobbyPeer: replacedLobbyPeer,
      },
    )
    const admittedPeer = admission.state.peers[message.from]
    const nextRole = admittedPeer.role === 'guest' ? 'spectator' : admittedPeer.role
    const chatEntries: ChatEntry[] = [chat.appendJoin(admittedPeer, chatAdmission.isNew)]
    if (!chatAdmission.isNew && previousRole !== nextRole) {
      chatEntries.push(chat.appendRoleChange(admittedPeer))
    }

    runtime.commitLobby(admission.state)
    const outgoing: Outgoing[] = []
    if (replacedLobbyPeer) outgoing.push(playerKicked(replacedLobbyPeer.id))
    for (const frame of admission.outgoing) outgoing.push(frame)
    outgoing.push(chat.history(message.from, chatAdmission.memberId))
    for (const entry of chatEntries) outgoing.push(chatEntry(entry))
    dispatch(outgoing)

    const seat = privateSeat?.seat
    if (seat && liveGameId) {
      match.returnSeat({ seat, peerId: message.from, resumeToken: payload.resumeToken })
    }
    if (!liveGameId || seat) runtime.transport?.authenticate(message.from)
  }

  const handleHostMessage = (message: WireMessage) => {
    const lobby = runtime.lobby
    if (!lobby) return
    if (message.type === 'JOIN_REQUEST') {
      handleHostJoin(message)
      return
    }
    if (message.type === 'PLAYER_READY') {
      const result = handleReady(lobby, message.from)
      runtime.commitLobby(result.state)
      dispatch(result.outgoing)
      return
    }
    if (message.type === 'WHEREABOUTS') {
      const result = handleWhereabouts(lobby, message.from, message.payload.where)
      runtime.commitLobby(result.state)
      dispatch(result.outgoing)
      return
    }
    if (message.type === 'CHAT_SEND') {
      const peer = lobby.peers[message.from]
      if (!peer) return
      const entry = chat.appendUser(peer, message.payload.text)
      if (entry) chat.broadcast([entry])
      return
    }
    if (message.type === 'INTENT' || message.type === 'INTRO_READY') {
      match.receiveKeeperMessage(message)
      return
    }
    if (message.type === 'PICK_PREVIEW') runtime.commitPickPreview(message.payload)
    const transport = runtime.transport
    if (!transport || !isRelayable(message.type)) return
    const targets = relayTargets({
      connectedPeerIds: transport.connectedIds(),
      hostId: lobby.hostId,
      from: message.from,
    })
    transport.relay(targets, message)
  }

  const handleGuestMessage = (message: WireMessage) => {
    const lobby = runtime.lobby
    if (!lobby) return
    const fromHost = message.from === lobby.hostId
    switch (message.type) {
      case 'PICK_PREVIEW':
        runtime.commitPickPreview(message.payload)
        break
      case 'PEER_LIST':
        if (fromHost) runtime.commitLobby(applyPeerList(lobby, message.payload.peers))
        break
      case 'PEER_JOINED':
        if (fromHost) runtime.commitLobby(applyPeerJoined(lobby, { ...message.payload }))
        break
      case 'LOBBY_CONFIG_UPDATED':
        if (fromHost) runtime.commitLobby(applyConfig(lobby, message.payload))
        break
      case 'CHAT_HISTORY':
        if (fromHost) chat.receiveHistory(message.payload.entries, message.payload.selfMemberId)
        break
      case 'CHAT_ENTRY':
        if (fromHost) chat.receiveEntry(message.payload.entry)
        break
      case 'PLAYER_KICKED':
        if (!fromHost) break
        if (message.payload.peerId === lobby.selfId) {
          setStatus('kicked')
          forgetStored()
          chat.clearRoom()
        } else {
          runtime.commitLobby(applyPeerLeft(lobby, message.payload.peerId))
        }
        break
      case 'GAME_STARTING':
        if (fromHost) match.followStart(message.payload.gameId, message.payload.seats ?? [])
        break
      case 'SEAT_REBOUND':
        if (fromHost) match.reboundSeat(message.payload.playerId, message.payload.peerId)
        break
      case 'SYNC':
      case 'KEEPER_CHANGED':
        match.receiveSync(message)
        break
      case 'LOBBY_DISBANDED':
        if (fromHost) {
          leaveSession()
          setStatus('disbanded')
        }
        break
      default:
        break
    }
  }

  return {
    handle(message) {
      if (!runtime.lobby) return
      if (runtime.isHost) handleHostMessage(message)
      else handleGuestMessage(message)
    },
    hostPeerDisconnected,
  }
}
