import { type ReactNode, useLayoutEffect, useRef, useState } from 'react'
import LangSwitcher, { type SwitchLang } from '@/blocks/LangSwitcher'
import { cardById } from '@/cards'
import Avatar from '@/primitives/Avatar'
import Badge, { type BadgeTone } from '@/primitives/Badge'
import Button from '@/primitives/Button'
import Card from '@/primitives/Card'
import HudBackground, { type HudBackgroundTone } from '@/primitives/HudBackground'
import HudSurface from '@/primitives/HudSurface'
import ScrollArea from '@/primitives/ScrollArea'
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
  // слот переписки, а не её данные: экран даёт ей место у правого края, а чем
  // это место занять — решает консьюмер. Без слота экран прежний, во всю ширину.
  chat?: ReactNode
  // Leaving the results. Optional: without it the button still renders and does
  // nothing, which is how the playground shows the screen.
  onToLobby?: () => void
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
// карты-превью. Тексты — из copy. Порядок — порядок показа: первым идёт широкий
// «Забагованный» (со всеми картами атаки + Error 503), он занимает строку
// целиком, дальше обычные парами.
// Порядок — единственное, что раскладка знает наверняка: сколько плашек дойдёт
// до экрана, решает `leader` (ничья не достаётся никому), так что ряд обычных
// может оборваться на середине — и это нормальный вид, а не сломанный.
// Акцент = категория карты, о которой ачивка (attack / operation / ai). Оба
// триггера цвета категории не имеют (`--cat-trigger` технически белый), поэтому
// Error 503 берёт `--danger-accent` — токен, который именно за 503 и закреплён.
const ACHIEVEMENTS: Achievement[] = [
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
  { key: 'ai', tone: 'ai', cards: ['trigger-ai'] },
  { key: 'cherryPick', tone: 'operation', cards: ['operation-git-cherry-pick'] },
  { key: 'err503', tone: 'danger', cards: ['trigger-error-503'] },
  { key: 'ddos', tone: 'attack', cards: ['attack-ddos'] },
]

// Шаги кегля имени, от героя вниз. Что за строка придёт — экран не знает:
// поле ввода в Start чистит ник и режет по 20 символам, но сюда имя приходит
// пропсом — от пира по сети, из сохранённого состояния, от любого консьюмера.
// Поэтому никаких допущений о длине и составе: длинное имя либо режется, либо
// уменьшается, а режется — нельзя, экран целиком про «кто».
const HOLDER_STEPS: TypographyBase[] = ['code', 'mono-xl', 'mono-lg']
const LAST_STEP = HOLDER_STEPS.length - 1

// Какой шаг взять — решает МЕСТО, а не длина имени. Ширина плашки плавает:
// колонок три, паддинг экрана — clamp(40px, 8vw, 120px), так что «12 символов»
// в одном окне влезают крупным кеглем, а в другом нет. Поэтому имя ставится
// самым крупным шагом и уменьшается на шаг, пока не влезет в свою строку —
// мерит браузер, а не формула из продублированных значений шкалы.
// На последнем шаге, если не влезло и оно, включается перенос: лучше две
// строки, чем молча обрезанный край.
function HolderName({ name }: { name: string }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)
  const [step, setStep] = useState(0)

  // изменилось ДОСТУПНОЕ место (окно, раскладка) — тоже с начала. Высота бокса
  // меняется от самой смены кегля, поэтому реагируем только на ширину.
  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    let width = el.clientWidth
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === width) return
      width = el.clientWidth
      setStep(0)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // замер после каждой отрисовки: натуральная ширина имени против ширины
  // коробки. Не влезло и есть куда мельчить — шаг вниз. Сходится максимум за
  // длину шкалы и до кадра, так что мигания нет.
  // Обе ширины берём одинаково — дробными, из rect: clientWidth округлён, и на
  // строке, которая заполняет коробку впритык, шаг решала бы доля пикселя.
  // Порог в 1px — про то же: «не влезло» должно быть видно, а не вычислено.
  useLayoutEffect(() => {
    const box = boxRef.current
    const text = textRef.current
    if (!box || !text || step >= LAST_STEP) return
    if (text.getBoundingClientRect().width > box.getBoundingClientRect().width + 1) {
      setStep(step + 1)
    }
  })

  const wrap = step === LAST_STEP
  return (
    <div ref={boxRef} className={styles.achHolderBox}>
      <span ref={textRef} className={`${styles.achHolderText} ${wrap ? styles.achHolderWrap : ''}`}>
        <Typography base={HOLDER_STEPS[step] ?? 'mono-lg'} tk="tk-02" className={styles.achHolder}>
          {name}
        </Typography>
      </span>
    </div>
  )
}

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
  chat,
  onToLobby,
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
  // Достаётся ли ачивка кому-то вообще. Двух причин, по которым нет, две:
  // показателя не случилось ни у кого (максимум — ноль), и показатель разделён
  // поровну. Ничья не разрешается ни в чью пользу: плашка называет ОДНОГО, и
  // назвать первого попавшегося из равных — значит соврать. Поэтому ачивок не
  // всегда пять, и раскладка обязана переживать неполный ряд.
  const leader = (key: MetricKey): StatPlayer | undefined => {
    if (players.length === 0) return undefined
    const best = players.reduce((top, p) => (p[key] > top[key] ? p : top))
    if (best[key] === 0) return undefined
    return players.filter((p) => p[key] === best[key]).length === 1 ? best : undefined
  }

  const body = (
    <>
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
        <Button onClick={onToLobby}>{copy.toLobby}</Button>
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
                    {/* key — сброс подобранного шага: другое имя меряется заново */}
                    <HolderName key={top.name} name={top.name} />
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
    </>
  )

  // Без чата экран длинный и прокручивается снаружи — как и был. С чатом место у
  // правого края занимает панель, которая никуда не едет, поэтому прокрутка
  // переезжает внутрь: экран ростом в своё окно, итоги едут в своём вьюпорте.
  if (chat == null) {
    return (
      <div className={styles.stats}>
        <HudBackground tone={bgTone} className={styles.bgLayer} />
        {body}
      </div>
    )
  }

  return (
    <div className={`${styles.stats} ${styles.chatMode}`}>
      <HudBackground tone={bgTone} className={styles.bgLayer} />
      <ScrollArea className={styles.main} contentClassName={styles.mainInner}>
        {body}
      </ScrollArea>
      <aside className={styles.chatDock}>{chat}</aside>
    </div>
  )
}
