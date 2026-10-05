import { expect, it } from 'vitest'
import type { PeerInfo } from '../types'
import { applyVoiceIntent, createVoiceAuthority, pruneVoiceAuthority } from './authority'
import type { VoiceIntent } from './types'

const peers: Record<string, PeerInfo> = {
  host: { id: 'host', memberId: 'mh', name: 'Host', role: 'host', ready: false, where: 'lobby' },
  p: { id: 'p', memberId: 'mp', name: 'Spectator', role: 'guest', ready: false, where: 'lobby' },
}
const join = (from: string, voiceSessionId = 'v') => ({
  type: 'VOICE_JOIN' as const,
  from,
  seq: 1,
  payload: { voiceSessionId, micOff: true },
})
it('admits spectators and self only through their accepted room identity', () => {
  let a = createVoiceAuthority('authority')
  expect(applyVoiceIntent(a, join('outsider'), peers)).toBe(a)
  a = applyVoiceIntent(a, join('p'), peers)
  expect(a.roster).toEqual({
    authorityId: 'authority',
    revision: 1,
    participants: [{ memberId: 'mp', peerId: 'p', voiceSessionId: 'v', micOff: true }],
  })
  expect(applyVoiceIntent(a, join('p'), peers)).toBe(a)
  a = applyVoiceIntent(a, join('host', 'vh'), peers)
  expect(a.roster.participants).toHaveLength(2)
})
it('ignores retired session intents and prunes replaced or departed peers', () => {
  let a = applyVoiceIntent(createVoiceAuthority('authority'), join('p', 'old'), peers)
  a = applyVoiceIntent(a, join('p', 'new'), peers)
  for (const intent of [
    { type: 'VOICE_LEAVE', payload: { voiceSessionId: 'old' } },
    { type: 'VOICE_MIC', payload: { voiceSessionId: 'old', micOff: false } },
  ] as VoiceIntent[])
    expect(applyVoiceIntent(a, { ...intent, from: 'p', seq: 2 }, peers)).toBe(a)
  a = applyVoiceIntent(
    a,
    { type: 'VOICE_MIC', from: 'p', seq: 3, payload: { voiceSessionId: 'new', micOff: false } },
    peers,
  )
  expect(a.roster.participants[0].micOff).toBe(false)
  const retained = pruneVoiceAuthority(a, {
    ...peers,
    p: { ...peers.p, name: 'Renamed', role: 'player' },
  })
  expect(retained).toBe(a)
  const removed = pruneVoiceAuthority(a, { host: peers.host })
  expect(removed.roster.participants).toEqual([])
  expect(removed.roster.revision).toBe(a.roster.revision + 1)
})
