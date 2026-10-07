import type { ChatMessage, ChatRole } from '@/blocks/Chat'

// Мок переписки в лобби. Ники — из того же ряда, что и в остальных моках;
// локальный игрок здесь `deadlock`, и узнаётся он отметкой, а не именем.
// В ленте нарочно собраны все состояния разом: хост, игрок, зритель,
// технические записи и реплика того, кто уже вышел.
export const CHAT_SELF = 'deadlock'

// The players' avatars by nickname — the same people in the chat, voice, table
// and stats mocks, so every panel shows each of them the same. A spectator has
// none (SyntaxSeagull plays in the stats mock and only watches in the voice one).
const MOCK_AVATARS: Record<string, string> = {
  TabsOverSpaces: 'support-sudo',
  segfault: 'attack-bug',
  [CHAT_SELF]: 'release-frontend',
  null_ptr: 'defense-rubber-ducky',
  race_cond: 'attack-ddos',
  kernel_panic: 'attack-out-of-memory',
  off_by_one: 'defense-hotfix',
  SyntaxSeagull_9000_x: 'defense-not-a-bug',
}

// a player's avatar (the host is a player too); a spectator has none
export function mockAvatar(name?: string, role?: ChatRole): string | undefined {
  return name && role && role !== 'spectator' ? MOCK_AVATARS[name] : undefined
}

// The feed with each author's avatar. Applied when a page hands the feed to the
// chat, so a line whose role a page repaints (mine, as a spectator) follows it.
export function withMockAvatars(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) => (m.system ? m : { ...m, avatar: mockAvatar(m.who, m.role) }))
}

export function makeChat(): ChatMessage[] {
  return [
    {
      id: 'm1',
      who: 'TabsOverSpaces',
      role: 'host',
      text: 'ну что, ещё партию?',
      time: '20:14',
    },
    {
      id: 'm2',
      who: 'segfault',
      role: 'player',
      text: 'я за, только колоду поменяйте',
      time: '20:14',
    },
    {
      id: 'm3',
      who: 'segfault',
      role: 'player',
      text: 'база третий раз подряд уже, надоело немного',
      time: '20:15',
    },
    { id: 'm4', system: true, text: 'null_ptr присоединился' },
    {
      id: 'm5',
      who: 'race_cond',
      role: 'player',
      gone: true,
      text: 'я отваливаюсь, всем удачи',
      time: '20:15',
    },
    { id: 'm6', system: true, text: 'race_cond покинул лобби' },
    {
      id: 'm7',
      who: 'oracle',
      role: 'spectator',
      text: 'посмотрю со стороны',
      time: '20:15',
    },
    {
      id: 'm8',
      who: CHAT_SELF,
      role: 'player',
      text: 'ставлю стратегическую',
      time: '20:16',
    },
    { id: 'm9', system: true, text: 'хост сменил режим добора: стратегический' },
    { id: 'm10', who: 'null_ptr', role: 'player', text: 'мне норм', time: '20:16' },
    {
      id: 'm11',
      who: 'TabsOverSpaces',
      role: 'host',
      text: 'тогда стартуем как соберёмся',
      time: '20:16',
    },
  ]
}
