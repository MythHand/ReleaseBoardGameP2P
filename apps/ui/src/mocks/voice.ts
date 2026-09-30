import type { VoiceParticipant } from '@/blocks/VoiceChat'
import { CHAT_SELF } from './chat'

// Mock voice chat in the lobby, with the lobby chat mock's names and roles. The
// local player is the chat's own, `deadlock`, and is in the voice chat only once
// connected; the others are whoever is in it already — listed out of order on
// purpose, and with one long name, the case that must wrap, not widen the list.
// One of them has turned their own microphone off.
//
// How many others there are is the playground's to pick (owner, 29.09): none;
// four — the host, two players and a spectator; or sixteen — the host, four
// players and eleven spectators, the room that makes the list scroll.
export type VoiceOthersCount = 0 | 4 | 16
export const VOICE_SELF: VoiceParticipant = {
  id: CHAT_SELF,
  name: CHAT_SELF,
  role: 'player',
  volume: 100,
}

const person = (name: string, role: VoiceParticipant['role']): VoiceParticipant => ({
  id: name,
  name,
  role,
  volume: 100,
})

// the four: the host, two players and a spectator
const FOUR: VoiceParticipant[] = [
  person('null_ptr', 'spectator'),
  { ...person('segfault', 'player'), micOff: true },
  person('TabsOverSpaces', 'host'),
  {
    ...person('kernel_panic_at_the_disco', 'player'),
    name: 'kernel_panic_at_the_disco_since_1991',
  },
]

// what the sixteen add to the four: two more players and ten more spectators
const TWELVE_MORE: VoiceParticipant[] = [
  person('cypher', 'spectator'),
  person('off_by_one', 'player'),
  person('heap_dump', 'spectator'),
  person('SyntaxSeagull_9000_x', 'spectator'),
  person('cache_miss', 'spectator'),
  person('race_cond', 'player'),
  person('spin_lock', 'spectator'),
  person('zombie_proc', 'spectator'),
  person('merge_conflict', 'spectator'),
  person('dead_code', 'spectator'),
  person('bit_flip', 'spectator'),
  person('memory_leak', 'spectator'),
]

// all sixteen: the four first, so picking four takes exactly them
export function makeVoiceOthers(): VoiceParticipant[] {
  return [...FOUR, ...TWELVE_MORE]
}
