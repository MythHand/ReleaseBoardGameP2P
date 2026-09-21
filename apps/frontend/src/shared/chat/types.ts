export type MemberId = string
export type ChatRole = 'host' | 'player' | 'spectator'

export interface ChatAuthor {
  memberId: MemberId
  name: string
  role: ChatRole
}

export type ChatSystemEvent =
  | { kind: 'memberJoined'; memberId: MemberId; name: string; role: ChatRole }
  | { kind: 'memberLeft'; memberId: MemberId; name: string }
  | { kind: 'memberReconnected'; memberId: MemberId; name: string }
  | { kind: 'memberKicked'; memberId: MemberId; name: string }
  | { kind: 'roleChanged'; memberId: MemberId; name: string; role: ChatRole }
  | { kind: 'modeChanged'; setting: string; value: string }

interface ChatEntryBase {
  id: string
  sequence: number
  createdAt: number
}

export interface UserChatEntry extends ChatEntryBase {
  kind: 'message'
  author: ChatAuthor
  text: string
}

export interface SystemChatEntry extends ChatEntryBase {
  kind: 'system'
  event: ChatSystemEvent
}

export type ChatEntry = UserChatEntry | SystemChatEntry
