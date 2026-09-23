import { describe, expect, it, vi } from 'vitest'
import type { ChatEntry, ChatSystemEvent } from '~/shared/chat/types'
import type { Outgoing } from '../lobby/messages'
import type { RoomRuntime } from '../lobby/runtime'
import type { LobbyState } from '../lobby/state'
import type { PeerInfo } from '../types'
import { createChatController } from './controller'
import type { ChatSessionModel } from './useChatSession'

const host: PeerInfo = {
  id: 'host',
  memberId: 'member-host',
  name: 'Host',
  role: 'host',
  ready: true,
  where: 'lobby',
}
const guest: PeerInfo = {
  id: 'guest',
  memberId: 'member-guest',
  name: 'Guest',
  role: 'player',
  ready: false,
  where: 'lobby',
}

function setup(options: { self?: PeerInfo; host?: boolean; connected?: boolean } = {}) {
  const self = options.self ?? host
  const lobby = {
    selfId: self.id,
    hostId: 'host',
    maxPlayers: 4,
    bots: 0,
    setup: {},
    peers: { host, guest },
  } satisfies LobbyState
  let sequence = 0
  const entries: ChatEntry[] = []
  const session = {
    admit: vi.fn((clientId: string) => ({ memberId: `member-${clientId}`, isNew: true })),
    appendUser: vi.fn((author, text) => {
      const entry = {
        id: `entry-${++sequence}`,
        sequence,
        createdAt: 1,
        kind: 'message',
        author,
        text,
      } as const
      entries.push(entry)
      return entry
    }),
    appendSystem: vi.fn((event: ChatSystemEvent) => {
      const entry = {
        id: `entry-${++sequence}`,
        sequence,
        createdAt: 1,
        kind: 'system',
        event,
      } as const
      entries.push(entry)
      return entry
    }),
    history: vi.fn(() => [...entries]),
    receiveHistory: vi.fn(),
    receiveEntry: vi.fn(),
    clearRoom: vi.fn(),
  } as unknown as ChatSessionModel
  const runtime = {
    lobby,
    isHost: options.host ?? true,
    transport: { id: self.id },
  } as unknown as RoomRuntime
  const dispatch = vi.fn()
  const controller = createChatController({
    runtime,
    session,
    dispatch,
    canSendAsGuest: () => options.connected ?? true,
  })
  return { controller, dispatch, entries, session }
}

describe('chat controller', () => {
  it('normalizes host text and broadcasts the canonical entry', () => {
    const { controller, dispatch, session } = setup()

    expect(controller.send('  hello\nroom  ')).toBe(true)

    expect(session.appendUser).toHaveBeenCalledWith(
      { memberId: host.memberId, name: host.name, role: 'host' },
      'hello\nroom',
    )
    expect(dispatch).toHaveBeenCalledWith([
      expect.objectContaining({ message: expect.objectContaining({ type: 'CHAT_ENTRY' }) }),
    ])
  })

  it('sends only intent for a connected guest', () => {
    const { controller, dispatch, session } = setup({ self: guest, host: false })

    expect(controller.send(' hello ')).toBe(true)

    expect(session.appendUser).not.toHaveBeenCalled()
    expect(dispatch).toHaveBeenCalledWith([
      {
        to: 'host',
        message: { type: 'CHAT_SEND', payload: { text: 'hello' } },
      },
    ])
  })

  it('rejects empty, malformed, and disconnected guest sends', () => {
    const disconnected = setup({ self: guest, host: false, connected: false })
    expect(disconnected.controller.send('hello')).toBe(false)
    expect(disconnected.controller.appendUser(guest, 42)).toBeNull()
    expect(disconnected.controller.send('   ')).toBe(false)
    expect(disconnected.dispatch).not.toHaveBeenCalled()
  })

  it('emits mode events only for changed keys', () => {
    const { controller } = setup()

    const entries = controller.appendModeChanges(
      { releases: 'slow', ai: 'less' },
      { releases: 'fast', ai: 'less' },
    )

    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      kind: 'system',
      event: { kind: 'modeChanged', setting: 'releases', value: 'fast' },
    })
  })

  it('deduplicates capacity role changes by member', () => {
    const { controller } = setup()
    const before = {
      selfId: 'host',
      hostId: 'host',
      maxPlayers: 4,
      bots: 0,
      setup: {},
      peers: {
        old: guest,
        duplicate: { ...guest, id: 'duplicate' },
      },
    } satisfies LobbyState
    const after = {
      ...before,
      peers: {
        old: { ...guest, role: 'guest' as const },
        duplicate: { ...guest, id: 'duplicate', role: 'guest' as const },
      },
    }

    expect(controller.appendCapacityRoleChanges(before, after)).toHaveLength(1)
  })

  it('broadcasts entries in their original order', () => {
    const { controller, dispatch } = setup()
    const first = controller.appendJoin(guest, true)
    const second = controller.appendRoleChange({ ...guest, role: 'guest' })

    controller.broadcast([first, second])

    expect(
      (dispatch.mock.calls[0][0] as Outgoing[]).map((outgoing) =>
        outgoing.message.type === 'CHAT_ENTRY' ? outgoing.message.payload.entry : null,
      ),
    ).toEqual([first, second])
  })
})
