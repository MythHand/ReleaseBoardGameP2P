import type { Card } from '@/cards/types'
import styles from './Card.module.css'

interface CardFaceProps {
  card: Card | null | undefined
}

// ТОЧКА ПОДМЕНЫ рендера лица карты.
// Сейчас — готовый PNG. Позже здесь можно ветвиться на собранное из кода лицо
// (например, по card.render === 'composed'), не трогая Card/окружение.
// card.art — уже разрешённый URL (assetUrl вызван в каталоге), берём напрямую.
export default function CardFace({ card }: CardFaceProps) {
  if (!card) return null
  return <img className={styles.img} src={card.art} alt={card.name} draggable={false} />
}
