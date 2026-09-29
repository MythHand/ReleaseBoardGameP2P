import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import VoiceChat, {
  type VoiceChatCopy,
  VoicePanel,
  type VoiceParticipant,
  type VoiceStatus,
  VoiceTabIcon,
} from './VoiceChat'

const copy: VoiceChatCopy = {
  inVoice: 'в голосе',
  connect: 'подключиться',
  connecting: 'подключение…',
  disconnect: 'отключиться',
  interrupted: 'связь прервана',
  volume: 'общая громкость',
  you: 'ты',
  mute: 'выключить звук игрока',
  unmute: 'включить звук игрока',
  muteMic: 'выключить микрофон',
  unmuteMic: 'включить микрофон',
  micMuted: 'микрофон выключен',
}

const me: VoiceParticipant = { id: 'me', name: 'deadlock', role: 'player', volume: 100 }
// out of order on purpose: the list sorts them itself
const others: VoiceParticipant[] = [
  { id: 's', name: 'null_ptr', role: 'spectator', volume: 100 },
  { id: 'p', name: 'segfault', role: 'player', volume: 100 },
  { id: 'h', name: 'TabsOverSpaces', role: 'host', volume: 100 },
]

const panel = (status: VoiceStatus, people = [me, ...others]) =>
  render(
    <VoicePanel
      title="голосовой чат"
      participants={people}
      status={status}
      selfId="me"
      volume={100}
      copy={copy}
    />,
  )

it('lists the host first, then the players, then the spectators', () => {
  panel('connected')
  // a row also carries the avatar's initial and the volume, so read the name
  const order = ['TabsOverSpaces', 'deadlock', 'segfault', 'null_ptr']
  const rows = screen.getAllByRole('listitem')
  rows.forEach((row, i) => {
    expect(row.textContent).toContain(order[i])
  })
  expect(rows[1]?.textContent).toContain('· ты')
})

// The overall volume leads; my own voice is not played back, so I have none.
it('gives everyone but me a volume once I am in, with the overall one first', () => {
  panel('connected')
  expect(screen.getAllByRole('slider')).toHaveLength(1 + others.length)
})

it('keeps the volumes while the connection is broken off, and has none while out', () => {
  panel('interrupted')
  expect(screen.getAllByRole('slider')).toHaveLength(1 + others.length)
  panel('off', others)
  panel('connecting', others)
  // the two renders above add no sliders of their own
  expect(screen.getAllByRole('slider')).toHaveLength(1 + others.length)
})

it('shows no count while nobody is in the voice chat', () => {
  render(<VoiceChat participants={[]} status="off" volume={100} copy={copy} />)
  expect(screen.queryByRole('button', { name: /в голосе/ })).toBeNull()
})

it('opens the list from the count in the lobby', () => {
  render(<VoiceChat participants={others} status="off" volume={100} copy={copy} />)
  expect(screen.queryByRole('listitem')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'в голосе 3' }))
  expect(screen.getAllByRole('listitem')).toHaveLength(3)
})

// Off joins; connecting does nothing — a second press would start a second
// join; connected, or broken off, leaves.
it.each([
  ['off', 'подключиться', 'join'],
  ['connecting', 'подключение…', null],
  ['connected', 'отключиться', 'leave'],
  ['interrupted', 'связь прервана · отключиться', 'leave'],
] as const)('headphones %s: named "%s", pressing does %s', (status, name, does) => {
  const onConnect = vi.fn()
  const onDisconnect = vi.fn()
  render(
    <VoiceChat
      participants={[]}
      status={status}
      volume={100}
      copy={copy}
      onConnect={onConnect}
      onDisconnect={onDisconnect}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name }))
  expect(onConnect).toHaveBeenCalledTimes(does === 'join' ? 1 : 0)
  expect(onDisconnect).toHaveBeenCalledTimes(does === 'leave' ? 1 : 0)
})

// My mute on someone is for me alone and kept apart from their volume: the
// volume stays, faded, and still moves.
it('mutes another participant from the speaker beside their volume', () => {
  const onMute = vi.fn()
  const [spectator, ...rest] = others as [VoiceParticipant, ...VoiceParticipant[]]
  render(
    <VoicePanel
      title="голосовой чат"
      participants={[me, { ...spectator, muted: true }, ...rest]}
      status="connected"
      selfId="me"
      volume={100}
      copy={copy}
      onParticipantMuteChange={onMute}
    />,
  )
  // everyone but me has one
  expect(screen.getAllByRole('button', { name: /звук игрока/ })).toHaveLength(others.length)
  fireEvent.click(screen.getByRole('button', { name: 'выключить звук игрока segfault' }))
  expect(onMute).toHaveBeenCalledWith('p', true)
  const muted = screen.getByRole('button', { name: 'включить звук игрока null_ptr' })
  expect(muted.getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(muted)
  expect(onMute).toHaveBeenCalledWith('s', false)
  expect(screen.getAllByRole('slider')).toHaveLength(1 + others.length)
})

it('shows my microphone only while I am in, and turns it off and on', () => {
  const onMic = vi.fn()
  const line = (status: VoiceStatus, micOff = false) => (
    <VoiceChat
      participants={status === 'off' ? [] : [me]}
      status={status}
      volume={100}
      micOff={micOff}
      copy={copy}
      onMicChange={onMic}
    />
  )
  const { rerender } = render(line('off'))
  expect(screen.queryByRole('button', { name: /микрофон/ })).toBeNull()
  rerender(line('connected'))
  fireEvent.click(screen.getByRole('button', { name: 'выключить микрофон' }))
  expect(onMic).toHaveBeenCalledWith(true)
  rerender(line('connected', true))
  fireEvent.click(screen.getByRole('button', { name: 'включить микрофон' }))
  expect(onMic).toHaveBeenCalledWith(false)
})

// The rail tab: my microphone off shows while connected; a broken-off
// connection outranks it. The icons are told apart by their Phosphor paths.
it.each([
  ['connected', true, 'microphone'],
  ['interrupted', true, 'headphones'],
  ['connected', false, 'headphones'],
  ['off', true, 'headphones'],
] as const)('rail tab %s with the microphone off: %s → %s', (status, micOff, shows) => {
  const { container } = render(<VoiceTabIcon status={status} micOff={micOff} />)
  const path = container.querySelector('path')?.getAttribute('d') ?? ''
  expect(path.startsWith(shows === 'microphone' ? 'M213.92' : 'M201.89')).toBe(true)
})

it('marks a participant who turned their own microphone off', () => {
  const [spectator, player] = others as [VoiceParticipant, VoiceParticipant]
  panel('off', [spectator, { ...player, micOff: true }])
  expect(screen.getAllByRole('img', { name: 'микрофон выключен' })).toHaveLength(1)
})
