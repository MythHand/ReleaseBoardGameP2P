import { describe, expect, it } from 'vitest'
import type { UserChatEntry } from '~/shared/chat/types'
import {
  admitMember,
  appendSystemEvent,
  appendUserMessage,
  emptyChatJournal,
  mergeChatEntries,
  normalizeChatText,
  parseChatEntries,
  parseChatJournal,
} from './journal'

const author = { memberId: 'member-a', name: 'Ann', role: 'player' } as const

const firstMessage: UserChatEntry = {
  kind: 'message',
  id: 'chat-1',
  sequence: 1,
  createdAt: 100,
  author,
  text: 'one',
}

describe('chat journal', () => {
  it('counts Unicode code points rather than UTF-16 code units', () => {
    expect(normalizeChatText('😀'.repeat(2_000))).toBe('😀'.repeat(2_000))
    expect(normalizeChatText('😀'.repeat(2_001))).toBeNull()
  })

  it('trims the edges, preserves internal newlines, and rejects whitespace', () => {
    expect(normalizeChatText('  first\nsecond  ')).toBe('first\nsecond')
    expect(normalizeChatText(' \n\t ')).toBeNull()
  })

  it('reuses a member id for the same private client id', () => {
    const first = admitMember(emptyChatJournal(), 'client-a', () => 'member-a')
    const second = admitMember(first.journal, 'client-a', () => {
      throw new Error('must not mint a second member id')
    })

    expect(first).toMatchObject({ memberId: 'member-a', isNew: true })
    expect(second).toMatchObject({ memberId: 'member-a', isNew: false })
  })

  it('assigns one canonical sequence and id per accepted entry without mutating input', () => {
    const initial = emptyChatJournal()
    const first = appendUserMessage(initial, author, 'hello', 100)
    const second = appendSystemEvent(
      first?.journal ?? initial,
      {
        kind: 'memberLeft',
        memberId: 'member-a',
        name: 'Ann',
      },
      200,
    )

    expect(initial).toEqual({ entries: [], nextSequence: 1, memberIdsByClientId: {} })
    expect(first?.entry).toMatchObject({ id: 'chat-1', sequence: 1, createdAt: 100 })
    expect(second.entry).toMatchObject({ id: 'chat-2', sequence: 2, createdAt: 200 })
  })

  it('does not append invalid user text', () => {
    const initial = emptyChatJournal()
    expect(appendUserMessage(initial, author, '   ', 100)).toBeNull()
    expect(appendUserMessage(initial, author, 'x'.repeat(2_001), 100)).toBeNull()
    expect(initial.entries).toEqual([])
  })

  it('merges overlapping and out-of-order deliveries idempotently', () => {
    const second: UserChatEntry = {
      ...firstMessage,
      id: 'chat-2',
      sequence: 2,
      createdAt: 200,
      text: 'two',
    }
    const conflictingDuplicate = { ...firstMessage, text: 'changed' }

    expect(mergeChatEntries([second], [firstMessage, second, conflictingDuplicate])).toEqual([
      firstMessage,
      second,
    ])
  })

  it('never truncates the journal by entry count', () => {
    let journal = emptyChatJournal()
    for (let i = 0; i < 2_500; i += 1) {
      journal =
        appendUserMessage(journal, { ...author, role: 'host' }, `m${i}`, i)?.journal ?? journal
    }

    expect(journal.entries).toHaveLength(2_500)
    expect(journal.nextSequence).toBe(2_501)
  })
})

describe('chat runtime validation', () => {
  it('accepts valid empty and populated entry arrays', () => {
    expect(parseChatEntries([])).toEqual([])
    expect(parseChatEntries([firstMessage])).toEqual([firstMessage])
  })

  it.each([
    ['a non-array', {}],
    ['a null item', [null]],
    ['an unknown discriminant', [{ ...firstMessage, kind: 'other' }]],
    ['a non-positive sequence', [{ ...firstMessage, sequence: 0 }]],
    ['a fractional sequence', [{ ...firstMessage, sequence: 1.5 }]],
    ['a non-finite timestamp', [{ ...firstMessage, createdAt: Number.NaN }]],
    ['an empty entry id', [{ ...firstMessage, id: '' }]],
    ['an empty member id', [{ ...firstMessage, author: { ...author, memberId: '' } }]],
    ['an invalid role', [{ ...firstMessage, author: { ...author, role: 'owner' } }]],
    ['an empty author name', [{ ...firstMessage, author: { ...author, name: '' } }]],
    ['whitespace-only text', [{ ...firstMessage, text: '  ' }]],
    ['non-canonical surrounding whitespace', [{ ...firstMessage, text: ' one ' }]],
    ['overlong text', [{ ...firstMessage, text: 'x'.repeat(2_001) }]],
    [
      'a malformed system event',
      [
        {
          kind: 'system',
          id: 'chat-2',
          sequence: 2,
          createdAt: 200,
          event: { kind: 'modeChanged', setting: '', value: 'strategic' },
        },
      ],
    ],
  ])('rejects %s', (_case, value) => {
    expect(parseChatEntries(value)).toBeNull()
  })

  it('accepts every semantic system-event shape', () => {
    const events = [
      { kind: 'memberJoined', memberId: 'member-a', name: 'Ann' },
      { kind: 'memberLeft', memberId: 'member-a', name: 'Ann' },
      { kind: 'memberReconnected', memberId: 'member-a', name: 'Ann' },
      { kind: 'memberKicked', memberId: 'member-a', name: 'Ann' },
      { kind: 'roleChanged', memberId: 'member-a', name: 'Ann', role: 'spectator' },
      { kind: 'modeChanged', setting: 'gitBranch', value: 'strategic' },
    ]
    const entries = events.map((event, index) => ({
      kind: 'system',
      id: `chat-${index + 1}`,
      sequence: index + 1,
      createdAt: index,
      event,
    }))

    expect(parseChatEntries(entries)).toEqual(entries)
  })

  it('accepts a valid restored journal', () => {
    const value = {
      entries: [firstMessage],
      nextSequence: 2,
      memberIdsByClientId: { 'client-a': 'member-a' },
    }

    expect(parseChatJournal(value)).toEqual(value)
  })

  it('rejects an entry whose canonical id does not match its sequence', () => {
    expect(
      parseChatJournal({
        entries: [{ ...firstMessage, id: 'chat-2', sequence: 1 }],
        nextSequence: 2,
        memberIdsByClientId: { 'client-a': 'member-a' },
      }),
    ).toBeNull()
  })

  it.each([
    ['duplicate ids', [firstMessage, { ...firstMessage, sequence: 2 }], 3],
    ['duplicate sequences', [firstMessage, { ...firstMessage, id: 'chat-2' }], 3],
    ['a next sequence that reuses the tail', [firstMessage], 1],
    ['a non-positive next sequence', [], 0],
    ['a fractional next sequence', [], 1.5],
  ])('rejects a journal with %s', (_case, entries, nextSequence) => {
    expect(
      parseChatJournal({
        entries,
        nextSequence,
        memberIdsByClientId: { 'client-a': 'member-a' },
      }),
    ).toBeNull()
  })

  it.each([
    null,
    [],
    { '': 'member-a' },
    { 'client-a': '' },
    { 'client-a': 42 },
  ])('rejects malformed client-to-member mappings', (memberIdsByClientId) => {
    expect(parseChatJournal({ entries: [], nextSequence: 1, memberIdsByClientId })).toBeNull()
  })
})
