import { describe, expect, it, vi } from 'vitest'
import type { PeerInfo } from '~/network/types'
import type { ChatEntry, UserChatEntry } from '~/shared/chat/types'
import { toChatMessages } from './model'

const entry: UserChatEntry = {
  kind: 'message',
  id: 'chat-1',
  sequence: 1,
  createdAt: 1,
  author: { memberId: 'member-a', name: 'old', role: 'player' },
  text: 'hello',
}

const active: PeerInfo = {
  id: 'peer-a',
  memberId: 'member-a',
  name: 'new',
  role: 'host',
  ready: true,
  where: 'lobby',
}

const map = (entries: ChatEntry[], peers: PeerInfo[] = []) =>
  toChatMessages({
    entries,
    peers,
    formatTime: () => '20:17',
    systemText: () => 'system',
  })

describe('toChatMessages', () => {
  it('uses the active peer current name and role', () => {
    expect(map([entry], [active])[0]).toMatchObject({
      memberId: 'member-a',
      who: 'new',
      role: 'host',
      gone: false,
    })
  })

  it('keeps an absent author snapshot and marks it gone', () => {
    expect(map([entry])[0]).toMatchObject({
      memberId: 'member-a',
      who: 'old',
      role: 'player',
      gone: true,
    })
  })

  it('keeps equal display names distinct through member identity', () => {
    const second: UserChatEntry = {
      ...entry,
      id: 'chat-2',
      sequence: 2,
      author: { ...entry.author, memberId: 'member-b' },
    }

    expect(map([entry, second]).map(({ memberId }) => memberId)).toEqual(['member-a', 'member-b'])
  })

  it('renders system entries through the injected translator', () => {
    const event = { kind: 'memberJoined' as const, memberId: 'member-a', name: 'Ann' }
    const systemText = vi.fn(() => 'Ann joined')
    const messages = toChatMessages({
      entries: [{ kind: 'system', id: 'chat-2', sequence: 2, createdAt: 2, event }],
      peers: [],
      formatTime: () => '20:17',
      systemText,
    })

    expect(systemText).toHaveBeenCalledWith(event)
    expect(messages).toEqual([{ id: 'chat-2', system: true, text: 'Ann joined' }])
  })

  it('formats timestamps through the injected formatter', () => {
    const formatTime = vi.fn(() => 'custom time')
    const messages = toChatMessages({
      entries: [entry],
      peers: [],
      formatTime,
      systemText: () => 'system',
    })

    expect(formatTime).toHaveBeenCalledWith(1)
    expect(messages[0]?.time).toBe('custom time')
  })
})
