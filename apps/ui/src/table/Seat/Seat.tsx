import ReleaseZone from '@/table/ReleaseZone'
import type { ReleaseSlots } from '@/table/ReleaseZone/ReleaseZone'
import styles from './Seat.module.css'

interface Player {
  id: string
  name: string
  handCount: number
  release: ReleaseSlots
}

export interface SeatCopy {
  eliminated: string
  disconnected: string
  // unit for the hand-card count, e.g. "карт" → rendered as "5 карт"
  cards: string
}

interface SeatProps {
  player: Player
  active?: boolean
  eliminated?: boolean
  disconnected?: boolean
  copy: SeatCopy
}

// Место оппонента: имя, индикатор хода, число карт / статус, мини-зона релиза.
export default function Seat({
  player,
  active = false,
  eliminated = false,
  disconnected = false,
  copy,
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
          <span className={`${styles.status} ${styles.out}`}>{copy.eliminated}</span>
        ) : disconnected ? (
          <span className={`${styles.status} ${styles.lost}`}>{copy.disconnected}</span>
        ) : (
          <span className={styles.hand}>
            {player.handCount} {copy.cards}
          </span>
        )}
      </div>
      <ReleaseZone release={player.release} size="72px" />
    </div>
  )
}
