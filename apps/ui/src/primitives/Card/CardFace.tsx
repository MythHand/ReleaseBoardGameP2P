import type { Card } from '@/cards/types'
import { assetUrl } from '@/cards'
import styles from './Card.module.css'

interface CardFaceProps {
  card: Card | null | undefined
}

// ТОЧКА ПОДМЕНЫ рендера лица карты.
// Сейчас — готовый PNG. Позже здесь можно ветвиться на собранное из кода лицо
// (например, по card.render === 'composed'), не трогая Card/окружение.
export default function CardFace({ card }: CardFaceProps) {
  if (!card) return null
  return (
    <img
      className={styles.img}
      src={assetUrl(card.art)}
      alt={card.name}
      draggable={false}
    />
  )
}
