import ReleaseZone from '@/table/ReleaseZone'
import styles from './Seat.module.css'

// Место оппонента: имя, индикатор хода, число карт / статус, мини-зона релиза.
export default function Seat({ player, active = false, eliminated = false, disconnected = false }) {
  return (
    <div
      className={`${styles.seat} ${active ? styles.active : ''} ${
        eliminated ? styles.eliminated : ''
      } ${disconnected ? styles.disconnected : ''}`}
    >
      <div className={styles.head}>
        <span className={styles.dot} aria-hidden="true" />
        <span className={styles.name}>{player.name}</span>
        {eliminated ? (
          <span className={`${styles.status} ${styles.out}`}>выбыл</span>
        ) : disconnected ? (
          <span className={`${styles.status} ${styles.lost}`}>нет связи</span>
        ) : (
          <span className={styles.hand}>{player.handCount} карт</span>
        )}
      </div>
      <ReleaseZone release={player.release} size="72px" />
    </div>
  )
}
