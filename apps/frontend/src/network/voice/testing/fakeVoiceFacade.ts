import { vi } from 'vitest'
import type { RoomVoiceFacade } from '../useRoomVoice'

export function createFakeVoiceFacade(overrides: Partial<RoomVoiceFacade> = {}): RoomVoiceFacade {
  return {
    status: 'off',
    micOff: true,
    roster: [],
    selfMemberId: null,
    volume: 100,
    settings: {},
    issue: null,
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
    ...overrides,
  }
}
