import { cardById } from '@/cards'
import { makeHand } from './hand'

// Пул возможных оппонентов (для вариативности 1-5; всего 2-6 игроков).
const OPPONENT_POOL = [
  { id: 'p2', name: 'kernel_panic', handCount: 5, release: { frontend: null, backend: 'release-backend', database: null } },
  { id: 'p3', name: 'segfault', handCount: 7, release: { frontend: null, backend: null, database: null } },
  { id: 'p4', name: 'null_ptr', handCount: 3, release: { frontend: 'release-frontend', backend: null, database: null } },
  { id: 'p5', name: 'race_cond', handCount: 6, release: { frontend: null, backend: null, database: 'release-database' } },
  { id: 'p6', name: 'off_by_one', handCount: 4, release: { frontend: null, backend: 'release-backend', database: null } },
]

const resolveRelease = (r) => ({
  frontend: r.frontend ? cardById(r.frontend) : null,
  backend: r.backend ? cardById(r.backend) : null,
  database: r.database ? cardById(r.database) : null,
})

// Мок-снимок стола. opponentCount: 1..5 — проверка вариативности раскладки.
export function makeTable(opponentCount = 3) {
  const opponents = OPPONENT_POOL.slice(0, opponentCount).map((o) => ({
    ...o,
    release: resolveRelease(o.release),
  }))

  return {
    you: {
      name: 'you',
      hand: makeHand(6),
      release: {
        frontend: cardById('release-frontend'),
        backend: null,
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

    // История ходов: акцент на названиях карт + цвет типа карты (cat).
    // Атаки/защиты по релизу — вложены под действием релиза (children).
    history: [
      {
        id: 1, who: 'kernel_panic', kind: 'релиз', card: 'Backend', cat: 'release',
        children: [
          { id: 11, who: 'you', kind: 'атака', card: 'Security Bug', cat: 'attack' },
          { id: 12, who: 'kernel_panic', kind: 'защита', card: 'Not a Bug', cat: 'defense' },
        ],
      },
      { id: 2, who: 'segfault', kind: 'добор', text: 'взял карту' },
      { id: 3, who: 'segfault', kind: 'AI', card: 'Crush Database', cat: 'ai' },
      { id: 4, who: 'null_ptr', kind: 'выложил', card: 'Monitoring', cat: 'protection' },
      {
        id: 5, who: 'you', kind: 'релиз', card: 'Frontend', cat: 'release',
        children: [
          { id: 51, who: 'segfault', kind: 'атака', card: 'DDoS', cat: 'attack' },
          { id: 52, who: 'you', kind: 'защита', card: 'Works on my Machine', cat: 'defense' },
        ],
      },
      { id: 6, who: 'race_cond', kind: 'усиление', card: 'Sudo', cat: 'support' },
      { id: 7, who: 'kernel_panic', kind: 'git', card: 'System Upgrade', cat: 'operation' },
      { id: 8, who: 'null_ptr', kind: 'конец хода', text: 'PUSH' },
    ],

    // Настройки партии — строчные табы (выбор хоста до старта). Read-only.
    modes: [
      { label: 'Лимит карт в руке', options: ['Base', '8 bit', 'Memory Problem'], active: 'Base' },
      { label: 'Релизов за ход', options: ['Base', 'Fast Release'], active: 'Fast Release' },
      { label: 'Условие релиза', options: ['Base', 'Easy Release'], active: 'Base' },
      { label: 'Кол-во AI', options: ['Base', 'Less AI Random', 'No AI'], active: 'Base' },
      { label: 'Release Profit', options: ['Выкл', 'Вкл'], active: 'Вкл' },
      { label: 'AI Dice (d12)', options: ['Выкл', 'Вкл'], active: 'Выкл' },
    ],
  }
}
