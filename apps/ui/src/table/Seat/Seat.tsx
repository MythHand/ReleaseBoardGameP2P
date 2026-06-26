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

// Текст места — приходит пропсом (компонент i18n-agnostic). Дефолт — русский.
export interface SeatCopy {
  eliminated: string
  disconnected: string
  cards: string
}

export const SEAT_COPY_RU: SeatCopy = {
  eliminated: 'выбыл',
  disconnected: 'нет связи',
  cards: 'карт',
}

export const SEAT_COPY_EN: SeatCopy = {
  eliminated: 'eliminated',
  disconnected: 'offline',
  cards: 'cards',
}

interface SeatProps {
  player: Player
  active?: boolean
  eliminated?: boolean
  disconnected?: boolean
  copy?: SeatCopy
}

// Место оппонента: имя, индикатор хода, число карт / статус, мини-зона релиза.
export default function Seat({
  player,
  active = false,
  eliminated = false,
  disconnected = false,
  copy = SEAT_COPY_RU,
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
            {copy.eliminated}
          </Badge>
        ) : disconnected ? (
          <Badge tone="danger" size="sm" className={styles.status}>
            {copy.disconnected}
          </Badge>
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
