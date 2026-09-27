import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import VoiceChat, {
  type VoiceChatCopy,
  VoicePanel,
  type VoiceParticipant,
  type VoiceStatus,
} from './VoiceChat'

const copy: VoiceChatCopy = {
  inVoice: 'в голосе',
  connect: 'подключиться',
  connecting: 'подключение…',
  disconnect: 'отключиться',
  interrupted: 'связь прервана',
  volume: 'общая громкость',
  you: 'ты',
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
