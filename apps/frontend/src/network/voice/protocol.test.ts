import { expect, it } from 'vitest'
import { parseVoiceFrame } from './protocol'

const member = { memberId: 'm', peerId: 'p', voiceSessionId: 'v', micOff: true }
const roster = {
  type: 'VOICE_ROSTER',
  from: 'host',
  seq: 1,
  payload: { authorityId: 'h1', revision: 0, participants: [member] },
}
it('accepts a roster and rejects ambiguous or malformed identities', () => {
  expect(parseVoiceFrame(roster)).toEqual(roster)
  for (const participants of [
    [member, member],
    [{ ...member, micOff: 1 }],
    [{ ...member, memberId: '' }],
    [member, { ...member, memberId: 'm2', peerId: 'p2' }],
  ]) {
    expect(parseVoiceFrame({ ...roster, payload: { ...roster.payload, participants } })).toBeNull()
  }
  for (const revision of [-1, 1.5, Number.NaN])
    expect(parseVoiceFrame({ ...roster, payload: { ...roster.payload, revision } })).toBeNull()
  expect(parseVoiceFrame({ ...roster, from: '' })).toBeNull()
  expect(
    parseVoiceFrame({
      type: 'VOICE_JOIN',
      from: 'p',
      seq: 1,
      payload: { voiceSessionId: 'v', micOff: 'false' },
    }),
  ).toBeNull()
})
it('copies validated payloads rather than retaining mutable incoming objects', () => {
  const parsed = parseVoiceFrame(roster)
  expect(parsed).not.toBe(roster)
  expect(
    parseVoiceFrame({ type: 'VOICE_LEAVE', from: 'p', seq: 1, payload: { voiceSessionId: 'v' } }),
  ).toEqual({ type: 'VOICE_LEAVE', from: 'p', seq: 1, payload: { voiceSessionId: 'v' } })
  expect(parseVoiceFrame({ type: 'PLAYER_READY', from: 'p', seq: 1, payload: {} })).toBeNull()
})
