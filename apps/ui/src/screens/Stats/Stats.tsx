import LangSwitcher, { type SwitchLang } from '@/blocks/LangSwitcher'
import { cardById } from '@/cards'
import Avatar from '@/primitives/Avatar'
import Badge, { type BadgeTone } from '@/primitives/Badge'
import Button from '@/primitives/Button'
import Card from '@/primitives/Card'
import HudBackground, { type HudBackgroundTone } from '@/primitives/HudBackground'
import HudSurface from '@/primitives/HudSurface'
import Typography, { type TypographyBase } from '@/primitives/Typography'
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
  // отметка «это ты» — отдельная от ника, а не имя вместо ника. Необязательна:
  // без неё экран просто не помечает локального игрока (так живёт консьюмер,
  // который эту строку ещё не завёл), но подменять ник словом «вы» — нельзя.
  selfTag?: string
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
  // кто из списка — локальный игрок; экран помечает его отдельной плашкой
  selfId?: string
  copy: StatsCopy
  players?: StatPlayer[]
  // язык + смена: когда оба переданы — в правом верхнем углу рисуется свитчер.
  // Каталоги экран не держит (i18n-agnostic) — copy свапает консьюмер.
  lang?: SwitchLang
  onLangChange?: (lang: SwitchLang) => void
  // HUD-фон экрана (переключается снаружи — напр. из техстроки песочницы)
  bgTone?: HudBackgroundTone
}

// Accent of a plate — the whole HUD scheme of the achievement hangs on it:
// border, bloom, rail, glow of the name, the counter chip.
type AchTone = 'attack' | 'ai' | 'danger' | 'operation'

interface Achievement {
  key: MetricKey
  tone: AchTone
  cards: string[]
  wide?: boolean
}

// Структура ачивок: какой показатель, каким акцентом горит плашка и какие
// карты-превью. Тексты — из copy. Порядок задаёт раскладку: 3 равных в ряд,
// затем 1 обычной ширины и широкий «Забагованный» (на 2 карточки) со всеми
// картами атаки + Error 503.
// Акцент = категория карты, о которой ачивка (attack / operation / ai). Оба
// триггера цвета категории не имеют (`--cat-trigger` технически белый), поэтому
// Error 503 берёт `--danger-accent` — токен, который именно за 503 и закреплён.
const ACHIEVEMENTS: Achievement[] = [
  { key: 'ddos', tone: 'attack', cards: ['attack-ddos'] },
  { key: 'ai', tone: 'ai', cards: ['trigger-ai'] },
  { key: 'err503', tone: 'danger', cards: ['trigger-error-503'] },
  { key: 'cherryPick', tone: 'operation', cards: ['operation-git-cherry-pick'] },
  {
    key: 'attackedInto',
    tone: 'attack',
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

// Кегль имени на плашке — функция его длины. Ник ограничен 20 символами и
// пробелов в нём не бывает (sanitizeNickname пропускает только A-Za-z0-9_.-),
// значит перенести его по словам нельзя: длинное имя либо режется, либо
// уменьшается. Режется — нельзя, экран целиком про «кто». Шрифт моноширинный,
// поэтому число символов и есть ширина — шаг выбирается по ней одной формулой.
const HOLDER_STEPS: { max: number; base: TypographyBase }[] = [
  { max: 12, base: 'code' }, // 26px — герой плашки
  { max: 16, base: 'mono-xl' }, // 17px
  { max: Number.POSITIVE_INFINITY, base: 'mono-lg' }, // 15px — предел ника (20)
]

const holderBase = (name: string): TypographyBase =>
  HOLDER_STEPS.find((s) => name.length <= s.max)?.base ?? 'mono-lg'

const TONE_CLASS: Record<AchTone, string> = {
  attack: styles.toneAttack,
  ai: styles.toneAi,
  danger: styles.toneDanger,
  operation: styles.toneOperation,
}

export default function Stats({
  winnerId,
  selfId,
  copy,
  players = [],
  lang,
  onLangChange,
  bgTone = 'neutral',
}: StatsProps) {
  const winner = players.find((p) => p.id === winnerId)
  // «это ты» — один и тот же элемент везде, где экран называет игрока: блок
  // победителя, строка таблицы, плашка ачивки.
  const selfMark = (id: string) =>
    id === selfId && copy.selfTag ? (
      <Badge tone="info" size="sm" outlined className={styles.selfTag}>
        {copy.selfTag}
      </Badge>
    ) : null
  const leader = (key: MetricKey): StatPlayer | undefined => {
    if (players.length === 0) return undefined
    const top = players.reduce((best, p) => (p[key] > best[key] ? p : best))
    // Skip the achievement when nobody actually triggered the metric (max is 0),
    // otherwise a player who never did it is shown as the leader.
    return top[key] > 0 ? top : undefined
  }

  return (
    <div className={styles.stats}>
      <HudBackground tone={bgTone} className={styles.bgLayer} />
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
            <div className={styles.winnerName}>
              {winner.name}
              {selfMark(winner.id)}
            </div>
          </div>
        </div>
      )}

      <div className={styles.table}>
        <div className={`${styles.row} ${styles.thead}`}>
          <span className={styles.colName}>{copy.colName}</span>
          <span>{copy.colLoc}</span>
          <span className={`${styles.colNum} ${styles.hAttack}`}>{copy.colAttack}</span>
          <span className={`${styles.colNum} ${styles.hDefense}`}>{copy.colDefense}</span>
        </div>
        <ul className={styles.rows}>
          {players.map((p) => (
            <li key={p.id} className={`${styles.row} ${p.id === winnerId ? styles.rowWin : ''}`}>
              <span className={styles.colName}>
                <Avatar name={p.name} size={30} />
                <span className={styles.name}>{p.name}</span>
                {selfMark(p.id)}
                {p.id === winnerId && (
                  <Badge tone="success" size="sm" outlined>
                    {copy.winnerTag}
                  </Badge>
                )}
              </span>
              <span>
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
            <HudSurface
              key={a.key}
              // the plate's accent is a class-set var, so no colour literal travels through TSX
              accent="var(--ach)"
              className={`${styles.ach} ${TONE_CLASS[a.tone]} ${a.wide ? styles.achWide : ''}`}
            >
              <div className={styles.achInner}>
                <div className={`${styles.achArt} ${a.wide ? styles.achFan : ''}`}>
                  {a.cards.map((id) => {
                    const card = cardById(id)
                    return card ? (
                      <Card
                        key={id}
                        card={card}
                        width={a.wide ? '72px' : '84px'}
                        interactive={false}
                      />
                    ) : null
                  })}
                </div>
                <div className={styles.achBody}>
                  <div className={styles.achName}>
                    <Typography base={holderBase(top.name)} tk="tk-02" className={styles.achHolder}>
                      {top.name}
                    </Typography>
                    {selfMark(top.id)}
                  </div>
                  <Typography base="heading-7" tk="tk-04" className={styles.achTitle}>
                    {ach.title}
                  </Typography>
                  <div className={styles.achStat}>
                    <Typography base="value" tk="tk-02" className={styles.achValue}>
                      {top[a.key]}
                    </Typography>
                    <Typography base="label-sm" tk="tk-12" className={styles.achUnit}>
                      {ach.unit}
                    </Typography>
                  </div>
                </div>
              </div>
            </HudSurface>
          )
        })}
      </div>
    </div>
  )
}
