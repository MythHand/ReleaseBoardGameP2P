import { type ReactNode, useLayoutEffect, useRef, useState } from 'react'
import bugRunnerArt from '@/assets/bug-runner/achievement.svg'
import PresetAvatar from '@/avatars/PresetAvatar'
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
type MetricKey =
  | 'ddos'
  | 'ai'
  | 'err503'
  | 'cherryPick'
  | 'attackedInto'
  | 'defense'
  | 'monitoring'
  | 'gitBranch'

export interface StatPlayer {
  id: string
  name: string
  // preset avatar id; without it, the name's initial (a bot has none)
  avatar?: string
  // speaking in the voice chat — the ring around the avatar
  speaking?: boolean
  location: Location
  attack: number
  defense: number
  ddos: number
  attackedInto: number
  ai: number
  err503: number
  cherryPick: number
  // Monitorings set up (AI Monitoring included)
  monitoring: number
  // Git Branch played
  gitBranch: number
}

// One member's best in the lobby's mini-game. Anyone in the room can hold it,
// a spectator too — so it is not a column of the players' table.
export interface BugRunnerScore {
  id: string
  name: string
  score: number
}

export interface AchievementCopy {
  title: string
  unit: string
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
  achievements: Record<MetricKey, AchievementCopy>
  // the mini-game's plate — needed only with `bugRunner`, so optional
  bugRunner?: AchievementCopy
  // the voice chat's title in the dock — needed only with the `voice` slot, so
  // optional, like `selfTag`
  voiceChat?: string
}

interface StatsProps {
  winnerId: string
  // кто из списка — локальный игрок; экран помечает его отдельной плашкой
  selfId?: string
  copy: StatsCopy
  players?: StatPlayer[]
  // the room's best runs in the lobby's mini-game, one per member present
  bugRunner?: BugRunnerScore[]
  // язык + смена: когда оба переданы — в правом верхнем углу рисуется свитчер.
  // Каталоги экран не держит (i18n-agnostic) — copy свапает консьюмер.
  lang?: SwitchLang
  onLangChange?: (lang: SwitchLang) => void
  // HUD-фон экрана (переключается снаружи — напр. из техстроки песочницы)
  bgTone?: HudBackgroundTone
  // слот переписки, а не её данные: экран даёт ей место у правого края, а чем
  // это место занять — решает консьюмер. Без слота экран прежний, во всю ширину.
  chat?: ReactNode
  // The voice chat, in the same dock above the text chat, under a title in the
  // dock's own small voice. A slot for the same reason as `chat`; either one
  // alone opens the dock.
  voice?: ReactNode
  // Leaving the results. Optional: without it the button still renders and does
  // nothing, which is how the playground shows the screen.
  onToLobby?: () => void
}

// Accent of a plate — the whole HUD scheme of the achievement hangs on it:
// border, bloom, rail, glow of the name, the counter chip.
type AchTone = 'attack' | 'ai' | 'danger' | 'operation' | 'defense' | 'protection' | 'release'

interface Achievement {
  key: MetricKey
  tone: AchTone
  cards: string[]
  wide?: boolean
}

// Структура ачивок: какой показатель, каким акцентом горит плашка и какие
// карты-превью. Тексты — из copy. Порядок — порядок показа: первыми идут две
// широкие — «Забагованный» (все карты атаки + Error 503) и «Решала» (все карты
// обороны), дальше обычные. Сетка кладёт их плотно (Stats.module.css), так что
// в три колонки обычная плашка встаёт рядом с широкой, а не оставляет дыру.
// Порядок — единственное, что раскладка знает наверняка: сколько плашек дойдёт
// до экрана, решает `leader` (ничья не достаётся никому), так что ряд обычных
// может оборваться на середине — и это нормальный вид, а не сломанный.
// Акцент = категория карты, о которой ачивка (attack / defense / protection /
// operation / ai). Оба триггера цвета категории не имеют (`--cat-trigger`
// технически белый), поэтому Error 503 берёт `--danger-accent` — токен, который
// именно за 503 и закреплён.
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
  {
    key: 'defense',
    tone: 'defense',
    wide: true,
    // all six defence cards — the Unicorns at the bottom, Hotfix on top
    cards: [
      'defense-works-on-my-machine',
      'defense-not-a-bug',
      'defense-rollback',
      'defense-pr-approved',
      'defense-rubber-ducky',
      'defense-hotfix',
    ],
  },
  { key: 'ai', tone: 'ai', cards: ['trigger-ai'] },
  { key: 'cherryPick', tone: 'operation', cards: ['operation-git-cherry-pick'] },
  { key: 'err503', tone: 'danger', cards: ['trigger-error-503'] },
  { key: 'ddos', tone: 'attack', cards: ['attack-ddos'] },
  // AI Monitoring counts too; the preview shows the Monitoring it plays as
  { key: 'monitoring', tone: 'protection', cards: ['protection-monitoring'] },
  { key: 'gitBranch', tone: 'operation', cards: ['operation-git-branch'] },
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
  defense: styles.toneDefense,
  protection: styles.toneProtection,
  release: styles.toneRelease,
}

// Достаётся ли ачивка кому-то вообще. Двух причин, по которым нет, две:
// показателя не случилось ни у кого (максимум — ноль), и показатель разделён
// поровну. Ничья не разрешается ни в чью пользу: плашка называет ОДНОГО, и
// назвать первого попавшегося из равных — значит соврать. Поэтому на экран
// доходят не все ачивки, и раскладка обязана переживать неполный ряд.
function soleTop<T>(items: T[], score: (item: T) => number): T | undefined {
  if (items.length === 0) return undefined
  const best = items.reduce((top, p) => (score(p) > score(top) ? p : top))
  if (score(best) === 0) return undefined
  return items.filter((p) => score(p) === score(best)).length === 1 ? best : undefined
}

export default function Stats({
  winnerId,
  selfId,
  copy,
  players = [],
  bugRunner = [],
  lang,
  onLangChange,
  bgTone = 'neutral',
  chat,
  voice,
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
  const leader = (key: MetricKey) => soleTop(players, (p) => p[key])
  // the mini-game's plate: the same rule, over everyone in the room who played
  const runner = soleTop(bugRunner, (s) => s.score)

  // One plate: the art on the left, who holds it and by how much on the right.
  const plate = (p: {
    key: string
    tone: AchTone
    wide?: boolean
    art: ReactNode
    holder: { id: string; name: string }
    value: number
    copy: AchievementCopy
  }) => (
    <HudSurface
      key={p.key}
      // the plate's accent is a class-set var, so no colour literal travels through TSX
      accent="var(--ach)"
      className={`${styles.ach} ${TONE_CLASS[p.tone]} ${p.wide ? styles.achWide : ''}`}
    >
      <div className={styles.achInner}>
        {p.art}
        <div className={styles.achBody}>
          <div className={styles.achName}>
            {/* key — сброс подобранного шага: другое имя меряется заново */}
            <HolderName key={p.holder.name} name={p.holder.name} />
            {selfMark(p.holder.id)}
          </div>
          <Typography base="heading-7" tk="tk-04" className={styles.achTitle}>
            {p.copy.title}
          </Typography>
          <div className={styles.achStat}>
            <Typography base="value" tk="tk-02" className={styles.achValue}>
              {p.value}
            </Typography>
            <Typography base="label-sm" tk="tk-12" className={styles.achUnit}>
              {p.copy.unit}
            </Typography>
          </div>
        </div>
      </div>
    </HudSurface>
  )

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
                {p.avatar ? (
                  <PresetAvatar id={p.avatar} size={30} speaking={p.speaking} />
                ) : (
                  <Avatar name={p.name} size={30} speaking={p.speaking} />
                )}
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
          return plate({
            key: a.key,
            tone: a.tone,
            wide: a.wide,
            art: (
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
            ),
            holder: top,
            value: top[a.key],
            copy: copy.achievements[a.key],
          })
        })}
        {/* last in the row: the lobby's mini-game, not the match */}
        {runner &&
          copy.bugRunner &&
          plate({
            key: 'bugRunner',
            tone: 'release',
            art: (
              <div className={`${styles.achArt} ${styles.achPixel}`}>
                <img src={bugRunnerArt} alt="" />
              </div>
            ),
            holder: runner,
            value: runner.score,
            copy: copy.bugRunner,
          })}
      </div>
    </>
  )

  // Без чата экран длинный и прокручивается снаружи — как и был. С чатом место у
  // правого края занимает панель, которая никуда не едет, поэтому прокрутка
  // переезжает внутрь: экран ростом в своё окно, итоги едут в своём вьюпорте.
  if (chat == null && voice == null) {
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
      <aside className={styles.chatDock}>
        {/* the voice chat on top: one line under a title in the panels' own
            small voice, a thin rule, and the text chat below — without a title
            of its own, the feed and the field say what it is */}
        {voice != null && (
          <div className={styles.voiceLine}>
            {copy.voiceChat && (
              <Typography base="tag" tk="tk-10" as="h2" className={styles.voiceTitle}>
                {copy.voiceChat}
              </Typography>
            )}
            {voice}
          </div>
        )}
        {chat}
      </aside>
    </div>
  )
}
