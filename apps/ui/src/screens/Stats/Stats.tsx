import { cardById } from '@/cards'
import Button from '@/primitives/Button'
import Card from '@/primitives/Card'
import styles from './Stats.module.css'

type Location = 'game' | 'stats' | 'lobby' | 'offline'
type MetricKey = 'ddos' | 'ai' | 'err503' | 'cherryPick' | 'attackedInto'

export interface StatPlayer {
  id: string
  name: string
  location: Location
  attack: number
  defense: number
  ddos: number
  attackedInto: number
  ai: number
  err503: number
  cherryPick: number
}

interface StatsProps {
  winnerId: string
  players?: StatPlayer[]
}

interface Achievement {
  key: MetricKey
  title: string
  unit: string
  cards: string[]
  wide?: boolean
}

const LOCATION: Record<Location, string> = {
  game: 'в игре',
  stats: 'на статистике',
  lobby: 'в лобби',
  offline: 'не в сети',
}

// Ачивки: обладатель — игрок с максимумом по показателю. cards — превью карт.
// Порядок задаёт раскладку: 3 равных в ряд, затем 1 обычной ширины и широкий
// «Забагованный» (на 2 карточки) со всеми картами атаки + Error 503.
const ACHIEVEMENTS: Achievement[] = [
  { key: 'ddos', title: 'King of DDoS', unit: 'раз сыграл DDoS', cards: ['attack-ddos'] },
  { key: 'ai', title: 'AI зависимый', unit: 'карт AI из колоды', cards: ['trigger-ai'] },
  { key: 'err503', title: 'Везучий', unit: 'ошибок 503 из колоды', cards: ['trigger-error-503'] },
  {
    key: 'cherryPick',
    title: 'Кладоискатель',
    unit: 'раз достал из сброса',
    cards: ['operation-git-cherry-pick'],
  },
  {
    key: 'attackedInto',
    title: 'Забагованный',
    unit: 'карт атаки прилетело',
    wide: true,
    // первая в DOM — ниже всех в стопке; последняя — сверху. Error 503 снизу, Bug сверху.
    cards: [
      'trigger-error-503',
      'attack-ddos',
      'attack-security-bug',
      'attack-legacy-code',
      'attack-out-of-memory',
      'attack-bug',
    ],
  },
]

export default function Stats({ winnerId, players = [] }: StatsProps) {
  const winner = players.find((p) => p.id === winnerId)
  const leader = (key: MetricKey): StatPlayer | undefined =>
    players.length ? players.reduce((best, p) => (p[key] > best[key] ? p : best)) : undefined

  return (
    <div className={styles.stats}>
      <header className={styles.head}>
        <h1 className={styles.title}>Итоги партии</h1>
        <p className={styles.sub}>Партия завершена</p>
      </header>

      {winner && (
        <div className={styles.winner}>
          <span className={styles.crown}>♛</span>
          <div>
            <div className={styles.winnerLabel}>победитель</div>
            <div className={styles.winnerName}>{winner.name}</div>
          </div>
        </div>
      )}

      <div className={styles.table}>
        <div className={`${styles.row} ${styles.thead}`}>
          <span className={styles.colName}>игрок</span>
          <span className={styles.colLoc}>где сейчас</span>
          <span className={`${styles.colNum} ${styles.hAttack}`}>атакующих</span>
          <span className={`${styles.colNum} ${styles.hDefense}`}>защитных</span>
        </div>
        <ul className={styles.rows}>
          {players.map((p) => (
            <li key={p.id} className={`${styles.row} ${p.id === winnerId ? styles.rowWin : ''}`}>
              <span className={styles.colName}>
                <span className={styles.avatar}>{p.name[0]?.toUpperCase()}</span>
                <span className={styles.name}>{p.name}</span>
                {p.id === winnerId && <span className={styles.winTag}>winner</span>}
              </span>
              <span className={styles.colLoc}>
                <span className={`${styles.loc} ${styles[`loc_${p.location}`] ?? ''}`}>
                  {LOCATION[p.location]}
                </span>
              </span>
              <span className={`${styles.colNum} ${styles.numAttack}`}>{p.attack}</span>
              <span className={`${styles.colNum} ${styles.numDefense}`}>{p.defense}</span>
            </li>
          ))}
        </ul>
      </div>

      <footer className={styles.foot}>
        <Button>в лобби</Button>
      </footer>

      <div className={styles.achievements}>
        {ACHIEVEMENTS.map((a) => {
          const top = leader(a.key)
          if (!top) return null
          return (
            <div key={a.key} className={`${styles.ach} ${a.wide ? styles.achWide : ''}`}>
              <div className={`${styles.achArt} ${a.wide ? styles.achFan : ''}`}>
                {a.cards.map((id) => {
                  const card = cardById(id)
                  return card ? (
                    <Card
                      key={id}
                      card={card}
                      width={a.wide ? '64px' : '84px'}
                      interactive={false}
                    />
                  ) : null
                })}
              </div>
              <div className={styles.achBody}>
                <div className={styles.achHolder}>{top.name}</div>
                <div className={styles.achTitle}>{a.title}</div>
                <div className={styles.achStat}>
                  <span className={styles.achValue}>{top[a.key]}</span>
                  <span className={styles.achUnit}>{a.unit}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
