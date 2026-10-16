import { act, renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { RoomVoiceFacade } from '~/network'
import { createFakeVoiceFacade } from '~/network/voice/testing/fakeVoiceFacade'
import { speakingMembers, useSpeaking } from './useSpeaking'

let sessionVoice: RoomVoiceFacade
vi.mock('~/app/providers/SessionProvider', () => ({ useSession: () => ({ voice: sessionVoice }) }))

const presence = (memberId: string, micOff = false) => ({
  memberId,
  peerId: `peer-${memberId}`,
  voiceSessionId: `vs-${memberId}`,
  micOff,
})

const ids = ['me', 'bo', 'cy', 'di']

const voice = (overrides = {}) =>
  createFakeVoiceFacade({
    status: 'connected',
    selfMemberId: 'me',
    micOff: false,
    roster: [presence('me'), presence('bo'), presence('cy', true), presence('di')],
    settings: { di: { volume: 100, muted: true } },
    ...overrides,
  })

it('shows speakers I can hear, myself included', () => {
  expect(speakingMembers(voice(), ids)).toEqual(new Set(['me', 'bo']))
})

it('hides someone I muted and someone whose mic is off', () => {
  const set = speakingMembers(voice(), ids)
  expect(set.has('di')).toBe(false)
  expect(set.has('cy')).toBe(false)
})

it('hides my own ring with my mic off', () => {
  expect(speakingMembers(voice({ micOff: true }), ids).has('me')).toBe(false)
})

it('shows nothing unless I am in the voice chat', () => {
  expect(speakingMembers(voice({ status: 'off' }), ids).size).toBe(0)
  expect(speakingMembers(voice({ status: 'connecting' }), ids).size).toBe(0)
  expect(speakingMembers(voice({ status: 'interrupted' }), ids).size).toBe(2)
})

// The ring follows the speaking channel by itself: the voice facade (and so
// the session) stays the same object while who is speaking changes.
it('follows the speaking channel without a new voice snapshot', () => {
  let heard: readonly string[] = []
  const listeners = new Set<() => void>()
  sessionVoice = voice({
    getSpeaking: () => heard,
    subscribeSpeaking: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  })
  const { result } = renderHook(() => useSpeaking())
  expect(result.current.size).toBe(0)
  act(() => {
    heard = ['bo']
    for (const listener of listeners) listener()
  })
  expect(result.current).toEqual(new Set(['bo']))
})
