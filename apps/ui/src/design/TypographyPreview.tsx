import type { CSSProperties } from 'react'
import Typography, { type TypographyVariant } from '../primitives/Typography'
import styles from './TypographyPreview.module.css'

// ШКАЛА ТЕКСТА — витрина живого фундамента design/typography.module.css.
// Каждая строка = БАЗА (роль); трекинг показан как модификатор tk-NN, который
// в компонентах подключается рядом: composes: <база> <tk>. Зеркалит реальные
// значения проекта (без унификации нюансов).
interface ScaleRow {
  cls: string
  font: string
  fontVar: string
  size: number
  weight?: number
  lh?: number
  tracking?: string
  upper?: boolean
  sample: string
  where: string
}

const scale: ScaleRow[] = [
  // ===== Заголовки — Onest (var(--font-heading)) =====
  {
    cls: 'heading-1',
    font: 'Onest',
    fontVar: 'var(--font-heading)',
    size: 34,
    tracking: '0.02em',
    sample: 'dimbo',
    where: 'Имя победителя (GameOver)',
  },
  {
    cls: 'heading-2',
    font: 'Onest',
    fontVar: 'var(--font-heading)',
    size: 32,
    tracking: '0.04em',
    sample: 'Итоги партии',
    where: 'Заголовок экрана (Stats)',
  },
  {
    cls: 'heading-3',
    font: 'Onest',
    fontVar: 'var(--font-heading)',
    size: 30,
    tracking: '0.04em',
    sample: 'Лобби',
    where: 'Заголовок экрана (Lobby)',
  },
  {
    cls: 'heading-4',
    font: 'Onest',
    fontVar: 'var(--font-heading)',
    size: 26,
    tracking: '0.02em',
    sample: 'dimbo',
    where: 'Имя победителя (Stats)',
  },
  {
    cls: 'heading-5',
    font: 'Onest',
    fontVar: 'var(--font-heading)',
    size: 20,
    tracking: '0.06em',
    upper: true,
    sample: 'Создать игру',
    where: 'Заголовок модалки',
  },
  {
    cls: 'heading-6',
    font: 'Onest',
    fontVar: 'var(--font-heading)',
    size: 19,
    tracking: '0.05em',
    upper: true,
    sample: 'Описание карт',
    where: 'Заголовок секции (Rules)',
  },
  {
    cls: 'heading-7',
    font: 'Onest',
    fontVar: 'var(--font-heading)',
    size: 18,
    weight: 700,
    tracking: '0.02em',
    upper: true,
    sample: 'AI зависимый',
    where: 'Заголовок ачивки (Stats)',
  },
  {
    cls: 'heading-8',
    font: 'Onest',
    fontVar: 'var(--font-heading)',
    size: 16,
    tracking: '0.04em',
    upper: true,
    sample: 'Параметры лобби',
    where: 'Заголовки блоков/секций (Lobby, Start, Invite, ModeSelect)',
  },
  {
    cls: 'subtitle',
    font: 'Onest',
    fontVar: 'var(--font-heading)',
    size: 16,
    tracking: '0.02em',
    sample: 'Режим партии',
    where: 'Заголовок режима (ModeSelect), tech-заголовок модалки (Start) — без капса',
  },
  {
    cls: 'heading-9',
    font: 'Onest',
    fontVar: 'var(--font-heading)',
    size: 15,
    tracking: '0.08em',
    upper: true,
    sample: 'Атакующие карты',
    where: 'Подзаголовок правил (Rules)',
  },
  // ===== Тело — Fira Mono (var(--font-text)) =====
  {
    cls: 'body-lg',
    font: 'Fira Mono',
    fontVar: 'var(--font-text)',
    size: 15,
    lh: 1.6,
    sample: 'Описание игры на стартовом экране.',
    where: 'Описание (Start), имя игрока (PlayerSlot), текст модалки (Lobby)',
  },
  {
    cls: 'body',
    font: 'Fira Mono',
    fontVar: 'var(--font-text)',
    size: 14,
    lh: 1.62,
    sample: 'Тело правил и описаний карт.',
    where: 'Тело правил, описания карт, Invite, Dropdown, имя (Participants)',
  },
  {
    cls: 'body-sm',
    font: 'Fira Mono',
    fontVar: 'var(--font-text)',
    size: 13,
    sample: 'dimbo выложил Frontend',
    where: 'Имя игрока (Seat), сноска (Start)',
  },
  {
    cls: 'body-xs',
    font: 'Fira Mono',
    fontVar: 'var(--font-text)',
    size: 12,
    sample: 'dimbo выложил Frontend',
    where: 'Строка лога ходов (MoveHistory)',
  },
  {
    cls: 'body-2xs',
    font: 'Fira Mono',
    fontVar: 'var(--font-text)',
    size: 11,
    sample: 'игрок выбыл из партии',
    where: 'Мелкие тех-строки стола (system/nested лога, рука в Seat)',
  },
  {
    cls: 'label-lg',
    font: 'Fira Mono',
    fontVar: 'var(--font-text)',
    size: 15,
    tracking: '0.16em',
    upper: true,
    sample: 'правила',
    where: 'Вкладки боковой полосы (TabRail)',
  },
  {
    cls: 'tag',
    font: 'Fira Mono',
    fontVar: 'var(--font-text)',
    size: 12,
    tracking: '0.1em',
    upper: true,
    sample: 'игроки',
    where: 'Заголовки секций стола (Participants, Table settings)',
  },
  {
    cls: 'pile-label',
    font: 'Fira Mono',
    fontVar: 'var(--font-text)',
    size: 11,
    tracking: '0.08em',
    upper: true,
    sample: 'колода',
    where: 'Лейбл стопки/колоды (Pile)',
  },
  {
    cls: 'tag-sm',
    font: 'Fira Mono',
    fontVar: 'var(--font-text)',
    size: 10,
    tracking: '0.08em',
    upper: true,
    sample: 'добор',
    where: 'Микро-теги (добор в MoveHistory, пустой слот ReleaseZone)',
  },
  // ===== Значения, код, лейблы — JetBrains Mono (var(--font-mono)) =====
  {
    cls: 'numeric-xl',
    font: 'JetBrains Mono',
    fontVar: 'var(--font-mono)',
    size: 52,
    weight: 300,
    tracking: '0',
    sample: '12',
    where: 'Большое число ачивки (Stats)',
  },
  {
    cls: 'code',
    font: 'JetBrains Mono',
    fontVar: 'var(--font-mono)',
    size: 26,
    tracking: '0.2em',
    sample: '4F2A-9K',
    where: 'Код игры (Lobby)',
  },
  {
    cls: 'value',
    font: 'JetBrains Mono',
    fontVar: 'var(--font-mono)',
    size: 18,
    tracking: '0.14em',
    upper: true,
    sample: 'DIMBO',
    where: 'Значение поля ввода (Input)',
  },
  {
    cls: 'button',
    font: 'JetBrains Mono',
    fontVar: 'var(--font-mono)',
    size: 17,
    tracking: '0.18em',
    upper: true,
    sample: 'создать игру',
    where: 'Primary-кнопка (в брекетах)',
  },
  {
    cls: 'numeric',
    font: 'JetBrains Mono',
    fontVar: 'var(--font-mono)',
    size: 16,
    sample: '12',
    where: 'Числа таблицы (Stats), значение слайдера',
  },
  {
    cls: 'mono-lg',
    font: 'JetBrains Mono',
    fontVar: 'var(--font-mono)',
    size: 15,
    tracking: '0.02em',
    sample: 'release-note',
    where: 'Код-заметка (Pile); таб (TabRail, UPPERCASE)',
  },
  {
    cls: 'mono',
    font: 'JetBrains Mono',
    fontVar: 'var(--font-mono)',
    size: 14,
    tracking: '0.04em',
    sample: 'dimbo',
    where: 'Имя игрока (Stats), Reconnect',
  },
  {
    cls: 'mono-strong',
    font: 'JetBrains Mono',
    fontVar: 'var(--font-mono)',
    size: 14,
    weight: 700,
    tracking: '0.02em',
    sample: 'Соло',
    where: 'Заголовок опции (ModeSelect)',
  },
  {
    cls: 'notice',
    font: 'JetBrains Mono',
    fontVar: 'var(--font-mono)',
    size: 14,
    tracking: '0.1em',
    upper: true,
    sample: 'переподключение',
    where: 'Плашка переподключения (Reconnect)',
  },
  {
    cls: 'mono-md',
    font: 'JetBrains Mono',
    fontVar: 'var(--font-mono)',
    size: 13,
    tracking: '0.04em',
    sample: 'поиск по правилам',
    where: 'Поле поиска правил (Rules)',
  },
  {
    cls: 'code-sm',
    font: 'JetBrains Mono',
    fontVar: 'var(--font-mono)',
    size: 12,
    weight: 600,
    tracking: '0.04em',
    sample: 'Code Review',
    where: 'Имя карты / название режима (Rules)',
  },
  {
    cls: 'label-md',
    font: 'JetBrains Mono',
    fontVar: 'var(--font-mono)',
    size: 13,
    tracking: '0.14em',
    upper: true,
    sample: 'вы выбыли',
    where: 'Крупный бейдж-плашка (Badge lg)',
  },
  {
    cls: 'label',
    font: 'JetBrains Mono',
    fontVar: 'var(--font-mono)',
    size: 12,
    tracking: '0.12em',
    upper: true,
    sample: 'Победы',
    where: 'Лейблы секций, теги, бейджи (Lobby, Stats, Participants…)',
  },
  {
    cls: 'mono-sm',
    font: 'JetBrains Mono',
    fontVar: 'var(--font-mono)',
    size: 12,
    tracking: '0.01em',
    sample: 'игра против ИИ',
    where: 'Описание опции (ModeSelect), второстепенные тех-строки',
  },
  {
    cls: 'label-sm',
    font: 'JetBrains Mono',
    fontVar: 'var(--font-mono)',
    size: 11,
    tracking: '0.16em',
    upper: true,
    sample: 'Ваш никнейм',
    where: 'Лейблы полей (Input), бейджи, tech/danger-кнопки',
  },
  {
    cls: 'mono-xs',
    font: 'JetBrains Mono',
    fontVar: 'var(--font-mono)',
    size: 11,
    tracking: '0.04em',
    sample: 'недоступно',
    where: 'Подсказка дропдауна, мелкие тех-строки',
  },
  {
    cls: 'overline',
    font: 'JetBrains Mono',
    fontVar: 'var(--font-mono)',
    size: 10,
    tracking: '0.2em',
    upper: true,
    sample: 'смотреть обзор',
    where: 'Капшен play-кнопки (Start), метки (MoveHistory, ReleaseZone)',
  },
]

const sampleStyle = (r: ScaleRow): CSSProperties => ({
  fontFamily: r.fontVar,
  fontSize: r.size,
  fontWeight: r.weight,
  lineHeight: r.lh,
  letterSpacing: r.tracking,
  textTransform: r.upper ? 'uppercase' : undefined,
})

// имя tk-модификатора по значению трекинга (0.16em → tk-16, 0 → tk-0, нет → —)
const tkName = (t?: string): string => {
  if (t == null) return '—'
  if (t === '0') return 'tk-0'
  const nn = Math.round(Number.parseFloat(t) * 100)
  return `tk-${nn.toString().padStart(2, '0')}`
}

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

// Curated <Typography> variants — each is a base + tk composition from the scale above.
const curated: { variant: TypographyVariant; composes: string; sample: string }[] = [
  { variant: 'pageTitle', composes: 'heading-3 · tk-04', sample: 'Lobby' },
  { variant: 'sectionTitle', composes: 'heading-8 · tk-04', sample: 'Lobby settings' },
  { variant: 'panelTitle', composes: 'subtitle · tk-02', sample: 'Game mode' },
  { variant: 'body', composes: 'body-lg', sample: 'Game description on the start screen.' },
  { variant: 'footnote', composes: 'body-sm', sample: 'Footnote under a field.' },
  { variant: 'tag', composes: 'label · tk-16', sample: 'players' },
  { variant: 'metaLabel', composes: 'label-sm · tk-14', sample: 'design' },
  { variant: 'code', composes: 'code · tk-20', sample: '4F2A-9K' },
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
        <code>composes: база tk-NN</code> (трекинг живёт только в tk, дизайн держится на этих
        нюансах). Колонка «tk» — модификатор для типового применения базы; «—» = трекинг нормальный,
        без модификатора. Реализовано в <code>design/typography.module.css</code>. Исключены глифы
        (♛, ×, ▶) и шрифт лоадера.
      </p>
      <table className={styles.scaleTable}>
        <thead>
          <tr>
            <th>база</th>
            <th>образец</th>
            <th>шрифт</th>
            <th>размер</th>
            <th>tk</th>
            <th>регистр</th>
            <th>где используется</th>
          </tr>
        </thead>
        <tbody>
          {scale.map((r) => (
            <tr key={r.cls}>
              <td className={styles.scaleName}>{r.cls}</td>
              <td>
                <span style={sampleStyle(r)}>{r.sample}</span>
              </td>
              <td className={styles.scaleMeta}>{r.font}</td>
              <td className={styles.scaleMeta}>
                {r.size}px{r.lh ? ` / ${r.lh}` : ''}
                {r.weight ? ` · ${r.weight}` : ''}
              </td>
              <td className={styles.scaleMeta}>{tkName(r.tracking)}</td>
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
              <td className={styles.scaleMeta}>{c.composes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
