import { useCallback, useRef, useState } from 'react'
import type { ChatAuthor, ChatEntry, ChatSystemEvent, MemberId } from '~/shared/chat/types'
import { clearChat, readChat, writeChat } from '~/shared/lib/persistence'
import {
  admitMember,
  appendSystemEvent,
  appendUserMessage,
  type ChatJournal,
  emptyChatJournal,
  mergeChatEntries,
  parseChatEntries,
  parseChatJournal,
} from './journal'

export interface ChatAdmission {
  memberId: MemberId
  isNew: boolean
}

export interface ChatSessionModel {
  entries: ChatEntry[]
  notificationEntryIds: string[]
  selfMemberId: MemberId | null
  startHost(roomCode: string, clientId: string): MemberId
  restoreHost(roomCode: string, clientId: string): MemberId
  admit(clientId: string): ChatAdmission
  appendUser(author: ChatAuthor, text: string): ChatEntry | null
  appendSystem(event: ChatSystemEvent): ChatEntry
  history(): ChatEntry[]
  receiveHistory(entries: ChatEntry[], selfMemberId: MemberId): void
  receiveEntry(entry: ChatEntry): void
  clearRoom(): void
}

export interface RoomChatState {
  entries: ChatEntry[]
  notificationEntryIds: string[]
  selfMemberId: MemberId | null
  send(text: string): boolean
}

export function useChatSession(): ChatSessionModel {
  const [entries, setEntries] = useState<ChatEntry[]>([])
  const [notificationEntryIds, setNotificationEntryIds] = useState<string[]>([])
  const [selfMemberId, setSelfMemberId] = useState<MemberId | null>(null)
  const journalRef = useRef<ChatJournal>(emptyChatJournal())
  const hostRoomCodeRef = useRef<string | null>(null)

  const publish = useCallback((journal: ChatJournal) => {
    journalRef.current = journal
    setEntries(journal.entries)
  }, [])

  const persistHost = useCallback((journal: ChatJournal) => {
    const roomCode = hostRoomCodeRef.current
    if (!roomCode) return
    writeChat({
      roomCode,
      entries: journal.entries,
      nextSequence: journal.nextSequence,
      members: Object.entries(journal.memberIdsByClientId).map(([clientId, memberId]) => ({
        clientId,
        memberId,
      })),
      savedAt: Date.now(),
    })
  }, [])

  const startHost = useCallback(
    (roomCode: string, clientId: string): MemberId => {
      hostRoomCodeRef.current = roomCode
      const admission = admitMember(emptyChatJournal(), clientId)
      publish(admission.journal)
      setNotificationEntryIds([])
      setSelfMemberId(admission.memberId)
      persistHost(admission.journal)
      return admission.memberId
    },
    [persistHost, publish],
  )

  const restoreHost = useCallback(
    (roomCode: string, clientId: string): MemberId => {
      hostRoomCodeRef.current = roomCode
      const stored = readChat(roomCode)
      const restored = stored ? restoreJournal(stored) : null
      if (stored && !restored) clearChat()
      const admission = admitMember(restored ?? emptyChatJournal(), clientId)
      publish(admission.journal)
      setNotificationEntryIds([])
      setSelfMemberId(admission.memberId)
      persistHost(admission.journal)
      return admission.memberId
    },
    [persistHost, publish],
  )

  const admit = useCallback(
    (clientId: string): ChatAdmission => {
      const admission = admitMember(journalRef.current, clientId)
      if (admission.isNew) {
        publish(admission.journal)
        persistHost(admission.journal)
      }
      return { memberId: admission.memberId, isNew: admission.isNew }
    },
    [persistHost, publish],
  )

  const appendUser = useCallback(
    (author: ChatAuthor, text: string): ChatEntry | null => {
      const appended = appendUserMessage(journalRef.current, author, text, Date.now())
      if (!appended) return null
      publish(appended.journal)
      setNotificationEntryIds((current) => [...current, appended.entry.id])
      persistHost(appended.journal)
      return appended.entry
    },
    [persistHost, publish],
  )

  const appendSystem = useCallback(
    (event: ChatSystemEvent): ChatEntry => {
      const appended = appendSystemEvent(journalRef.current, event, Date.now())
      publish(appended.journal)
      persistHost(appended.journal)
      return appended.entry
    },
    [persistHost, publish],
  )

  const history = useCallback((): ChatEntry[] => [...journalRef.current.entries], [])

  const receiveHistory = useCallback(
    (incoming: ChatEntry[], memberId: MemberId) => {
      const parsed = parseChatEntries(incoming)
      if (!parsed || typeof memberId !== 'string' || memberId.length === 0) return
      publish({
        ...journalRef.current,
        entries: mergeChatEntries(journalRef.current.entries, parsed),
      })
      setSelfMemberId(memberId)
    },
    [publish],
  )

  const receiveEntry = useCallback(
    (incoming: ChatEntry) => {
      const parsed = parseChatEntries([incoming])
      if (!parsed) return
      const isNew = !journalRef.current.entries.some((entry) => entry.id === parsed[0].id)
      publish({
        ...journalRef.current,
        entries: mergeChatEntries(journalRef.current.entries, parsed),
      })
      if (isNew && parsed[0].kind === 'message') {
        setNotificationEntryIds((current) => [...current, parsed[0].id])
      }
    },
    [publish],
  )

  const clearRoom = useCallback(() => {
    clearChat()
    hostRoomCodeRef.current = null
    publish(emptyChatJournal())
    setNotificationEntryIds([])
    setSelfMemberId(null)
  }, [publish])

  return {
    entries,
    notificationEntryIds,
    selfMemberId,
    startHost,
    restoreHost,
    admit,
    appendUser,
    appendSystem,
    history,
    receiveHistory,
    receiveEntry,
    clearRoom,
  }
}

function restoreJournal(stored: {
  entries: unknown[]
  nextSequence: number
  members: Array<{ clientId: string; memberId: string }>
}): ChatJournal | null {
  if (!Array.isArray(stored.members)) return null
  const pairs: [string, MemberId][] = []
  const clientIds = new Set<string>()
  for (const member of stored.members) {
    if (
      typeof member !== 'object' ||
      member === null ||
      typeof member.clientId !== 'string' ||
      member.clientId.length === 0 ||
      typeof member.memberId !== 'string' ||
      member.memberId.length === 0 ||
      clientIds.has(member.clientId)
    )
      return null
    clientIds.add(member.clientId)
    pairs.push([member.clientId, member.memberId])
  }
  return parseChatJournal({
    entries: stored.entries,
    nextSequence: stored.nextSequence,
    memberIdsByClientId: Object.fromEntries(pairs),
  })
}
