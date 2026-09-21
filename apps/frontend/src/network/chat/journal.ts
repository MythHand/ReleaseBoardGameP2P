import type {
  ChatAuthor,
  ChatEntry,
  ChatRole,
  ChatSystemEvent,
  MemberId,
  SystemChatEntry,
  UserChatEntry,
} from '~/shared/chat/types'

export const MAX_CHAT_CODE_POINTS = 2_000

export interface ChatJournal {
  entries: ChatEntry[]
  nextSequence: number
  memberIdsByClientId: Record<string, MemberId>
}

interface Appended<TEntry extends ChatEntry> {
  journal: ChatJournal
  entry: TEntry
}

export function emptyChatJournal(): ChatJournal {
  return { entries: [], nextSequence: 1, memberIdsByClientId: {} }
}

export function normalizeChatText(raw: string): string | null {
  const text = raw.trim()
  if (text.length === 0 || Array.from(text).length > MAX_CHAT_CODE_POINTS) return null
  return text
}

export function admitMember(
  journal: ChatJournal,
  clientId: string,
  mint: () => MemberId = () => crypto.randomUUID(),
): { journal: ChatJournal; memberId: MemberId; isNew: boolean } {
  const existing = journal.memberIdsByClientId[clientId]
  if (existing) return { journal, memberId: existing, isNew: false }

  const memberId = mint()
  return {
    memberId,
    isNew: true,
    journal: {
      ...journal,
      memberIdsByClientId: { ...journal.memberIdsByClientId, [clientId]: memberId },
    },
  }
}

export function appendUserMessage(
  journal: ChatJournal,
  author: ChatAuthor,
  rawText: string,
  createdAt: number,
): Appended<UserChatEntry> | null {
  const text = normalizeChatText(rawText)
  if (text === null) return null

  return appendEntry(journal, {
    kind: 'message',
    author,
    text,
    createdAt,
  })
}

export function appendSystemEvent(
  journal: ChatJournal,
  event: ChatSystemEvent,
  createdAt: number,
): Appended<SystemChatEntry> {
  return appendEntry(journal, {
    kind: 'system',
    event,
    createdAt,
  })
}

export function mergeChatEntries(current: ChatEntry[], incoming: ChatEntry[]): ChatEntry[] {
  const byId = new Map<string, ChatEntry>()
  for (const entry of [...current, ...incoming]) {
    if (!byId.has(entry.id)) byId.set(entry.id, entry)
  }
  return Array.from(byId.values()).sort((a, b) => a.sequence - b.sequence)
}

export function parseChatEntries(value: unknown): ChatEntry[] | null {
  if (!Array.isArray(value) || !value.every(isChatEntry)) return null
  return value
}

export function parseChatJournal(value: unknown): ChatJournal | null {
  if (!isRecord(value)) return null

  const entries = parseChatEntries(value.entries)
  if (entries === null) return null
  if (!isPositiveInteger(value.nextSequence)) return null
  if (!isMemberMapping(value.memberIdsByClientId)) return null

  const ids = new Set<string>()
  const sequences = new Set<number>()
  let maxSequence = 0
  for (const entry of entries) {
    if (ids.has(entry.id) || sequences.has(entry.sequence)) return null
    ids.add(entry.id)
    sequences.add(entry.sequence)
    maxSequence = Math.max(maxSequence, entry.sequence)
  }
  if (value.nextSequence <= maxSequence) return null

  return {
    entries,
    nextSequence: value.nextSequence,
    memberIdsByClientId: value.memberIdsByClientId,
  }
}

function appendEntry<TEntry extends ChatEntry>(
  journal: ChatJournal,
  input: Omit<TEntry, 'id' | 'sequence'>,
): Appended<TEntry> {
  const sequence = journal.nextSequence
  const entry = { ...input, id: `chat-${sequence}`, sequence } as TEntry
  return {
    entry,
    journal: {
      ...journal,
      entries: [...journal.entries, entry],
      nextSequence: sequence + 1,
    },
  }
}

function isChatEntry(value: unknown): value is ChatEntry {
  if (!isRecord(value) || !hasValidBase(value)) return false
  if (value.kind === 'message') {
    return (
      isChatAuthor(value.author) &&
      typeof value.text === 'string' &&
      normalizeChatText(value.text) === value.text
    )
  }
  if (value.kind === 'system') return isSystemEvent(value.event)
  return false
}

function hasValidBase(value: Record<string, unknown>): boolean {
  return (
    isNonEmptyString(value.id) &&
    isPositiveInteger(value.sequence) &&
    typeof value.createdAt === 'number' &&
    Number.isFinite(value.createdAt)
  )
}

function isChatAuthor(value: unknown): value is ChatAuthor {
  return (
    isRecord(value) &&
    isNonEmptyString(value.memberId) &&
    isNonEmptyString(value.name) &&
    isChatRole(value.role)
  )
}

function isSystemEvent(value: unknown): value is ChatSystemEvent {
  if (!isRecord(value) || typeof value.kind !== 'string') return false
  if (value.kind === 'modeChanged') {
    return isNonEmptyString(value.setting) && isNonEmptyString(value.value)
  }
  if (value.kind === 'roleChanged') {
    return (
      isNonEmptyString(value.memberId) && isNonEmptyString(value.name) && isChatRole(value.role)
    )
  }
  if (
    value.kind === 'memberJoined' ||
    value.kind === 'memberLeft' ||
    value.kind === 'memberReconnected' ||
    value.kind === 'memberKicked'
  ) {
    return isNonEmptyString(value.memberId) && isNonEmptyString(value.name)
  }
  return false
}

function isMemberMapping(value: unknown): value is Record<string, MemberId> {
  if (!isRecord(value)) return false
  const memberIds = new Set<string>()
  for (const [clientId, memberId] of Object.entries(value)) {
    if (!isNonEmptyString(clientId) || !isNonEmptyString(memberId) || memberIds.has(memberId)) {
      return false
    }
    memberIds.add(memberId)
  }
  return true
}

function isChatRole(value: unknown): value is ChatRole {
  return value === 'host' || value === 'player' || value === 'spectator'
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
