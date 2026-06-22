import type { StatPlayer } from '@/screens/Stats'

export interface StatsData {
  winnerId: string
  players: StatPlayer[]
}

// Мок итогов партии. location — где участник сейчас в пост-игровом флоу:
// 'game' (на столе) | 'stats' (на статистике) | 'lobby' (в лобби) | 'offline' (нет связи).
export function makeStats(): StatsData {
  return {
    winnerId: 'you',
    players: [
      // attack — сыграно атакующих (красные); defense — защитных (синие+фиолетовые)
      {
        id: 'you',
        name: 'you',
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
        name: 'kernel_panic',
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
        name: 'segfault',
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
