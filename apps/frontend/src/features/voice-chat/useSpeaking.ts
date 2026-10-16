import { useMemo } from 'react'
import { useSession } from '~/app/providers/SessionProvider'
import type { RoomVoiceFacade } from '~/network'

// Whose ring to light. The voice layer reports everyone audible; what I am
// allowed to see of it is decided here, once, for every screen:
// - only while I am in the voice chat;
// - never for someone I muted, nor for someone whose own mic is off;
// - my own ring while I talk with my mic on.
export function speakingMembers(voice: RoomVoiceFacade): ReadonlySet<string> {
  if (voice.status !== 'connected' && voice.status !== 'interrupted') return new Set()
  const micOffById = new Map(voice.roster.map((p) => [p.memberId, p.micOff]))
  const visible = new Set<string>()
  for (const id of voice.speakingMemberIds) {
    if (id === voice.selfMemberId) {
      if (!voice.micOff) visible.add(id)
      continue
    }
    if (voice.settings[id]?.muted) continue
    if (micOffById.get(id) !== false) continue
    visible.add(id)
  }
  return visible
}

export function useSpeaking(): ReadonlySet<string> {
  const { voice } = useSession()
  return useMemo(() => speakingMembers(voice), [voice])
}
