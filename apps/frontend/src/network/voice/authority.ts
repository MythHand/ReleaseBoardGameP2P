import type { PeerInfo } from '../types'
import type { VoiceIntent, VoicePresence, VoiceRosterPayload } from './types'

export interface VoiceAuthority {
  roster: VoiceRosterPayload
}
export function createVoiceAuthority(authorityId: string): VoiceAuthority {
  return { roster: { authorityId, revision: 0, participants: [] } }
}
function update(authority: VoiceAuthority, participants: VoicePresence[]): VoiceAuthority {
  return { roster: { ...authority.roster, revision: authority.roster.revision + 1, participants } }
}
export function applyVoiceIntent(
  authority: VoiceAuthority,
  frame: VoiceIntent & { from: string; seq: number },
  peers: Record<string, PeerInfo>,
): VoiceAuthority {
  const member = peers[frame.from]
  if (!member) return authority
  const previous = authority.roster.participants.find((entry) => entry.memberId === member.memberId)
  const rest = authority.roster.participants.filter((entry) => entry.memberId !== member.memberId)
  if (frame.type === 'VOICE_JOIN') {
    const entry = {
      memberId: member.memberId,
      peerId: frame.from,
      voiceSessionId: frame.payload.voiceSessionId,
      micOff: frame.payload.micOff,
    }
    if (
      previous?.peerId === entry.peerId &&
      previous.voiceSessionId === entry.voiceSessionId &&
      previous.micOff === entry.micOff
    )
      return authority
    return update(authority, [...rest, entry])
  }
  if (
    !previous ||
    previous.peerId !== frame.from ||
    previous.voiceSessionId !== frame.payload.voiceSessionId
  )
    return authority
  if (frame.type === 'VOICE_LEAVE') return update(authority, rest)
  if (previous.micOff === frame.payload.micOff) return authority
  return update(
    authority,
    authority.roster.participants.map((entry) =>
      entry === previous ? { ...entry, micOff: frame.payload.micOff } : entry,
    ),
  )
}
export function pruneVoiceAuthority(
  authority: VoiceAuthority,
  peers: Record<string, PeerInfo>,
): VoiceAuthority {
  const participants = authority.roster.participants.filter(
    (entry) => peers[entry.peerId]?.memberId === entry.memberId,
  )
  return participants.length === authority.roster.participants.length
    ? authority
    : update(authority, participants)
}
