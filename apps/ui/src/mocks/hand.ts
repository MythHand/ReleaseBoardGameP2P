import { CARDS } from '@/cards'
import type { Card } from '@/cards/types'

// Мок руки: список «инстансов» карт. uid — стабильный ключ инстанса
// (одна и та же карта каталога может встречаться несколько раз).
let _n = 0
const uid = (): string => `h${++_n}`

export interface HandCard {
  uid: string
  card: Card
}

export function makeHand(size = 6): HandCard[] {
  return Array.from({ length: size }, (_, i) => ({
    uid: uid(),
    card: CARDS[i % CARDS.length],
  }))
}

export { uid as nextHandUid }
