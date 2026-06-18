import { COVERS, assetUrl } from '@/cards'
import styles from './Card.module.css'

// Рубашка определяется колодой: base → зелёная, ai → фиолетовая.
export default function CardBack({ deck = 'base' }) {
  return (
    <img
      className={styles.img}
      src={assetUrl(COVERS[deck] ?? COVERS.base)}
      alt=""
      draggable={false}
    />
  )
}
