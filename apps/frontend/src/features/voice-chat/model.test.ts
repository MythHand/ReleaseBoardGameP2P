import { expect, it } from 'vitest'
import type { PeerInfo } from '~/network'
import { createFakeVoiceFacade } from '~/network/voice/testing/fakeVoiceFacade'
import en from '../../../../../packages/translation/src/locales/en/common.json'
import ru from '../../../../../packages/translation/src/locales/ru/common.json'
import { toVoiceParticipants } from './model'

it('resolves stable members, accepted roles and saved local settings while voice is off', () => {
  const peer = {
    id: 'new-peer',
    memberId: 'member',
    name: 'Viewer',
    role: 'guest',
    ready: false,
    where: 'game',
  } satisfies PeerInfo
  const snapshot = createFakeVoiceFacade({
    roster: [
      { memberId: 'member', peerId: 'new-peer', voiceSessionId: 'v1', micOff: true },
      { memberId: 'bot', peerId: 'bot:1', voiceSessionId: 'v2', micOff: false },
      { memberId: 'retired', peerId: 'old-peer', voiceSessionId: 'v3', micOff: false },
    ],
    settings: { member: { volume: 175, muted: true } },
  })
  expect(toVoiceParticipants(snapshot, { 'new-peer': peer })).toEqual([
    { id: 'member', name: 'Viewer', role: 'spectator', micOff: true, volume: 175, muted: true },
  ])
})
it('provides every voice issue in both locales', () => {
  const issues = [
    'microphoneDenied',
    'microphoneMissing',
    'permissionUnsupported',
    'permissionTimeout',
    'captureFailed',
    'audioBlocked',
    'callFailed',
    'roomDisconnected',
  ]
  for (const locale of [en, ru])
    for (const issue of issues) {
      expect((locale.voiceChat.issues as Record<string, string>)[issue]).toBeTruthy()
    }
})
