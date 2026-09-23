import type { ChatMessage } from '@release/ui'
import type { PeerInfo } from '~/network/types'
import type { ChatEntry, ChatRole, ChatSystemEvent, MemberId } from '~/shared/chat/types'

const toChatRole = (role: PeerInfo['role']): ChatRole => (role === 'guest' ? 'spectator' : role)

export function toChatMessages(args: {
  entries: ChatEntry[]
  peers: PeerInfo[]
  formatTime: (timestamp: number) => string
  systemText: (event: ChatSystemEvent) => string
}): ChatMessage[] {
  const peersByMemberId = new Map<MemberId, PeerInfo>(
    args.peers.map((peer) => [peer.memberId, peer]),
  )
  const latestRoles = new Map<MemberId, { name: string; role: ChatRole }>()
  for (const entry of args.entries) {
    if (entry.kind === 'system' && entry.event.kind === 'roleChanged') {
      latestRoles.set(entry.event.memberId, {
        name: entry.event.name,
        role: entry.event.role,
      })
    }
  }

  return args.entries.map((entry) => {
    if (entry.kind === 'system') {
      return { id: entry.id, system: true, text: args.systemText(entry.event) }
    }

    const peer = peersByMemberId.get(entry.author.memberId)
    const latestRole = latestRoles.get(entry.author.memberId)
    return {
      id: entry.id,
      memberId: entry.author.memberId,
      who: peer?.name ?? latestRole?.name ?? entry.author.name,
      text: entry.text,
      time: args.formatTime(entry.createdAt),
      role: peer ? toChatRole(peer.role) : (latestRole?.role ?? entry.author.role),
      gone: !peer,
    }
  })
}
