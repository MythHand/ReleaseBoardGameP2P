import Badge from '@/primitives/Badge'
import StatusDot from '@/primitives/StatusDot'
import ReleaseZone from '@/table/ReleaseZone'
import type { ReleaseSlots } from '@/table/ReleaseZone/ReleaseZone'
import type { TableTarget } from '@/table/Table/intents'
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
  // проброс до слотов мини-зоны релиза: потребителю нужен DOM-узел конкретного
  // слота, чтобы прицелить в него полёт карты (Security Bug забирает чужой
  // релиз в СВОЮ зону). Чисто позиционный хук, на вид не влияет.
  slotRef?: (key: keyof ReleaseSlots, el: HTMLDivElement | null) => void
  // legality is the engine's answer: the seat (and its release zone) highlight
  // and accept a click only for what appears in `targets` — Seat decides
  // nothing about which plays are legal.
  onPick?: (target: TableTarget) => void
  targets?: TableTarget[]
}

// Место оппонента: имя, индикатор хода, число карт / статус, мини-зона релиза.
export default function Seat({
  player,
  active = false,
  eliminated = false,
  disconnected = false,
  copy,
  slotRef,
  onPick,
  targets = [],
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

  const playerTargetable = targets.some((t) => t.kind === 'player' && t.player === player.id)
  const releaseTargets = targets.filter(
    (t) => (t.kind === 'release' || t.kind === 'monitoring') && t.player === player.id,
  )

  const pickPlayer = () => onPick?.({ kind: 'player', player: player.id })

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: actionable only when playerTargetable — role=button + onKeyDown + tabIndex below; otherwise plain presentational seat
    <div
      data-testid={`seat-${player.id}`}
      className={`${styles.seat} ${active ? styles.active : ''} ${
        eliminated ? styles.eliminated : ''
      } ${disconnected ? styles.disconnected : ''} ${playerTargetable ? styles.targetable : ''}`}
      onClick={playerTargetable ? pickPlayer : undefined}
      onKeyDown={
        playerTargetable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') pickPlayer()
            }
          : undefined
      }
      role={playerTargetable ? 'button' : undefined}
      tabIndex={playerTargetable ? 0 : undefined}
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
      {/* зона СОПЕРНИКА — карты в ней не читают, поэтому LOD; своя зона игрока
          остаётся полной (её включает сам экран, а не этот компонент) */}
      <ReleaseZone
        release={player.release}
        size="72px"
        variant="compact"
        slotRef={slotRef}
        lod
        player={player.id}
        onPick={onPick}
        targets={releaseTargets}
      />
    </div>
  )
}
