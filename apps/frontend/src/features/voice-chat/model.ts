import type { VoiceParticipant } from '@release/ui'
import type { PeerInfo, VoiceSnapshot } from '~/network'

export function toVoiceParticipants(
  snapshot: VoiceSnapshot,
  peers: Record<string, PeerInfo>,
  speaking: ReadonlySet<string> = new Set(),
): VoiceParticipant[] {
  return snapshot.roster.flatMap((presence) => {
    const peer = peers[presence.peerId]
    if (!peer || peer.memberId !== presence.memberId || peer.id.startsWith('bot:')) return []
    return [
      {
        id: presence.memberId,
        name: peer.name,
        role: peer.role === 'guest' ? 'spectator' : peer.role,
        micOff: presence.micOff,
        ...(peer.avatar ? { avatar: peer.avatar } : {}),
        speaking: speaking.has(presence.memberId),
        ...(snapshot.settings[presence.memberId] ?? { volume: 100, muted: false }),
      },
    ]
  })
}
