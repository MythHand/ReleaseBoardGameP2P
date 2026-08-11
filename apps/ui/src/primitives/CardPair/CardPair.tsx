import type { Card as CardType } from '@/cards/types'
import Card from '@/primitives/Card'
import styles from './CardPair.module.css'

// Поза покоя вспомогательной карты внутри пары — ОДНО объявление на всех.
// Живёт в TS, а не в CSS, потому что читателей двое: сама пара (инлайн ниже) и
// анимация складывания (play('foldIntoPair') целится ровно сюда). Тот же приём,
// что у restTransform() для кучи сброса: одна поза ведёт и полёт, и покой —
// поэтому передача пары из флаера в статичный слот ничего не меняет на экране.
export const PAIR_AUX_POSE = 'translateY(-26%) rotate(-7deg)'

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
      <div className={styles.aux} data-aux style={{ transform: PAIR_AUX_POSE }}>
        <Card card={aux} interactive={false} width="100%" />
      </div>
      <div className={styles.main} data-main>
        <Card card={main} interactive={false} width="100%" />
      </div>
    </div>
  )
}
