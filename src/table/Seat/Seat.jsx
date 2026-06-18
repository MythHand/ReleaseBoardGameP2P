import ReleaseZone from '@/table/ReleaseZone'
import styles from './Seat.module.css'

// Место оппонента: имя, индикатор хода, число карт в руке, мини-зона релиза.
export default function Seat({ player, active = false }) {
  return (
    <div className={`${styles.seat} ${active ? styles.active : ''}`}>
      <div className={styles.head}>
        <span className={styles.dot} aria-hidden="true" />
        <span className={styles.name}>{player.name}</span>
        <span className={styles.hand}>{player.handCount} карт</span>
      </div>
      <ReleaseZone release={player.release} size="72px" />
    </div>
  )
}
