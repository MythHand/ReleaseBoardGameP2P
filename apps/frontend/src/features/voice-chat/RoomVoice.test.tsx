import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { createFakeVoiceFacade } from '~/network/voice/testing/fakeVoiceFacade'
import { RoomVoice, useRoomVoiceView } from './RoomVoice'

const voice = createFakeVoiceFacade({
  status: 'interrupted',
  micOff: true,
  selfMemberId: 'me',
  issue: 'microphoneDenied',
  volume: 200,
  roster: [
    { memberId: 'me', peerId: 'p-me', voiceSessionId: 'v-me', micOff: true },
    { memberId: 'other', peerId: 'p-other', voiceSessionId: 'v-other', micOff: false },
  ],
  settings: { other: { volume: 175, muted: true } },
})
vi.mock('@release/translation', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('~/app/providers/SessionProvider', () => ({
  useSession: () => ({
    voice,
    state: {
      peers: {
        'p-me': { id: 'p-me', memberId: 'me', name: 'Me', role: 'host' },
        'p-other': { id: 'p-other', memberId: 'other', name: 'Viewer', role: 'guest' },
      },
    },
  }),
}))
it('adapts commands and actual mic state, keeps tuning after failure, and never disconnects on unmount', async () => {
  const hook = renderHook(useRoomVoiceView)
  expect(hook.result.current.selfId).toBe('me')
  const rendered = render(<RoomVoice view={hook.result.current} panelTitle="Voice" />)
  expect(screen.getByRole('status').textContent).toBe('voiceChat.issues.microphoneDenied')
  expect(screen.getAllByRole('slider')).toHaveLength(2)
  fireEvent.click(screen.getByRole('button', { name: 'voiceChat.unmuteMic' }))
  expect(voice.setMicOff).toHaveBeenCalledWith(false)
  fireEvent.click(screen.getByRole('button', { name: 'voiceChat.unmute Viewer' }))
  expect(voice.setParticipantMuted).toHaveBeenCalledWith('other', false)
  expect(voice.setParticipantVolume).not.toHaveBeenCalled()
  await act(async () => {
    hook.result.current.onConnect?.()
    await Promise.resolve()
  })
  expect(voice.connect).toHaveBeenCalledOnce()
  rendered.unmount()
  hook.unmount()
  expect(voice.disconnect).not.toHaveBeenCalled()
})
it('leaves voice only on explicit headphones click', () => {
  const hook = renderHook(useRoomVoiceView)
  render(<RoomVoice view={hook.result.current} panelTitle="Voice" />)
  fireEvent.click(
    screen.getByRole('button', { name: 'voiceChat.interrupted · voiceChat.disconnect' }),
  )
  expect(voice.disconnect).toHaveBeenCalledOnce()
  hook.unmount()
})
