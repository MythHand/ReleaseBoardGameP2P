import Typography, {
  type TypographyBase,
  type TypographyVariant,
  VARIANTS,
} from '../primitives/Typography'
import styles from './TypographyPreview.module.css'

// ШКАЛА ТЕКСТА — витрина живого фундамента design/typography.module.css.
// Каждая строка = БАЗА (роль); трекинг показан как модификатор tk-NN, который
// в компонентах подключается рядом: composes: <база> <tk>. Зеркалит реальные
// значения проекта (без унификации нюансов).
interface ScaleRow {
  cls: string
  font: string
  size: number
  weight?: number
  lh?: number
  upper?: boolean
  sample: string
  where: string
}

const scale: ScaleRow[] = [
  // ===== Заголовки — Onest (var(--font-heading)) =====
  {
    cls: 'heading-1',
    font: 'Onest',
    size: 34,
    sample: 'dimbo',
    where: 'Имя победителя (GameOver)',
  },
  {
    cls: 'heading-2',
    font: 'Onest',
    size: 32,
    sample: 'Итоги партии',
    where: 'Заголовок экрана (Stats)',
  },
  {
    cls: 'heading-3',
    font: 'Onest',
    size: 30,
    sample: 'Лобби',
    where: 'Заголовок экрана (Lobby)',
  },
  {
    cls: 'heading-4',
    font: 'Onest',
    size: 26,
    sample: 'dimbo',
    where: 'Имя победителя (Stats)',
  },
  {
    cls: 'heading-5',
    font: 'Onest',
    size: 20,
    upper: true,
    sample: 'Создать игру',
    where: 'Заголовок модалки',
  },
  {
    cls: 'heading-6',
    font: 'Onest',
    size: 19,
    upper: true,
    sample: 'Описание карт',
    where: 'Заголовок секции (Rules)',
  },
  {
    cls: 'heading-7',
    font: 'Onest',
    size: 18,
    weight: 700,
    upper: true,
    sample: 'AI зависимый',
    where: 'Заголовок ачивки (Stats)',
  },
  {
    cls: 'heading-8',
    font: 'Onest',
    size: 16,
    upper: true,
    sample: 'Параметры лобби',
    where: 'Заголовки блоков/секций (Lobby, Start, Invite, ModeSelect)',
  },
  {
    cls: 'subtitle',
    font: 'Onest',
    size: 16,
    sample: 'Режим партии',
    where: 'Заголовок режима (ModeSelect), tech-заголовок модалки (Start) — без капса',
  },
  {
    cls: 'heading-9',
    font: 'Onest',
    size: 15,
    upper: true,
    sample: 'Атакующие карты',
    where: 'Подзаголовок правил (Rules)',
  },
  // ===== Тело — Fira Mono (var(--font-text)) =====
  {
    cls: 'body-lg',
    font: 'Fira Mono',
    size: 15,
    lh: 1.6,
    sample: 'Описание игры на стартовом экране.',
    where: 'Описание (Start), имя игрока (PlayerSlot), текст модалки (Lobby)',
  },
  {
    cls: 'body',
    font: 'Fira Mono',
    size: 14,
    lh: 1.62,
    sample: 'Тело правил и описаний карт.',
    where: 'Тело правил, описания карт, Invite, Dropdown, имя (Participants)',
  },
  {
    cls: 'body-sm',
    font: 'Fira Mono',
    size: 13,
    sample: 'dimbo выложил Frontend',
    where: 'Имя игрока (Seat), сноска (Start)',
  },
  {
    cls: 'body-xs',
    font: 'Fira Mono',
    size: 12,
    sample: 'dimbo выложил Frontend',
    where: 'Строка лога ходов (MoveHistory)',
  },
  {
    cls: 'body-2xs',
    font: 'Fira Mono',
    size: 11,
    sample: 'игрок выбыл из партии',
    where: 'Мелкие тех-строки стола (system/nested лога, рука в Seat)',
  },
  {
    cls: 'label-lg',
    font: 'Fira Mono',
    size: 15,
    upper: true,
    sample: 'правила',
    where: 'Вкладки боковой полосы (TabRail)',
  },
  {
    cls: 'tag',
    font: 'Fira Mono',
    size: 12,
    upper: true,
    sample: 'игроки',
    where: 'Заголовки секций стола (Participants, Table settings)',
  },
  {
    cls: 'pile-label',
    font: 'Fira Mono',
    size: 11,
    upper: true,
    sample: 'колода',
    where: 'Лейбл стопки/колоды (Pile)',
  },
  {
    cls: 'tag-sm',
    font: 'Fira Mono',
    size: 10,
    upper: true,
    sample: 'добор',
    where: 'Микро-теги (добор в MoveHistory, пустой слот ReleaseZone)',
  },
  // ===== Значения, код, лейблы — JetBrains Mono (var(--font-mono)) =====
  {
    cls: 'numeric-xl',
    font: 'JetBrains Mono',
    size: 52,
    weight: 300,
    sample: '12',
    where: 'Большое число ачивки (Stats)',
  },
  {
    cls: 'code',
    font: 'JetBrains Mono',
    size: 26,
    sample: '4F2A-9K',
    where: 'Код игры (Lobby)',
  },
  {
    cls: 'value',
    font: 'JetBrains Mono',
    size: 18,
    upper: true,
    sample: 'DIMBO',
    where: 'Значение поля ввода (Input)',
  },
  {
    cls: 'button',
    font: 'JetBrains Mono',
    size: 17,
    upper: true,
    sample: 'создать игру',
    where: 'Primary-кнопка (в брекетах)',
  },
  {
    cls: 'numeric',
    font: 'JetBrains Mono',
    size: 16,
    sample: '12',
    where: 'Числа таблицы (Stats), значение слайдера',
  },
  {
    cls: 'mono-lg',
    font: 'JetBrains Mono',
    size: 15,
    sample: 'release-note',
    where: 'Код-заметка (Pile); таб (TabRail, UPPERCASE)',
  },
  {
    cls: 'mono',
    font: 'JetBrains Mono',
    size: 14,
    sample: 'dimbo',
    where: 'Имя игрока (Stats), Reconnect',
  },
  {
    cls: 'mono-strong',
    font: 'JetBrains Mono',
    size: 14,
    weight: 700,
    sample: 'Соло',
    where: 'Заголовок опции (ModeSelect)',
  },
  {
    cls: 'notice',
    font: 'JetBrains Mono',
    size: 14,
    upper: true,
    sample: 'переподключение',
    where: 'Плашка переподключения (Reconnect)',
  },
  {
    cls: 'mono-md',
    font: 'JetBrains Mono',
    size: 13,
    sample: 'поиск по правилам',
    where: 'Поле поиска правил (Rules)',
  },
  {
    cls: 'code-sm',
    font: 'JetBrains Mono',
    size: 12,
    weight: 600,
    sample: 'Code Review',
    where: 'Имя карты / название режима (Rules)',
  },
  {
    cls: 'label-md',
    font: 'JetBrains Mono',
    size: 13,
    upper: true,
    sample: 'вы выбыли',
    where: 'Крупный бейдж-плашка (Badge lg)',
  },
  {
    cls: 'label',
    font: 'JetBrains Mono',
    size: 12,
    upper: true,
    sample: 'Победы',
    where: 'Лейблы секций, теги, бейджи (Lobby, Stats, Participants…)',
  },
  {
    cls: 'mono-sm',
    font: 'JetBrains Mono',
    size: 12,
    sample: 'игра против ИИ',
    where: 'Описание опции (ModeSelect), второстепенные тех-строки',
  },
  {
    cls: 'label-sm',
    font: 'JetBrains Mono',
    size: 11,
    upper: true,
    sample: 'Ваш никнейм',
    where: 'Лейблы полей (Input), бейджи, tech/danger-кнопки',
  },
  {
    cls: 'mono-xs',
    font: 'JetBrains Mono',
    size: 11,
    sample: 'недоступно',
    where: 'Подсказка дропдауна, мелкие тех-строки',
  },
  {
    cls: 'overline',
    font: 'JetBrains Mono',
    size: 10,
    upper: true,
    sample: 'смотреть обзор',
    where: 'Капшен play-кнопки (Start), метки (MoveHistory, ReleaseZone)',
  },
]

// вариации трекинга, заложенные в typography.module.css
const trackings: { name: string; em: string }[] = [
  { name: 'tk-0', em: '0' },
  { name: 'tk-01', em: '0.01em' },
  { name: 'tk-02', em: '0.02em' },
  { name: 'tk-03', em: '0.03em' },
  { name: 'tk-04', em: '0.04em' },
  { name: 'tk-05', em: '0.05em' },
  { name: 'tk-06', em: '0.06em' },
  { name: 'tk-08', em: '0.08em' },
  { name: 'tk-10', em: '0.1em' },
  { name: 'tk-12', em: '0.12em' },
  { name: 'tk-14', em: '0.14em' },
  { name: 'tk-16', em: '0.16em' },
  { name: 'tk-18', em: '0.18em' },
  { name: 'tk-20', em: '0.2em' },
  { name: 'tk-22', em: '0.22em' },
]

// The base+tk composition for a variant, read from Typography's VARIANTS so the
// table never drifts from the component's actual definitions.
const composesOf = (variant: TypographyVariant): string => {
  const { base, tk } = VARIANTS[variant]
  return tk ? `${base} · ${tk}` : base
}

// Curated <Typography> variants — each is a base + tk composition from the scale above.
const curated: { variant: TypographyVariant; sample: string }[] = [
  { variant: 'pageTitle', sample: 'Lobby' },
  { variant: 'sectionTitle', sample: 'Lobby settings' },
  { variant: 'panelTitle', sample: 'Game mode' },
  { variant: 'body', sample: 'Game description on the start screen.' },
  { variant: 'footnote', sample: 'Footnote under a field.' },
  { variant: 'tag', sample: 'players' },
  { variant: 'metaLabel', sample: 'design' },
  { variant: 'code', sample: '4F2A-9K' },
]

// Документация по типографике: шрифты и доступные начертания.
// Текстовые стили правил вынесены в отдельную страницу (RulesStyles).
const fonts = [
  {
    varName: '--font-heading',
    name: 'Onest',
    role: 'Заголовки',
    where: 'Заголовки карт, экранов и секций (настольная игра).',
    sample: 'Release любой ценой',
    cls: styles.heading,
  },
  {
    varName: '--font-text',
    name: 'Fira Mono',
    role: 'Основной текст',
    where: 'Тело карт, описания, подписи, HUD, история действий (настольная игра).',
    sample: 'Выложите эту карту в свою зону релиза. Для этого сбросьте 1 карту из руки.',
    cls: styles.text,
  },
  {
    varName: '--font-mono',
    name: 'JetBrains Mono',
    role: 'Терминал / лоадер',
    where: 'Только модуль загрузки (boot-экран). Шрифт лоадера — не затираем.',
    sample: '> booting release-engine … [ok]   PUSH',
    cls: styles.mono,
  },
]

// Доступные начертания (подключены в index.html).
const weights: { name: string; cls: string; items: { w: number; label: string }[] }[] = [
  {
    name: 'Onest',
    cls: styles.heading,
    items: [
      { w: 400, label: 'Regular' },
      { w: 500, label: 'Medium' },
      { w: 600, label: 'Semibold' },
      { w: 700, label: 'Bold' },
    ],
  },
  {
    name: 'Fira Mono',
    cls: styles.text,
    items: [
      { w: 400, label: 'Regular' },
      { w: 500, label: 'Medium' },
      { w: 700, label: 'Bold' },
    ],
  },
  {
    name: 'JetBrains Mono',
    cls: styles.mono,
    items: [
      { w: 400, label: 'Regular' },
      { w: 500, label: 'Medium' },
      { w: 700, label: 'Bold' },
    ],
  },
]

export default function TypographyPreview() {
  return (
    <section className={styles.root}>
      <h2 className={styles.h}>typography</h2>

      <h3 className={styles.subH}>Шрифты</h3>
      <div className={styles.list}>
        {fonts.map((f) => (
          <article key={f.varName} className={styles.item}>
            <header className={styles.meta}>
              <span className={styles.role}>{f.role}</span>
              <span className={styles.name}>{f.name}</span>
              <code className={styles.var}>{f.varName}</code>
            </header>
            <div className={f.cls}>{f.sample}</div>
            <p className={styles.where}>{f.where}</p>
          </article>
        ))}
      </div>

      <h3 className={styles.subH}>Начертания</h3>
      <div className={styles.list}>
        {weights.map((g) => (
          <article key={g.name} className={styles.item}>
            <header className={styles.meta}>
              <span className={styles.name}>{g.name}</span>
            </header>
            <div className={styles.weights}>
              {g.items.map((it) => (
                <div key={it.w} className={styles.weightRow}>
                  <span className={g.cls} style={{ fontWeight: it.w, fontSize: 24, lineHeight: 1 }}>
                    Release
                  </span>
                  <span className={styles.weightLabel}>
                    {it.w} · {it.label}
                  </span>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>

      <h3 className={styles.subH}>Шкала текста</h3>
      <p className={styles.scaleNote}>
        Двухслойная: <b>база</b> (роль — семейство + размер + начертание + регистр) и{' '}
        <b>вариация трекинга</b> <code>tk-NN</code>. В компоненте —{' '}
        <code>composes: база tk-NN</code> (трекинг живёт только в tk). Образцы ниже отрендерены
        самой базой — без трекинга; вариации tk показаны отдельной таблицей. Реализовано в{' '}
        <code>design/typography.module.css</code>. Исключены глифы (♛, ×, ▶) и шрифт лоадера.
      </p>
      <table className={styles.scaleTable}>
        <thead>
          <tr>
            <th>база</th>
            <th>образец</th>
            <th>шрифт</th>
            <th>размер</th>
            <th>регистр</th>
            <th>где используется</th>
          </tr>
        </thead>
        <tbody>
          {scale.map((r) => (
            <tr key={r.cls}>
              <td className={styles.scaleName}>{r.cls}</td>
              <td>
                <Typography base={r.cls as TypographyBase}>{r.sample}</Typography>
              </td>
              <td className={styles.scaleMeta}>{r.font}</td>
              <td className={styles.scaleMeta}>
                {r.size}px{r.lh ? ` / ${r.lh}` : ''}
                {r.weight ? ` · ${r.weight}` : ''}
              </td>
              <td className={styles.scaleMeta}>{r.upper ? 'UPPERCASE' : '—'}</td>
              <td className={styles.scaleWhere}>{r.where}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className={styles.subH}>Вариации трекинга (tk)</h3>
      <p className={styles.scaleNote}>
        Модификаторы <code>letter-spacing</code>, заложены в{' '}
        <code>design/typography.module.css</code>. Подключаются рядом с базой:{' '}
        <code>composes: база tk-NN</code>.
      </p>
      <table className={styles.scaleTable}>
        <thead>
          <tr>
            <th>модификатор</th>
            <th>letter-spacing</th>
            <th>образец</th>
          </tr>
        </thead>
        <tbody>
          {trackings.map((t) => (
            <tr key={t.name}>
              <td className={styles.scaleName}>{t.name}</td>
              <td className={styles.scaleMeta}>{t.em}</td>
              <td className={styles.scaleMeta} style={{ letterSpacing: t.em }}>
                RELEASE
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3 className={styles.subH}>Curated variants (Typography)</h3>
      <p className={styles.scaleNote}>
        Semantic variants of the <code>{'<Typography>'}</code> component — the primary way to set
        text (frontend and library). Each is a composition of a base and <code>tk</code> from the
        scale above; values are not duplicated. The long tail goes through raw <code>base</code>/
        <code>tk</code>.
      </p>
      <table className={styles.scaleTable}>
        <thead>
          <tr>
            <th>variant</th>
            <th>sample</th>
            <th>composes</th>
          </tr>
        </thead>
        <tbody>
          {curated.map((c) => (
            <tr key={c.variant}>
              <td className={styles.scaleName}>{c.variant}</td>
              <td>
                <Typography variant={c.variant}>{c.sample}</Typography>
              </td>
              <td className={styles.scaleMeta}>{composesOf(c.variant)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
