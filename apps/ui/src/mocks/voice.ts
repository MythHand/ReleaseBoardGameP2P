import type { VoiceParticipant } from '@/blocks/VoiceChat'
import { CHAT_SELF } from './chat'

// Mock voice chat in the lobby, with the lobby chat mock's names and roles. The
// local player is the chat's own, `deadlock`, and is in the voice chat only once
// connected; the others are whoever is in it already — listed out of order on
// purpose, and with one long name, the case that must wrap, not widen the list.
export const VOICE_SELF: VoiceParticipant = {
  id: CHAT_SELF,
  name: CHAT_SELF,
  role: 'player',
  volume: 100,
}

export function makeVoiceOthers(): VoiceParticipant[] {
  return [
    { id: 'null_ptr', name: 'null_ptr', role: 'spectator', volume: 100 },
    { id: 'segfault', name: 'segfault', role: 'player', volume: 100 },
    { id: 'TabsOverSpaces', name: 'TabsOverSpaces', role: 'host', volume: 100 },
    {
      id: 'kernel_panic_at_the_disco',
      name: 'kernel_panic_at_the_disco_since_1991',
      role: 'player',
      volume: 100,
    },
  ]
}
