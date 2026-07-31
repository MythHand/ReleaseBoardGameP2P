import Badge from '@/primitives/Badge'
import StatusDot from '@/primitives/StatusDot'
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
  // status dot — colour by state; idle seats hold a static dot, offline and the
  // active turn pulse to read as live
  const status = disconnected ? 'offline' : active ? 'active' : 'idle'
  const statusAccent =
    status === 'offline'
      ? 'var(--coral)'
      : status === 'active'
        ? 'var(--brand-green)'
        : 'var(--white-25)'
  const statusPulse = status !== 'idle'
  return (
    <div
      data-testid={`seat-${player.id}`}
      className={`${styles.seat} ${active ? styles.active : ''} ${
        eliminated ? styles.eliminated : ''
      } ${disconnected ? styles.disconnected : ''}`}
    >
      <div className={styles.head}>
        <StatusDot accent={statusAccent} pulse={statusPulse} size={7} />
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
            <span data-testid="hand-count">{player.handCount}</span> {copy.cards}
          </span>
        )}
      </div>
      <ReleaseZone release={player.release} size="72px" variant="compact" />
    </div>
  )
}
