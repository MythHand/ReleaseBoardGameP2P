import { useMemo, useSyncExternalStore } from 'react'
import { useSession } from '~/app/providers/SessionProvider'
import type { RoomVoiceFacade } from '~/network'

// Whose ring to light. The voice layer reports everyone audible (`ids`); what I
// am allowed to see of it is decided here, once, for every screen:
// - only while I am in the voice chat;
// - never for someone I muted, nor for someone whose own mic is off;
// - my own ring while I talk with my mic on.
export function speakingMembers(
  voice: RoomVoiceFacade,
  ids: readonly string[],
): ReadonlySet<string> {
  if (voice.status !== 'connected' && voice.status !== 'interrupted') return new Set()
  const micOffById = new Map(voice.roster.map((p) => [p.memberId, p.micOff]))
  const visible = new Set<string>()
  for (const id of ids) {
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

// The ids come over the voice runtime's own speaking channel, not the voice
// snapshot: speech changes many times a second, and only the components that
// draw a ring should re-render for it.
export function useSpeaking(): ReadonlySet<string> {
  const { voice } = useSession()
  const ids = useSyncExternalStore(voice.subscribeSpeaking, voice.getSpeaking, voice.getSpeaking)
  return useMemo(() => speakingMembers(voice, ids), [voice, ids])
}
