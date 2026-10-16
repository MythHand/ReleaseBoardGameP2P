import { expect, it } from 'vitest'
import { createFakeVoiceFacade } from '~/network/voice/testing/fakeVoiceFacade'
import { speakingMembers } from './useSpeaking'

const presence = (memberId: string, micOff = false) => ({
  memberId,
  peerId: `peer-${memberId}`,
  voiceSessionId: `vs-${memberId}`,
  micOff,
})

const voice = (overrides = {}) =>
  createFakeVoiceFacade({
    status: 'connected',
    selfMemberId: 'me',
    micOff: false,
    roster: [presence('me'), presence('bo'), presence('cy', true), presence('di')],
    settings: { di: { volume: 100, muted: true } },
    speakingMemberIds: ['me', 'bo', 'cy', 'di'],
    ...overrides,
  })

it('shows speakers I can hear, myself included', () => {
  expect(speakingMembers(voice())).toEqual(new Set(['me', 'bo']))
})

it('hides someone I muted and someone whose mic is off', () => {
  const set = speakingMembers(voice())
  expect(set.has('di')).toBe(false)
  expect(set.has('cy')).toBe(false)
})

it('hides my own ring with my mic off', () => {
  expect(speakingMembers(voice({ micOff: true })).has('me')).toBe(false)
})

it('shows nothing unless I am in the voice chat', () => {
  expect(speakingMembers(voice({ status: 'off' })).size).toBe(0)
  expect(speakingMembers(voice({ status: 'connecting' })).size).toBe(0)
  expect(speakingMembers(voice({ status: 'interrupted' })).size).toBe(2)
})
