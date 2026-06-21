import { CARDS } from '@/cards'

// Мок руки: список «инстансов» карт. uid — стабильный ключ инстанса
// (одна и та же карта каталога может встречаться несколько раз).
let _n = 0
const uid = () => `h${++_n}`

export function makeHand(size = 6) {
  return Array.from({ length: size }, (_, i) => ({
    uid: uid(),
    card: CARDS[i % CARDS.length],
  }))
}

export { uid as nextHandUid }
