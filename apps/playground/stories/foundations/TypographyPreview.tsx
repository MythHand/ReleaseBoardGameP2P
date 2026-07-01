import { Typography, type TypographyBase, type TypographyVariant, VARIANTS } from '@release/ui'
import { type Lang, useLang } from '../../Playground/lang'
import styles from './TypographyPreview.module.css'

// TEXT SCALE — a showcase of the live foundation in design/typography.module.css.
// Each row = a BASE (role); tracking is shown as a tk-NN modifier that components
// apply next to it: composes: <base> <tk>. Mirrors the real project values
// (without unifying nuances).
//
// Language logic: technical names (typography, base names, tk-NN, letter-spacing,
// component/screen names) stay English in both languages; descriptive text is
// bilingual via useLang(). The "Curated variants" block was authored in English
// and keeps English, gaining only a RU rendering of its heading + note.
type Loc = Record<Lang, string>

interface ScaleRow {
  cls: string
  font: string
  size: number
  weight?: number
  lh?: number
  upper?: boolean
  sample: Loc
  where: Loc
}

const scale: ScaleRow[] = [
  // ===== Headings — Onest (var(--font-heading)) =====
  {
    cls: 'heading-1',
    font: 'Onest',
    size: 34,
    sample: { ru: 'dimbo', en: 'dimbo' },
    where: { ru: 'Имя победителя (GameOver)', en: 'Winner name (GameOver)' },
  },
  {
    cls: 'heading-2',
    font: 'Onest',
    size: 32,
    sample: { ru: 'Итоги партии', en: 'Match results' },
    where: { ru: 'Заголовок экрана (Stats)', en: 'Screen title (Stats)' },
  },
  {
    cls: 'heading-3',
    font: 'Onest',
    size: 30,
    sample: { ru: 'Лобби', en: 'Lobby' },
    where: { ru: 'Заголовок экрана (Lobby)', en: 'Screen title (Lobby)' },
  },
  {
    cls: 'heading-4',
    font: 'Onest',
    size: 26,
    sample: { ru: 'dimbo', en: 'dimbo' },
    where: { ru: 'Имя победителя (Stats)', en: 'Winner name (Stats)' },
  },
  {
    cls: 'heading-5',
    font: 'Onest',
    size: 20,
    upper: true,
    sample: { ru: 'Создать игру', en: 'Create game' },
    where: { ru: 'Заголовок модалки', en: 'Modal title' },
  },
  {
    cls: 'heading-6',
    font: 'Onest',
    size: 19,
    upper: true,
    sample: { ru: 'Описание карт', en: 'Card reference' },
    where: { ru: 'Заголовок секции (Rules)', en: 'Section title (Rules)' },
  },
  {
    cls: 'heading-7',
    font: 'Onest',
    size: 18,
    weight: 700,
    upper: true,
    sample: { ru: 'AI зависимый', en: 'AI-dependent' },
    where: { ru: 'Заголовок ачивки (Stats)', en: 'Achievement title (Stats)' },
  },
  {
    cls: 'heading-8',
    font: 'Onest',
    size: 16,
    upper: true,
    sample: { ru: 'Параметры лобби', en: 'Lobby settings' },
    where: {
      ru: 'Заголовки блоков/секций (Lobby, Start, Invite, ModeSelect)',
      en: 'Block/section titles (Lobby, Start, Invite, ModeSelect)',
    },
  },
  {
    cls: 'subtitle',
    font: 'Onest',
    size: 16,
    sample: { ru: 'Режим партии', en: 'Game mode' },
    where: {
      ru: 'Заголовок режима (ModeSelect), tech-заголовок модалки (Start) — без капса',
      en: 'Mode title (ModeSelect), tech modal title (Start) — no caps',
    },
  },
  {
    cls: 'heading-9',
    font: 'Onest',
    size: 15,
    upper: true,
    sample: { ru: 'Атакующие карты', en: 'Attack cards' },
    where: { ru: 'Подзаголовок правил (Rules)', en: 'Rules subheading (Rules)' },
  },
  // ===== Body — Fira Mono (var(--font-text)) =====
  {
    cls: 'body-lg',
    font: 'Fira Mono',
    size: 15,
    lh: 1.6,
    sample: {
      ru: 'Описание игры на стартовом экране.',
      en: 'Game description on the start screen.',
    },
    where: {
      ru: 'Описание (Start), имя игрока (PlayerSlot), текст модалки (Lobby)',
      en: 'Description (Start), player name (PlayerSlot), modal text (Lobby)',
    },
  },
  {
    cls: 'body',
    font: 'Fira Mono',
    size: 14,
    lh: 1.62,
    sample: {
      ru: 'Тело правил и описаний карт.',
      en: 'Body of rules and card descriptions.',
    },
    where: {
      ru: 'Тело правил, описания карт, Invite, Dropdown, имя (Participants)',
      en: 'Rules body, card descriptions, Invite, Dropdown, name (Participants)',
    },
  },
  {
    cls: 'body-sm',
    font: 'Fira Mono',
    size: 13,
    sample: { ru: 'dimbo выложил Frontend', en: 'dimbo played Frontend' },
    where: { ru: 'Имя игрока (Seat), сноска (Start)', en: 'Player name (Seat), footnote (Start)' },
  },
  {
    cls: 'body-xs',
    font: 'Fira Mono',
    size: 12,
    sample: { ru: 'dimbo выложил Frontend', en: 'dimbo played Frontend' },
    where: { ru: 'Строка лога ходов (MoveHistory)', en: 'Move log line (MoveHistory)' },
  },
  {
    cls: 'body-2xs',
    font: 'Fira Mono',
    size: 11,
    sample: { ru: 'игрок выбыл из партии', en: 'player is out of the game' },
    where: {
      ru: 'Мелкие тех-строки стола (system/nested лога, рука в Seat)',
      en: 'Small tech lines on the table (system/nested log, hand in Seat)',
    },
  },
  {
    cls: 'label-lg',
    font: 'Fira Mono',
    size: 15,
    upper: true,
    sample: { ru: 'правила', en: 'rules' },
    where: { ru: 'Вкладки боковой полосы (TabRail)', en: 'Side rail tabs (TabRail)' },
  },
  {
    cls: 'tag',
    font: 'Fira Mono',
    size: 12,
    upper: true,
    sample: { ru: 'игроки', en: 'players' },
    where: {
      ru: 'Заголовки секций стола (Participants, Table settings)',
      en: 'Table section titles (Participants, Table settings)',
    },
  },
  {
    cls: 'pile-label',
    font: 'Fira Mono',
    size: 11,
    upper: true,
    sample: { ru: 'колода', en: 'deck' },
    where: { ru: 'Лейбл стопки/колоды (Pile)', en: 'Pile/deck label (Pile)' },
  },
  {
    cls: 'tag-sm',
    font: 'Fira Mono',
    size: 10,
    upper: true,
    sample: { ru: 'добор', en: 'draw' },
    where: {
      ru: 'Микро-теги (добор в MoveHistory, пустой слот ReleaseZone)',
      en: 'Micro tags (draw in MoveHistory, empty slot in ReleaseZone)',
    },
  },
  // ===== Values, code, labels — JetBrains Mono (var(--font-mono)) =====
  {
    cls: 'numeric-xl',
    font: 'JetBrains Mono',
    size: 52,
    weight: 300,
    sample: { ru: '12', en: '12' },
    where: { ru: 'Большое число ачивки (Stats)', en: 'Large achievement number (Stats)' },
  },
  {
    cls: 'code',
    font: 'JetBrains Mono',
    size: 26,
    sample: { ru: '4F2A-9K', en: '4F2A-9K' },
    where: { ru: 'Код игры (Lobby)', en: 'Game code (Lobby)' },
  },
  {
    cls: 'value',
    font: 'JetBrains Mono',
    size: 18,
    upper: true,
    sample: { ru: 'DIMBO', en: 'DIMBO' },
    where: { ru: 'Значение поля ввода (Input)', en: 'Input field value (Input)' },
  },
  {
    cls: 'button',
    font: 'JetBrains Mono',
    size: 17,
    upper: true,
    sample: { ru: 'создать игру', en: 'create game' },
    where: { ru: 'Primary-кнопка (в брекетах)', en: 'Primary button (in brackets)' },
  },
  {
    cls: 'numeric',
    font: 'JetBrains Mono',
    size: 16,
    sample: { ru: '12', en: '12' },
    where: {
      ru: 'Числа таблицы (Stats), значение слайдера',
      en: 'Table numbers (Stats), slider value',
    },
  },
  {
    cls: 'mono-lg',
    font: 'JetBrains Mono',
    size: 15,
    sample: { ru: 'release-note', en: 'release-note' },
    where: {
      ru: 'Код-заметка (Pile); таб (TabRail, UPPERCASE)',
      en: 'Code note (Pile); tab (TabRail, UPPERCASE)',
    },
  },
  {
    cls: 'mono',
    font: 'JetBrains Mono',
    size: 14,
    sample: { ru: 'dimbo', en: 'dimbo' },
    where: { ru: 'Имя игрока (Stats), Reconnect', en: 'Player name (Stats), Reconnect' },
  },
  {
    cls: 'mono-strong',
    font: 'JetBrains Mono',
    size: 14,
    weight: 700,
    sample: { ru: 'Соло', en: 'Solo' },
    where: { ru: 'Заголовок опции (ModeSelect)', en: 'Option title (ModeSelect)' },
  },
  {
    cls: 'notice',
    font: 'JetBrains Mono',
    size: 14,
    upper: true,
    sample: { ru: 'переподключение', en: 'reconnecting' },
    where: { ru: 'Плашка переподключения (Reconnect)', en: 'Reconnect banner (Reconnect)' },
  },
  {
    cls: 'mono-md',
    font: 'JetBrains Mono',
    size: 13,
    sample: { ru: 'поиск по правилам', en: 'search the rules' },
    where: { ru: 'Поле поиска правил (Rules)', en: 'Rules search field (Rules)' },
  },
  {
    cls: 'code-sm',
    font: 'JetBrains Mono',
    size: 12,
    weight: 600,
    sample: { ru: 'Code Review', en: 'Code Review' },
    where: { ru: 'Имя карты / название режима (Rules)', en: 'Card name / mode name (Rules)' },
  },
  {
    cls: 'label-md',
    font: 'JetBrains Mono',
    size: 13,
    upper: true,
    sample: { ru: 'вы выбыли', en: 'you are out' },
    where: { ru: 'Крупный бейдж-плашка (Badge lg)', en: 'Large badge plate (Badge lg)' },
  },
  {
    cls: 'label',
    font: 'JetBrains Mono',
    size: 12,
    upper: true,
    sample: { ru: 'Победы', en: 'Wins' },
    where: {
      ru: 'Лейблы секций, теги, бейджи (Lobby, Stats, Participants…)',
      en: 'Section labels, tags, badges (Lobby, Stats, Participants…)',
    },
  },
  {
    cls: 'mono-sm',
    font: 'JetBrains Mono',
    size: 12,
    sample: { ru: 'игра против ИИ', en: 'game against AI' },
    where: {
      ru: 'Описание опции (ModeSelect), второстепенные тех-строки',
      en: 'Option description (ModeSelect), secondary tech lines',
    },
  },
  {
    cls: 'label-sm',
    font: 'JetBrains Mono',
    size: 11,
    upper: true,
    sample: { ru: 'Ваш никнейм', en: 'Your nickname' },
    where: {
      ru: 'Лейблы полей (Input), бейджи, tech/danger-кнопки',
      en: 'Field labels (Input), badges, tech/danger buttons',
    },
  },
  {
    cls: 'mono-xs',
    font: 'JetBrains Mono',
    size: 11,
    sample: { ru: 'недоступно', en: 'unavailable' },
    where: { ru: 'Подсказка дропдауна, мелкие тех-строки', en: 'Dropdown hint, small tech lines' },
  },
  {
    cls: 'overline',
    font: 'JetBrains Mono',
    size: 10,
    upper: true,
    sample: { ru: 'смотреть обзор', en: 'watch review' },
    where: {
      ru: 'Капшен play-кнопки (Start), метки (MoveHistory, ReleaseZone)',
      en: 'Play button caption (Start), labels (MoveHistory, ReleaseZone)',
    },
  },
]

// tracking variations defined in typography.module.css
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

// Typography docs: fonts and their available weights.
// Rules text styles are on a separate page (RulesStyles).
interface FontRow {
  varName: string
  name: string
  role: Loc
  where: Loc
  sample: Loc
  cls: string
}
const fonts: FontRow[] = [
  {
    varName: '--font-heading',
    name: 'Onest',
    role: { ru: 'Заголовки', en: 'Headings' },
    where: {
      ru: 'Заголовки карт, экранов и секций (настольная игра).',
      en: 'Card, screen and section titles (board game).',
    },
    sample: { ru: 'Release любой ценой', en: 'Release любой ценой' },
    cls: styles.heading,
  },
  {
    varName: '--font-text',
    name: 'Fira Mono',
    role: { ru: 'Основной текст', en: 'Body text' },
    where: {
      ru: 'Тело карт, описания, подписи, HUD, история действий (настольная игра).',
      en: 'Card body, descriptions, captions, HUD, action history (board game).',
    },
    sample: {
      ru: 'Выложите эту карту в свою зону релиза. Для этого сбросьте 1 карту из руки.',
      en: 'Play this card into your release zone. To do so, discard 1 card from your hand.',
    },
    cls: styles.text,
  },
  {
    varName: '--font-mono',
    name: 'JetBrains Mono',
    role: { ru: 'Терминал / лоадер', en: 'Terminal / loader' },
    where: {
      ru: 'Только модуль загрузки (boot-экран). Шрифт лоадера — не затираем.',
      en: 'Loader module only (boot screen). The loader font — do not override.',
    },
    sample: {
      ru: '> booting release-engine … [ok]   PUSH',
      en: '> booting release-engine … [ok]   PUSH',
    },
    cls: styles.mono,
  },
]

// Available weights (loaded in index.html).
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

// Section headings and table column headers — descriptive, so bilingual.
const T = {
  ru: {
    fonts: 'Шрифты',
    weights: 'Начертания',
    scale: 'Шкала текста',
    tracking: 'Вариации трекинга (tk)',
    curated: 'Курируемые варианты (Typography)',
    colBase: 'база',
    colSample: 'образец',
    colFont: 'шрифт',
    colSize: 'размер',
    colCase: 'регистр',
    colWhere: 'где используется',
    colMod: 'модификатор',
  },
  en: {
    fonts: 'Fonts',
    weights: 'Weights',
    scale: 'Text scale',
    tracking: 'Tracking variations (tk)',
    curated: 'Curated variants (Typography)',
    colBase: 'base',
    colSample: 'sample',
    colFont: 'font',
    colSize: 'size',
    colCase: 'case',
    colWhere: 'where used',
    colMod: 'modifier',
  },
}

export default function TypographyPreview() {
  const { lang } = useLang()
  const t = T[lang]
  return (
    <section className={styles.root}>
      <h2 className={styles.h}>typography</h2>

      <h3 className={styles.subH}>{t.fonts}</h3>
      <div className={styles.list}>
        {fonts.map((f) => (
          <article key={f.varName} className={styles.item}>
            <header className={styles.meta}>
              <span className={styles.role}>{f.role[lang]}</span>
              <span className={styles.name}>{f.name}</span>
              <code className={styles.var}>{f.varName}</code>
            </header>
            <div className={f.cls}>{f.sample[lang]}</div>
            <p className={styles.where}>{f.where[lang]}</p>
          </article>
        ))}
      </div>

      <h3 className={styles.subH}>{t.weights}</h3>
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

      <h3 className={styles.subH}>{t.scale}</h3>
      <p className={styles.scaleNote}>
        {lang === 'ru' ? (
          <>
            Двухслойная: <b>база</b> (роль — семейство + размер + начертание + регистр) и{' '}
            <b>вариация трекинга</b> <code>tk-NN</code>. В компоненте —{' '}
            <code>composes: база tk-NN</code> (трекинг живёт только в tk). Образцы ниже отрендерены
            самой базой — без трекинга; вариации tk показаны отдельной таблицей. Реализовано в{' '}
            <code>design/typography.module.css</code>. Исключены глифы (♛, ×, ▶) и шрифт лоадера.
          </>
        ) : (
          <>
            Two layers: a <b>base</b> (role — family + size + weight + case) and a{' '}
            <b>tracking variation</b> <code>tk-NN</code>. In the component —{' '}
            <code>composes: base tk-NN</code> (tracking lives only in tk). The samples below are
            rendered by the base itself — without tracking; tk variations are shown in a separate
            table. Implemented in <code>design/typography.module.css</code>. Glyphs (♛, ×, ▶) and
            the loader font are excluded.
          </>
        )}
      </p>
      <table className={styles.scaleTable}>
        <thead>
          <tr>
            <th>{t.colBase}</th>
            <th>{t.colSample}</th>
            <th>{t.colFont}</th>
            <th>{t.colSize}</th>
            <th>{t.colCase}</th>
            <th>{t.colWhere}</th>
          </tr>
        </thead>
        <tbody>
          {scale.map((r) => (
            <tr key={r.cls}>
              <td className={styles.scaleName}>{r.cls}</td>
              <td>
                <Typography base={r.cls as TypographyBase}>{r.sample[lang]}</Typography>
              </td>
              <td className={styles.scaleMeta}>{r.font}</td>
              <td className={styles.scaleMeta}>
                {r.size}px{r.lh ? ` / ${r.lh}` : ''}
                {r.weight ? ` · ${r.weight}` : ''}
              </td>
              <td className={styles.scaleMeta}>{r.upper ? 'UPPERCASE' : '—'}</td>
              <td className={styles.scaleWhere}>{r.where[lang]}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className={styles.subH}>{t.tracking}</h3>
      <p className={styles.scaleNote}>
        {lang === 'ru' ? (
          <>
            Модификаторы <code>letter-spacing</code>, заложены в{' '}
            <code>design/typography.module.css</code>. Подключаются рядом с базой:{' '}
            <code>composes: база tk-NN</code>.
          </>
        ) : (
          <>
            <code>letter-spacing</code> modifiers, defined in{' '}
            <code>design/typography.module.css</code>. Applied next to a base:{' '}
            <code>composes: base tk-NN</code>.
          </>
        )}
      </p>
      <table className={styles.scaleTable}>
        <thead>
          <tr>
            <th>{t.colMod}</th>
            <th>letter-spacing</th>
            <th>{t.colSample}</th>
          </tr>
        </thead>
        <tbody>
          {trackings.map((tr) => (
            <tr key={tr.name}>
              <td className={styles.scaleName}>{tr.name}</td>
              <td className={styles.scaleMeta}>{tr.em}</td>
              <td className={styles.scaleMeta} style={{ letterSpacing: tr.em }}>
                RELEASE
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className={styles.subH}>{t.curated}</h3>
      <p className={styles.scaleNote}>
        {lang === 'ru' ? (
          <>
            Семантические варианты компонента <code>{'<Typography>'}</code> — приоритетный способ
            задавать текст (фронтенд и библиотека). Каждый — композиция <code>base</code> и{' '}
            <code>tk</code> из шкалы выше; значения не дублируются. Длинный хвост идёт через сырые{' '}
            <code>base</code>/<code>tk</code>.
          </>
        ) : (
          <>
            Semantic variants of the <code>{'<Typography>'}</code> component — the preferred way to
            set text (frontend and library). Each is a composition of a base and <code>tk</code>{' '}
            from the scale above; values are not duplicated. The long tail goes through raw{' '}
            <code>base</code>/<code>tk</code>.
          </>
        )}
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
