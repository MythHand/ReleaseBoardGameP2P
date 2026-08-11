import type { Card as CardType } from '@/cards/types'
import Card from '@/primitives/Card'
import styles from './CardPair.module.css'

// Поза покоя вспомогательной карты внутри пары — ОДНО объявление на всех.
// Объявлена ДАННЫМИ, а строка выводится из них, потому что читателей трое и им
// нужны разные формы: сама пара ставит строку инлайном, складывание
// play('foldIntoPair') садится на ту же строку финальным кадром, а шаг ухода в
// сброс при распаде пары берёт УГОЛ ЧИСЛОМ — половина улетает своим полётом и
// должна стартовать с того наклона, который был виден. Из строки число не
// достать, и раньше рядом стояло второе объявление.
// Тот же приём, что Scatter + restTransform() у кучи сброса: поза — значение,
// CSS — её представление.
export const PAIR_AUX = {
  rot: -7, // наклон, градусы
  dy: -26, // подъём, % от высоты карты (её место шаг берёт из измеренного rect)
}

export const PAIR_AUX_POSE = `translateY(${PAIR_AUX.dy}%) rotate(${PAIR_AUX.rot}deg)`

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
