import Avatar from '@/primitives/Avatar'
import Badge, { type BadgeTone } from '@/primitives/Badge'
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

interface ParticipantsProps {
  players?: Participant[]
  spectators?: Spectator[]
}

// Полный состав стола: список игроков (в игре / выбыл / нет связи) и зрители.
export default function Participants({ players = [], spectators = [] }: ParticipantsProps) {
  return (
    <div className={styles.box}>
      <div className={styles.scroll}>
        <section className={styles.section}>
          <div className={styles.head}>
            игроки <span className={styles.count}>{players.length}</span>
          </div>
          <ul className={styles.list}>
            {players.map((p) => {
              const lost = p.connected === false
              // выбывшим — серым (исход не важен); тем, кто в игре, потеря связи — красным
              const tone: BadgeTone = p.eliminated ? 'muted' : lost ? 'danger' : 'success'
              const text = lost ? 'потеряно соединение' : p.eliminated ? 'выбыл' : 'в игре'
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
            зрители <span className={styles.count}>{spectators.length}</span>
          </div>
          <ul className={styles.list}>
            {spectators.map((s) => (
              <li key={s.id} className={styles.row}>
                <Avatar name={s.name} size={28} />
                <span className={styles.name}>{s.name}</span>
                <Badge tone="muted" className={styles.pushEnd}>
                  зритель
                </Badge>
              </li>
            ))}
            {spectators.length === 0 && <li className={styles.empty}>пока без зрителей</li>}
          </ul>
        </section>
      </div>
    </div>
  )
}
