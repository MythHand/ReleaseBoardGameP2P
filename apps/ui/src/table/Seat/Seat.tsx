import ReleaseZone from '@/table/ReleaseZone'
import type { ReleaseSlots } from '@/table/ReleaseZone/ReleaseZone'
import styles from './Seat.module.css'

interface Player {
  id: string
  name: string
  handCount: number
  release: ReleaseSlots
}

interface SeatProps {
  player: Player
  active?: boolean
}

// Место оппонента: имя, индикатор хода, число карт в руке, мини-зона релиза.
export default function Seat({ player, active = false }: SeatProps) {
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
