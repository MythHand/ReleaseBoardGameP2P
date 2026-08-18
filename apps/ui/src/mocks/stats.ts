import type { StatPlayer } from '@/screens/Stats'

export interface StatsData {
  winnerId: string
  selfId: string
  players: StatPlayer[]
}

// Мок итогов партии. location — где участник сейчас в пост-игровом флоу:
// 'game' (на столе) | 'stats' (на статистике) | 'lobby' (в лобби) | 'offline' (нет связи).
// Локальный игрок носит такой же ник, как все — «это ты» несёт отдельная
// отметка (selfId), а не подменённое имя.
// Длины ников РАЗНЫЕ намеренно: 8 / 14 / 20 символов при пределе поля в 20.
// Лидеры показателей — you, p2 и p3, поэтому каждый из трёх шагов кегля имени
// попадает на свою плашку ачивки, и раскладка видна на одном экране.
export function makeStats(): StatsData {
  return {
    winnerId: 'you',
    selfId: 'you',
    players: [
      // attack — сыграно атакующих (красные); defense — защитных (синие+фиолетовые)
      {
        id: 'you',
        name: 'deadlock',
        location: 'stats',
        attack: 5,
        defense: 3,
        ddos: 1,
        attackedInto: 4,
        ai: 2,
        err503: 2,
        cherryPick: 3,
      },
      {
        id: 'p2',
        name: 'TabsOverSpaces',
        location: 'lobby',
        attack: 8,
        defense: 2,
        ddos: 4,
        attackedInto: 2,
        ai: 1,
        err503: 0,
        cherryPick: 0,
      },
      {
        id: 'p3',
        name: 'SyntaxSeagull_9000_x',
        location: 'game',
        attack: 3,
        defense: 4,
        ddos: 0,
        attackedInto: 6,
        ai: 3,
        err503: 1,
        cherryPick: 1,
      },
      {
        id: 'p4',
        name: 'null_ptr',
        location: 'offline',
        attack: 6,
        defense: 5,
        ddos: 2,
        attackedInto: 3,
        ai: 0,
        err503: 1,
        cherryPick: 2,
      },
    ],
  }
}
