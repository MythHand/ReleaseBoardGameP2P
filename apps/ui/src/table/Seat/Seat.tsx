import Badge from '@/primitives/Badge'
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
  eliminated?: boolean
  disconnected?: boolean
}

// Место оппонента: имя, индикатор хода, число карт / статус, мини-зона релиза.
export default function Seat({
  player,
  active = false,
  eliminated = false,
  disconnected = false,
}: SeatProps) {
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
          <Badge tone="muted" size="sm" className={styles.status}>
            выбыл
          </Badge>
        ) : disconnected ? (
          <Badge tone="danger" size="sm" className={styles.status}>
            нет связи
          </Badge>
        ) : (
          <span className={styles.hand}>{player.handCount} карт</span>
        )}
      </div>
      <ReleaseZone release={player.release} size="72px" />
    </div>
  )
}
