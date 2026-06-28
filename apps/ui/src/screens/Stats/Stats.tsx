import LangSwitcher, { type SwitchLang } from '@/blocks/LangSwitcher'
import { cardById } from '@/cards'
import Avatar from '@/primitives/Avatar'
import Badge, { type BadgeTone } from '@/primitives/Badge'
import Button from '@/primitives/Button'
import Card from '@/primitives/Card'
import styles from './Stats.module.css'

type Location = 'game' | 'stats' | 'lobby' | 'offline'

// тон пилюли «где сейчас» по локации
const LOC_TONE: Record<Location, BadgeTone> = {
  game: 'warning',
  stats: 'success',
  lobby: 'info',
  offline: 'muted',
}
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

// Весь текст экрана — пропсом (i18n-agnostic). Ачивки/локации — по ключам.
export interface StatsCopy {
  title: string
  subtitle: string
  winnerLabel: string
  winnerTag: string
  colName: string
  colLoc: string
  colAttack: string
  colDefense: string
  toLobby: string
  location: Record<Location, string>
  achievements: Record<MetricKey, { title: string; unit: string }>
}

interface StatsProps {
  winnerId: string
  copy: StatsCopy
  players?: StatPlayer[]
  // язык + смена: когда оба переданы — в правом верхнем углу рисуется свитчер.
  // Каталоги экран не держит (i18n-agnostic) — copy свапает консьюмер.
  lang?: SwitchLang
  onLangChange?: (lang: SwitchLang) => void
}

interface Achievement {
  key: MetricKey
  cards: string[]
  wide?: boolean
}

// Структура ачивок: какой показатель и какие карты-превью. Тексты — из copy.
// Порядок задаёт раскладку: 3 равных в ряд, затем 1 обычной ширины и широкий
// «Забагованный» (на 2 карточки) со всеми картами атаки + Error 503.
const ACHIEVEMENTS: Achievement[] = [
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

export default function Stats({ winnerId, copy, players = [], lang, onLangChange }: StatsProps) {
  const winner = players.find((p) => p.id === winnerId)
  const leader = (key: MetricKey): StatPlayer | undefined => {
    if (!players.length) return undefined
    const top = players.reduce((best, p) => (p[key] > best[key] ? p : best))
    // Skip the achievement when nobody actually triggered the metric (max is 0),
    // otherwise a player who never did it is shown as the leader.
    return top[key] > 0 ? top : undefined
  }

  return (
    <div className={styles.stats}>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>{copy.title}</h1>
          <p className={styles.sub}>{copy.subtitle}</p>
        </div>
        {lang && onLangChange && <LangSwitcher value={lang} onChange={onLangChange} />}
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
          <span className={styles.colLoc}>{copy.colLoc}</span>
          <span className={`${styles.colNum} ${styles.hAttack}`}>{copy.colAttack}</span>
          <span className={`${styles.colNum} ${styles.hDefense}`}>{copy.colDefense}</span>
        </div>
        <ul className={styles.rows}>
          {players.map((p) => (
            <li key={p.id} className={`${styles.row} ${p.id === winnerId ? styles.rowWin : ''}`}>
              <span className={styles.colName}>
                <Avatar name={p.name} size={30} />
                <span className={styles.name}>{p.name}</span>
                {p.id === winnerId && (
                  <Badge tone="success" size="sm" outlined>
                    {copy.winnerTag}
                  </Badge>
                )}
              </span>
              <span className={styles.colLoc}>
                <Badge tone={LOC_TONE[p.location]} size="md" outlined>
                  {copy.location[p.location]}
                </Badge>
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
          const ach = copy.achievements[a.key]
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
                <div className={styles.achTitle}>{ach.title}</div>
                <div className={styles.achStat}>
                  <span className={styles.achValue}>{top[a.key]}</span>
                  <span className={styles.achUnit}>{ach.unit}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
