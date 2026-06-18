import { assetUrl } from '@/cards'
import styles from './Card.module.css'

// ТОЧКА ПОДМЕНЫ рендера лица карты.
// Сейчас — готовый PNG. Позже здесь можно ветвиться на собранное из кода лицо
// (например, по card.render === 'composed'), не трогая Card/окружение.
export default function CardFace({ card }) {
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
