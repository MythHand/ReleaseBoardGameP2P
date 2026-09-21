import type { ChatEntry, ChatRole, MemberId } from '~/shared/chat/types'
import { chatEntry, chatHistory, chatSend, type Outgoing } from '../lobby/messages'
import type { RoomRuntime } from '../lobby/runtime'
import type { LobbyState } from '../lobby/state'
import type { PeerInfo, Setup } from '../types'
import { normalizeChatText } from './journal'
import type { ChatAdmission, ChatSessionModel } from './useChatSession'

export interface ChatController {
  admit(clientId: string): ChatAdmission
  appendJoin(peer: PeerInfo, isNew: boolean): ChatEntry
  appendReconnect(peer: PeerInfo): ChatEntry
  appendRoleChange(peer: PeerInfo): ChatEntry
  appendLeft(peer: PeerInfo): ChatEntry
  appendKicked(peer: PeerInfo): ChatEntry
  appendModeChanges(before: Setup, after: Setup): ChatEntry[]
  appendCapacityRoleChanges(before: LobbyState, after: LobbyState): ChatEntry[]
  appendUser(peer: PeerInfo, text: unknown): ChatEntry | null
  lastKnownRole(memberId: MemberId): ChatRole | undefined
  history(to: string, memberId: MemberId): Outgoing
  broadcast(entries: ChatEntry[]): void
  receiveHistory(entries: ChatEntry[], memberId: MemberId): void
  receiveEntry(entry: ChatEntry): void
  send(text: string): boolean
  clearRoom(): void
}

interface ChatControllerDependencies {
  runtime: RoomRuntime
  session: Pick<
    ChatSessionModel,
    | 'admit'
    | 'appendUser'
    | 'appendSystem'
    | 'history'
    | 'receiveHistory'
    | 'receiveEntry'
    | 'clearRoom'
  >
  dispatch(outgoing: Outgoing[]): void
  canSendAsGuest?: () => boolean
}

export function toChatRole(role: PeerInfo['role']): ChatRole {
  return role === 'guest' ? 'spectator' : role
}

export function createChatController({
  runtime,
  session,
  dispatch,
  canSendAsGuest = () => true,
}: ChatControllerDependencies): ChatController {
  const appendReconnect = (peer: PeerInfo) =>
    session.appendSystem({
      kind: 'memberReconnected',
      memberId: peer.memberId,
      name: peer.name,
    })

  const appendRoleChange = (peer: PeerInfo) =>
    session.appendSystem({
      kind: 'roleChanged',
      memberId: peer.memberId,
      name: peer.name,
      role: toChatRole(peer.role),
    })

  const controller: ChatController = {
    admit(clientId) {
      return session.admit(clientId)
    },

    appendJoin(peer, isNew) {
      if (!isNew) return appendReconnect(peer)
      return session.appendSystem({
        kind: 'memberJoined',
        memberId: peer.memberId,
        name: peer.name,
        role: toChatRole(peer.role),
      })
    },

    appendReconnect,
    appendRoleChange,

    appendLeft(peer) {
      return session.appendSystem({
        kind: 'memberLeft',
        memberId: peer.memberId,
        name: peer.name,
      })
    },

    appendKicked(peer) {
      return session.appendSystem({
        kind: 'memberKicked',
        memberId: peer.memberId,
        name: peer.name,
      })
    },

    appendModeChanges(before, after) {
      const entries: ChatEntry[] = []
      for (const setting of Object.keys(after)) {
        if (before[setting] === after[setting]) continue
        entries.push(
          session.appendSystem({
            kind: 'modeChanged',
            setting,
            value: after[setting],
          }),
        )
      }
      return entries
    },

    appendCapacityRoleChanges(before, after) {
      const entries: ChatEntry[] = []
      const changedMembers = new Set<string>()
      for (const peer of Object.values(after.peers)) {
        if (changedMembers.has(peer.memberId)) continue
        const previous = Object.values(before.peers).find(
          (candidate) => candidate.memberId === peer.memberId,
        )
        if (!previous || previous.role === peer.role) continue
        changedMembers.add(peer.memberId)
        entries.push(appendRoleChange(peer))
      }
      return entries
    },

    appendUser(peer, value) {
      if (typeof value !== 'string') return null
      const text = normalizeChatText(value)
      if (!text) return null
      return session.appendUser(
        { memberId: peer.memberId, name: peer.name, role: toChatRole(peer.role) },
        text,
      )
    },

    lastKnownRole(memberId) {
      let role: ChatRole | undefined
      for (const entry of session.history()) {
        if (entry.kind === 'message' && entry.author.memberId === memberId) {
          role = entry.author.role
        } else if (
          entry.kind === 'system' &&
          entry.event.kind === 'memberJoined' &&
          entry.event.memberId === memberId
        ) {
          role = entry.event.role
        } else if (
          entry.kind === 'system' &&
          entry.event.kind === 'roleChanged' &&
          entry.event.memberId === memberId
        ) {
          role = entry.event.role
        }
      }
      return role
    },

    history(to, memberId) {
      return chatHistory(to, session.history(), memberId)
    },

    broadcast(entries) {
      const outgoing: Outgoing[] = []
      for (const entry of entries) outgoing.push(chatEntry(entry))
      dispatch(outgoing)
    },

    receiveHistory(entries, memberId) {
      session.receiveHistory(entries, memberId)
    },

    receiveEntry(entry) {
      session.receiveEntry(entry)
    },

    send(rawText) {
      const text = normalizeChatText(rawText)
      const transport = runtime.transport
      const lobby = runtime.lobby
      if (!text || !transport || !lobby) return false

      if (runtime.isHost) {
        const peer = lobby.peers[lobby.selfId]
        if (!peer) return false
        const entry = controller.appendUser(peer, text)
        if (!entry) return false
        dispatch([chatEntry(entry)])
        return true
      }

      if (!canSendAsGuest()) return false
      dispatch([chatSend(lobby.hostId, text)])
      return true
    },

    clearRoom() {
      session.clearRoom()
    },
  }

  return controller
}
