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

  return args.entries.map((entry) => {
    if (entry.kind === 'system') {
      return { id: entry.id, system: true, text: args.systemText(entry.event) }
    }

    const peer = peersByMemberId.get(entry.author.memberId)
    return {
      id: entry.id,
      memberId: entry.author.memberId,
      who: peer?.name ?? entry.author.name,
      text: entry.text,
      time: args.formatTime(entry.createdAt),
      role: peer ? toChatRole(peer.role) : entry.author.role,
      gone: !peer,
    }
  })
}
