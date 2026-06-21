import { COVERS } from '@/cards'
import styles from './Card.module.css'

interface CardBackProps {
  deck?: 'base' | 'ai'
}

// Рубашка определяется колодой: base → зелёная, ai → фиолетовая.
// COVERS значения — уже разрешённые URL (assetUrl вызван в каталоге), берём напрямую.
export default function CardBack({ deck = 'base' }: CardBackProps) {
  return (
    <img
      className={styles.img}
      src={COVERS[deck] ?? COVERS.base}
      alt=""
      draggable={false}
    />
  )
}
