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

// Display copy injected by the consuming app (library stays i18n-agnostic).
export interface StatsCopy {
  title: string
  sub: string
  winnerLabel: string
  winTag: string
  colName: string
  colLocation: string
  colAttacking: string
  colDefending: string
  toLobby: string
  location: Record<Location, string>
  achievements: Record<MetricKey, { title: string; unit: string }>
}

interface StatsProps {
  winnerId: string
  players?: StatPlayer[]
  copy: StatsCopy
}

// Structural achievement defs — title/unit come from copy.achievements by key.
// cards — превью карт. Порядок задаёт раскладку: 3 равных в ряд, затем 1 обычной
// ширины и широкий «Забагованный» (на 2 карточки) со всеми картами атаки + Error 503.
interface AchievementDef {
  key: MetricKey
  cards: string[]
  wide?: boolean
}

const ACHIEVEMENTS: AchievementDef[] = [
  { key: 'ddos', cards: ['attack-ddos'] },
  { key: 'ai', cards: ['trigger-ai'] },
  { key: 'err503', cards: ['trigger-error-503'] },
  { key: 'cherryPick', cards: ['operation-git-cherry-pick'] },
  {
    key: 'attackedInto',
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

export default function Stats({ winnerId, players = [], copy }: StatsProps) {
  const winner = players.find((p) => p.id === winnerId)
  const leader = (key: MetricKey): StatPlayer | undefined =>
    players.length ? players.reduce((best, p) => (p[key] > best[key] ? p : best)) : undefined

  return (
    <div className={styles.stats}>
      <header className={styles.head}>
        <h1 className={styles.title}>{copy.title}</h1>
        <p className={styles.sub}>{copy.sub}</p>
      </header>

      {winner && (
        <div className={styles.winner}>
          <span className={styles.crown}>♛</span>
          <div>
            <div className={styles.winnerLabel}>{copy.winnerLabel}</div>
            <div className={styles.winnerName}>{winner.name}</div>
          </div>
        </div>
      )}

      <div className={styles.table}>
        <div className={`${styles.row} ${styles.thead}`}>
          <span className={styles.colName}>{copy.colName}</span>
          <span className={styles.colLoc}>{copy.colLocation}</span>
          <span className={`${styles.colNum} ${styles.hAttack}`}>{copy.colAttacking}</span>
          <span className={`${styles.colNum} ${styles.hDefense}`}>{copy.colDefending}</span>
        </div>
        <ul className={styles.rows}>
          {players.map((p) => (
            <li key={p.id} className={`${styles.row} ${p.id === winnerId ? styles.rowWin : ''}`}>
              <span className={styles.colName}>
                <span className={styles.avatar}>{p.name[0]?.toUpperCase()}</span>
                <span className={styles.name}>{p.name}</span>
                {p.id === winnerId && <span className={styles.winTag}>{copy.winTag}</span>}
              </span>
              <span className={styles.colLoc}>
                <span className={`${styles.loc} ${styles[`loc_${p.location}`] ?? ''}`}>
                  {copy.location[p.location]}
                </span>
              </span>
              <span className={`${styles.colNum} ${styles.numAttack}`}>{p.attack}</span>
              <span className={`${styles.colNum} ${styles.numDefense}`}>{p.defense}</span>
            </li>
          ))}
        </ul>
      </div>

      <footer className={styles.foot}>
        <Button>{copy.toLobby}</Button>
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
                <div className={styles.achTitle}>{copy.achievements[a.key].title}</div>
                <div className={styles.achStat}>
                  <span className={styles.achValue}>{top[a.key]}</span>
                  <span className={styles.achUnit}>{copy.achievements[a.key].unit}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
