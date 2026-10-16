import { vi } from 'vitest'
import type { RoomVoiceFacade } from '../useRoomVoice'

const NOBODY_SPEAKING: readonly string[] = []
const noSpeakingListener = () => () => {}

// `speaking` sets who the fake hears; it is read through the same stable
// `getSpeaking`/`subscribeSpeaking` pair the real facade exposes.
export function createFakeVoiceFacade(
  overrides: Partial<RoomVoiceFacade> & { speaking?: readonly string[] } = {},
): RoomVoiceFacade {
  const { speaking, ...rest } = overrides
  const ids = speaking ?? NOBODY_SPEAKING
  return {
    status: 'off',
    micOff: true,
    roster: [],
    selfMemberId: null,
    volume: 100,
    settings: {},
    issue: null,
    unreachableMemberIds: [],
    getSpeaking: () => ids,
    subscribeSpeaking: noSpeakingListener,
    connect: vi.fn(async () => {
      await Promise.resolve()
    }),
    disconnect: vi.fn(),
    setMicOff: vi.fn(async () => {
      await Promise.resolve()
    }),
    setVolume: vi.fn(),
    setParticipantVolume: vi.fn(),
    setParticipantMuted: vi.fn(),
    ...rest,
  }
}
