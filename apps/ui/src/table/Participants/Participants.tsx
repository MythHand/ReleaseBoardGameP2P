import Avatar from '@/primitives/Avatar'
import Badge, { type BadgeTone } from '@/primitives/Badge'
import Dropdown from '@/primitives/Dropdown'
import styles from './Participants.module.css'

export interface Participant {
  id: string
  name: string
  eliminated?: boolean
  connected?: boolean
}

export interface Spectator {
  id: string
  name: string
}

// Текст состава — приходит пропсом (компонент i18n-agnostic). Дефолт — русский.
export interface ParticipantsCopy {
  players: string
  spectators: string
  inGame: string
  eliminated: string
  connectionLost: string
  spectator: string
  noSpectators: string
  // подпись дропдауна действий (a11y) и пункт исключения зрителя — для хоста
  actions: string
  kick: string
}

export const PARTICIPANTS_COPY_RU: ParticipantsCopy = {
  players: 'игроки',
  spectators: 'зрители',
  inGame: 'в игре',
  eliminated: 'выбыл',
  connectionLost: 'потеряно соединение',
  spectator: 'зритель',
  noSpectators: 'пока без зрителей',
  actions: 'действия',
  kick: 'исключить',
}

export const PARTICIPANTS_COPY_EN: ParticipantsCopy = {
  players: 'players',
  spectators: 'spectators',
  inGame: 'in game',
  eliminated: 'eliminated',
  connectionLost: 'connection lost',
  spectator: 'spectator',
  noSpectators: 'no spectators yet',
  actions: 'actions',
  kick: 'kick',
}

interface ParticipantsProps {
  players?: Participant[]
  spectators?: Spectator[]
  copy?: ParticipantsCopy
  // хост видит у зрителей дропдаун «⋯» с исключением
  isHost?: boolean
  onKickSpectator?: (id: string) => void
}

// Полный состав стола: список игроков (в игре / выбыл / нет связи) и зрители.
export default function Participants({
  players = [],
  spectators = [],
  copy = PARTICIPANTS_COPY_RU,
  isHost = false,
  onKickSpectator,
}: ParticipantsProps) {
  return (
    <div className={styles.box}>
      <div className={styles.scroll}>
        <section className={styles.section}>
          <div className={styles.head}>
            {copy.players} <span className={styles.count}>{players.length}</span>
          </div>
          <ul className={styles.list}>
            {players.map((p) => {
              const lost = p.connected === false
              // выбывшим — серым (исход не важен); тем, кто в игре, потеря связи — красным
              const tone: BadgeTone = p.eliminated ? 'muted' : lost ? 'danger' : 'success'
              const text = lost ? copy.connectionLost : p.eliminated ? copy.eliminated : copy.inGame
              return (
                <li key={p.id} className={styles.row}>
                  <Avatar name={p.name} size={28} />
                  <span className={styles.name}>{p.name}</span>
                  <Badge tone={tone} className={styles.pushEnd}>
                    {text}
                  </Badge>
                </li>
              )
            })}
          </ul>
        </section>

        <section className={styles.section}>
          <div className={styles.head}>
            {copy.spectators} <span className={styles.count}>{spectators.length}</span>
          </div>
          <ul className={styles.list}>
            {spectators.map((s) => (
              <li key={s.id} className={styles.row}>
                <Avatar name={s.name} size={28} />
                <span className={styles.name}>{s.name}</span>
                <Badge tone="muted" className={styles.pushEnd}>
                  {copy.spectator}
                </Badge>
                {isHost && onKickSpectator && (
                  <Dropdown
                    items={[
                      { label: copy.kick, danger: true, onClick: () => onKickSpectator(s.id) },
                    ]}
                    ariaLabel={copy.actions}
                  />
                )}
              </li>
            ))}
            {spectators.length === 0 && <li className={styles.empty}>{copy.noSpectators}</li>}
          </ul>
        </section>
      </div>
    </div>
  )
}
