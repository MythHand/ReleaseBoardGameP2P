import type { CSSProperties, ReactNode } from 'react'
import styles from './TypographyPreview.module.css'

// Документация по типографике: шрифты, начертания и текстовые стили правил.
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

// Текстовые стили правил — реальные значения из screens/Start/Rules.module.css.
const heading: CSSProperties = { fontFamily: 'var(--font-heading)', color: '#fff' }
const text: CSSProperties = { fontFamily: 'var(--font-text)', lineHeight: 1.62 }
const mono: CSSProperties = { fontFamily: 'var(--font-mono)' }

const rulesStyles: { role: string; spec: string; sample: ReactNode; style: CSSProperties }[] = [
  {
    role: 'Заголовок секции',
    spec: 'Onest · 19px · UPPERCASE · ls 0.05em',
    sample: 'Описание карт',
    style: { ...heading, fontSize: 19, textTransform: 'uppercase', letterSpacing: '0.05em' },
  },
  {
    role: 'Подзаголовок',
    spec: 'Onest · 15px · UPPERCASE · ls 0.08em',
    sample: 'Атакующие карты',
    style: { ...heading, fontSize: 15, textTransform: 'uppercase', letterSpacing: '0.08em' },
  },
  {
    role: 'Тело',
    spec: 'Fira Mono · 14px · lh 1.62 · 86%',
    sample:
      'Атакующие карты разыгрываются мгновенно — на свежий релиз противника или против руки других игроков в свой ход.',
    style: { ...text, fontSize: 14, color: 'rgb(255 255 255 / 86%)' },
  },
  {
    role: 'Имя карты',
    spec: 'JetBrains Mono · 12px · 600 · --cat-release',
    sample: 'Code Review',
    style: {
      ...mono,
      fontSize: 12,
      fontWeight: 600,
      letterSpacing: '0.04em',
      color: 'var(--cat-release)',
    },
  },
  {
    role: 'Описание карты',
    spec: 'Fira Mono · 14px · 78%',
    sample: 'Разыгрывается одновременно с картой Release; делает релиз неуязвимым к атакам.',
    style: { ...text, fontSize: 14, color: 'rgb(255 255 255 / 78%)' },
  },
  {
    role: 'Sudo-метка',
    spec: 'подложка rgb(255 206 70 / 20%)',
    sample: (
      <span
        style={{
          padding: '1px 6px',
          color: 'rgb(255 255 255 / 90%)',
          background: 'rgb(255 206 70 / 20%)',
        }}
      >
        sudo Git Rebase
      </span>
    ),
    style: { ...text, fontSize: 14 },
  },
  {
    role: 'Мета / подпись',
    spec: 'JetBrains Mono · 11px · UPPERCASE · 60%',
    sample: 'Кол-во игроков: от 2 до 6',
    style: {
      ...mono,
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      color: 'rgb(255 255 255 / 60%)',
    },
  },
  {
    role: 'Подсветка поиска',
    spec: 'совпадение · активное',
    sample: (
      <>
        <span
          style={{
            padding: '1px 4px',
            borderRadius: 2,
            color: '#fff',
            background: 'rgb(255 230 120 / 28%)',
          }}
        >
          release
        </span>{' '}
        <span
          style={{
            padding: '1px 4px',
            borderRadius: 2,
            color: '#1c1c1c',
            background: 'rgb(255 168 12 / 95%)',
          }}
        >
          release
        </span>
      </>
    ),
    style: { ...text, fontSize: 14 },
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

      <h3 className={styles.subH}>Стили правил</h3>
      <div className={styles.list}>
        {rulesStyles.map((s) => (
          <article key={s.role} className={styles.item}>
            <header className={styles.meta}>
              <span className={styles.role}>{s.role}</span>
              <code className={styles.var}>{s.spec}</code>
            </header>
            <div style={s.style}>{s.sample}</div>
          </article>
        ))}
      </div>
    </section>
  )
}
