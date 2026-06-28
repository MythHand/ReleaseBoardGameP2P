import type { Card as CardType } from '@/cards/types'
import Card from '@/primitives/Card'
import styles from './CardPair.module.css'

interface CardPairProps {
  // основная карта (сверху)
  main: CardType
  // вспомогательная (Sudo и т.п.) — подтыкается под основную под углом
  aux: CardType
  width?: string
}

// Пара карт: основная сверху, вспомогательная подтыкается под углом снизу
// (видна её верхняя кромка). data-main/data-aux — якоря для покадровой анимации
// «сцепления» (см. ComboStory).
export default function CardPair({ main, aux, width }: CardPairProps) {
  return (
    <div className={styles.pair} style={width ? { width } : undefined}>
      <div className={styles.aux} data-aux>
        <Card card={aux} interactive={false} width="100%" />
      </div>
      <div className={styles.main} data-main>
        <Card card={main} interactive={false} width="100%" />
      </div>
    </div>
  )
}
