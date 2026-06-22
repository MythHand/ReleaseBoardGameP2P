import { cardById } from '@/cards'
import type { Card } from '@/cards/types'
import type { Setup } from '@/game/modes'
import type { HistoryEntry } from '@/table/MoveHistory/MoveHistory'
import type { Participant, Spectator } from '@/table/Participants/Participants'
import type { HandCard } from './hand'
import { makeHand } from './hand'

// Пул возможных оппонентов (для вариативности 1-5; всего 2-6 игроков).
interface OpponentTemplate {
  id: string
  name: string
  handCount: number
  release: { frontend: string | null; backend: string | null; database: string | null }
}

interface ReleaseSlots {
  frontend: Card | undefined
  backend: Card | undefined
  database: Card | undefined
}

interface Opponent {
  id: string
  name: string
  handCount: number
  release: ReleaseSlots
}

interface TableState {
  you: {
    name: string
    hand: HandCard[]
    release: ReleaseSlots
  }
  opponents: Opponent[]
  decks: {
    main: number
    events: number
    discard: Card | undefined
    discardCount: number
  }
  turn: string | undefined
  history: HistoryEntry[]
  setup: Setup
  participants: Participant[]
  spectators: Spectator[]
}

const OPPONENT_POOL: OpponentTemplate[] = [
  {
    id: 'p2',
    name: 'kernel_panic',
    handCount: 5,
    release: { frontend: null, backend: 'release-backend', database: null },
  },
  {
    id: 'p3',
    name: 'segfault',
    handCount: 7,
    release: { frontend: null, backend: null, database: null },
  },
  {
    id: 'p4',
    name: 'null_ptr',
    handCount: 3,
    release: { frontend: 'release-frontend', backend: null, database: null },
  },
  {
    id: 'p5',
    name: 'race_cond',
    handCount: 6,
    release: { frontend: null, backend: null, database: 'release-database' },
  },
  {
    id: 'p6',
    name: 'off_by_one',
    handCount: 4,
    release: { frontend: null, backend: 'release-backend', database: null },
  },
]

const resolveRelease = (r: OpponentTemplate['release']): ReleaseSlots => ({
  frontend: r.frontend ? cardById(r.frontend) : undefined,
  backend: r.backend ? cardById(r.backend) : undefined,
  database: r.database ? cardById(r.database) : undefined,
})

// Мок-снимок стола. opponentCount: 1..5 — проверка вариативности раскладки.
export function makeTable(opponentCount = 3): TableState {
  const opponents: Opponent[] = OPPONENT_POOL.slice(0, opponentCount).map((o) => ({
    ...o,
    release: resolveRelease(o.release),
  }))

  return {
    you: {
      name: 'you',
      hand: makeHand(6),
      release: {
        frontend: cardById('release-frontend'),
        backend: undefined,
        database: cardById('release-database'),
      },
    },
    opponents,
    decks: {
      main: 78,
      events: 21,
      discard: cardById('attack-security-bug'),
      discardCount: 12,
    },
    turn: opponents[Math.min(1, opponents.length - 1)]?.id,

    // Полный состав: игроки (в игре / выбыл / нет связи) + зрители.
    // i===0: в игре, но потеряна связь (красный); i===1: выбыл и без связи (серый)
    participants: [
      { id: 'you', name: 'you', eliminated: false, connected: true },
      ...opponents.map((o, i) => ({
        id: o.id,
        name: o.name,
        eliminated: i === 1,
        connected: i > 1,
      })),
    ],
    spectators: [
      { id: 'sp1', name: 'oracle' },
      { id: 'sp2', name: 'cypher' },
    ],

    // Игровой режим — выбор хоста до старта (read-only на столе).
    setup: {
      handLimit: '8bit',
      releases: 'fast',
      releaseCond: 'base',
      ai: 'less',
      gitBranch: 'strategic',
    },

    // История ходов (сверху — раньше). Демонстрирует все кейсы:
    // реакции/последствия — иерархией (children).
    history: [
      // релиз → атака → отмена защитой (Not a Bug, работает даже против Sudo)
      {
        id: 1,
        who: 'kernel_panic',
        kind: 'релиз',
        card: 'Backend',
        cat: 'release',
        children: [
          { id: 11, who: 'you', kind: 'атака', card: 'Security Bug', cat: 'attack' },
          { id: 12, who: 'kernel_panic', kind: 'защита', card: 'Not a Bug', cat: 'defense' },
        ],
      },
      // релиз → усиленная атака (Bug + Sudo) → возврат эффекта (Works on my Machine)
      {
        id: 2,
        who: 'you',
        kind: 'релиз',
        card: 'Frontend',
        cat: 'release',
        children: [
          {
            id: 21,
            who: 'segfault',
            kind: 'атака',
            card: 'Bug',
            cat: 'attack',
            combo: { card: 'Sudo', cat: 'support' },
          },
          {
            id: 22,
            who: 'you',
            kind: 'защита',
            card: 'Works on my Machine',
            cat: 'defense',
            redirect: 'segfault',
          },
        ],
      },
      // выкладывание защиты на стол
      { id: 3, who: 'null_ptr', kind: 'выложил', card: 'Monitoring', cat: 'protection' },
      // целенаправленный розыгрыш по карте: DDoS → Monitoring (мечик)
      {
        id: 4,
        who: 'segfault',
        kind: 'атака',
        card: 'DDoS',
        cat: 'attack',
        target: { card: 'Monitoring', cat: 'protection' },
      },
      // целенаправленная атака по игроку (забрать карту) → Rollback вернул карту
      {
        id: 5,
        who: 'race_cond',
        kind: 'атака',
        card: 'Out of Memory',
        cat: 'attack',
        target: { player: 'null_ptr' },
        children: [
          {
            id: 51,
            who: 'null_ptr',
            kind: 'защита',
            card: 'Rollback',
            cat: 'defense',
            returnCard: 'race_cond',
          },
        ],
      },
      // вскрытый добор Error 503 → нейтрализован Debugger (protection)
      {
        id: 6,
        who: 'kernel_panic',
        kind: 'добор',
        card: 'Error 503',
        cat: 'trigger',
        children: [
          { id: 61, who: 'kernel_panic', kind: 'защита', card: 'Debugger', cat: 'protection' },
        ],
      },
      // релиз со связкой Code Review (неуязвим к атакам)
      {
        id: 7,
        who: 'you',
        kind: 'релиз',
        card: 'Backend',
        cat: 'release',
        combo: { card: 'Code Review', cat: 'support' },
      },
      // вскрытый добор AI → случайный эффект из AI-колоды (иерархией), у него своя цель
      {
        id: 8,
        who: 'segfault',
        kind: 'добор',
        card: 'AI',
        cat: 'trigger',
        children: [
          {
            id: 81,
            who: 'segfault',
            kind: 'эффект',
            card: 'Crush Database',
            cat: 'ai',
            target: { card: 'Database', cat: 'release' },
          },
        ],
      },
      // вскрытый добор Error 503 → не нейтрализован → выбывание (серая строка)
      {
        id: 9,
        who: 'null_ptr',
        kind: 'добор',
        card: 'Error 503',
        cat: 'trigger',
        children: [{ id: 91, who: 'null_ptr', kind: 'выбыл' }],
      },
    ],
  }
}
