import Card from '@/primitives/Card'
import { COVERS, assetUrl } from '@/cards'
import styles from './Pile.module.css'

// Стопка карт: колода (рубашкой вверх) или сброс (верхняя карта лицом).
// Показывает «глубину» стопки + счётчик + подпись.
export default function Pile({
  label,
  count = 0,
  deck = 'base',
  topCard = null,
  width = '88px',
  countPos = 'br', // 'br' — бейдж в правом нижнем (сброс) | 'tl' — текст в левом верхнем (колоды)
}) {
  return (
    <div className={styles.pile} style={{ width }}>
      <div className={styles.stack}>
        <span className={styles.layer} aria-hidden="true" />
        <span className={styles.layer} aria-hidden="true" />
        <div className={styles.top}>
          {topCard ? (
            <Card card={topCard} interactive={false} width="100%" />
          ) : (
            <img
              className={styles.back}
              src={assetUrl(COVERS[deck] ?? COVERS.base)}
              alt=""
              draggable={false}
            />
          )}
        </div>
        {count > 0 && (
          <span className={`${styles.count} ${countPos === 'tl' ? styles.tl : styles.br}`}>
            {count}
          </span>
        )}
      </div>
      {label && <div className={styles.label}>{label}</div>}
    </div>
  )
}
