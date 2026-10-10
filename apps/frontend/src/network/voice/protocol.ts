import type { VoicePresence, VoiceWireMessage } from './types'

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null
const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0
export function parseVoiceFrame(value: unknown): VoiceWireMessage | null {
  if (
    !record(value) ||
    !id(value.from) ||
    !Number.isSafeInteger(value.seq) ||
    (value.seq as number) < 0 ||
    !record(value.payload)
  )
    return null
  const { payload } = value
  const envelope = { from: value.from, seq: value.seq as number }
  if (value.type === 'VOICE_LEAVE') {
    return id(payload.voiceSessionId)
      ? { ...envelope, type: value.type, payload: { voiceSessionId: payload.voiceSessionId } }
      : null
  }
  if (value.type === 'VOICE_JOIN' || value.type === 'VOICE_MIC') {
    return id(payload.voiceSessionId) && typeof payload.micOff === 'boolean'
      ? {
          ...envelope,
          type: value.type,
          payload: { voiceSessionId: payload.voiceSessionId, micOff: payload.micOff },
        }
      : null
  }
  if (
    value.type !== 'VOICE_ROSTER' ||
    !id(payload.authorityId) ||
    !Number.isSafeInteger(payload.revision) ||
    (payload.revision as number) < 0 ||
    !Array.isArray(payload.participants)
  )
    return null
  const members = new Set<string>()
  const peers = new Set<string>()
  const sessions = new Set<string>()
  const participants: VoicePresence[] = []
  for (const entry of payload.participants) {
    if (
      !record(entry) ||
      !id(entry.memberId) ||
      !id(entry.peerId) ||
      !id(entry.voiceSessionId) ||
      typeof entry.micOff !== 'boolean' ||
      members.has(entry.memberId) ||
      peers.has(entry.peerId) ||
      sessions.has(entry.voiceSessionId)
    )
      return null
    members.add(entry.memberId)
    peers.add(entry.peerId)
    sessions.add(entry.voiceSessionId)
    participants.push({
      memberId: entry.memberId,
      peerId: entry.peerId,
      voiceSessionId: entry.voiceSessionId,
      micOff: entry.micOff,
    })
  }
  return {
    ...envelope,
    type: 'VOICE_ROSTER',
    payload: {
      authorityId: payload.authorityId,
      revision: payload.revision as number,
      participants,
    },
  }
}
