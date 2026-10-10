import i18n from '@release/translation'
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createFakeVoiceFacade } from '~/network/voice/testing/fakeVoiceFacade'
import { RoomVoice, useRoomVoiceView } from './RoomVoice'

const peers = {
  'p-me': { id: 'p-me', memberId: 'me', name: 'Me', role: 'host' },
  'p-other': { id: 'p-other', memberId: 'other', name: 'Viewer', role: 'guest' },
  'p-third': { id: 'p-third', memberId: 'third', name: 'Player', role: 'player' },
}
const initialRoster = [
  { memberId: 'me', peerId: 'p-me', voiceSessionId: 'v-me', micOff: true },
  { memberId: 'other', peerId: 'p-other', voiceSessionId: 'v-other', micOff: false },
]
const voice = createFakeVoiceFacade({
  status: 'interrupted',
  micOff: true,
  selfMemberId: 'me',
  issue: 'microphoneDenied',
  volume: 200,
  roster: initialRoster,
  settings: { other: { volume: 175, muted: true } },
})
vi.mock('~/app/providers/SessionProvider', () => ({
  useSession: () => ({
    voice,
    state: { peers },
  }),
}))
beforeEach(async () => {
  vi.clearAllMocks()
  voice.issue = 'microphoneDenied'
  voice.unreachableMemberIds = []
  voice.volume = 200
  voice.roster = initialRoster
  await i18n.changeLanguage('en')
})
afterEach(() => vi.useRealTimers())

it('adapts commands and actual mic state, keeps tuning after failure, and never disconnects on unmount', async () => {
  const hook = renderHook(useRoomVoiceView)
  expect(hook.result.current.selfId).toBe('me')
  const rendered = render(<RoomVoice view={hook.result.current} panelTitle="Voice" />)
  expect(screen.queryByRole('status')).toBeNull()
  expect(screen.getAllByRole('slider')).toHaveLength(2)
  fireEvent.click(
    screen.getByRole('button', { name: 'Microphone access was denied · unmute microphone' }),
  )
  expect(voice.setMicOff).toHaveBeenCalledWith(false)
  fireEvent.click(screen.getByRole('button', { name: 'unmute player Viewer' }))
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
  fireEvent.click(screen.getByRole('button', { name: 'connection lost · leave' }))
  expect(voice.disconnect).toHaveBeenCalledOnce()
  hook.unmount()
})

it('uses the localized notice and close control in the lobby and stats voice line', async () => {
  const hook = renderHook(useRoomVoiceView)
  render(<RoomVoice view={hook.result.current} />)
  expect(screen.getByRole('status').textContent).toContain('Microphone access was denied')
  expect(screen.getByRole('status').textContent).toContain('You can hear the other participants.')
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'close' })))
  expect(screen.queryByRole('status')).toBeNull()
})

it.each([
  'en',
  'ru',
])('names failed participants in %s and keys a changed failure set', async (language) => {
  await i18n.changeLanguage(language)
  voice.issue = 'peersUnreachable'
  voice.unreachableMemberIds = ['other']
  const hook = renderHook(useRoomVoiceView)
  const first = hook.result.current.issue
  expect(first?.title).toBe(
    language === 'en' ? 'No voice connection with Viewer' : 'Нет голосовой связи с Viewer',
  )
  expect(first?.concerns).toBe('connection')
  voice.roster = [
    ...initialRoster,
    { memberId: 'third', peerId: 'p-third', voiceSessionId: 'v-third', micOff: true },
  ]
  voice.unreachableMemberIds = ['other', 'third']
  hook.rerender()
  expect(hook.result.current.issue?.key).not.toBe(first?.key)
  expect(hook.result.current.issue?.title).toContain('Viewer, Player')
  voice.issue = null
  voice.unreachableMemberIds = []
  hook.rerender()
  expect(hook.result.current.issue).toBeNull()
})

it('keeps one notice and its six-second deadline through volume changes', async () => {
  vi.useFakeTimers()
  const hook = renderHook(useRoomVoiceView)
  const line = render(<RoomVoice view={hook.result.current} />)
  expect(screen.getAllByRole('status')).toHaveLength(1)
  await act(async () => vi.advanceTimersByTime(3000))
  voice.volume = 150
  hook.rerender()
  line.rerender(<RoomVoice view={hook.result.current} />)
  expect(screen.getAllByRole('status')).toHaveLength(1)
  await act(async () => vi.advanceTimersByTime(3000))
  expect(screen.queryByRole('status')).toBeNull()
})
