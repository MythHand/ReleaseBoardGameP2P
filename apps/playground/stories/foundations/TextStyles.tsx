import type { CSSProperties } from 'react'
import { type Lang, useLang } from '../../Playground/lang'
import styles from './TypographyPreview.module.css'

// Project-wide text styles (real values from the components), grouped by area.
// The technical CSS under each sample is derived from the same style object as
// the sample itself — the values always match. var(--font-text) = Fira Mono,
// var(--font-mono) = JetBrains Mono, var(--font-heading) = Onest.
//
// Language logic: the page title and the group titles are technical → English in
// both languages. In a role, component / screen / variant names stay English
// (Input, Badge, Stats, Modal, Primary…); only the descriptive part is bilingual.
// Samples are bilingual too. useLang() selects the RU/EN variant.
type Loc = Record<Lang, string>

const heading: CSSProperties = { fontFamily: 'var(--font-heading)', color: '#fff' }
const text: CSSProperties = { fontFamily: 'var(--font-text)', lineHeight: 1.5 }
const mono: CSSProperties = { fontFamily: 'var(--font-mono)' }

interface Entry {
  role: Loc
  sample: Loc
  style: CSSProperties
}

const UNITLESS = new Set(['font-weight', 'line-height', 'opacity'])

// CSSProperties → readable CSS (camelCase → kebab, numbers → px except unitless).
const cssText = (style: CSSProperties): string =>
  Object.entries(style)
    .map(([k, v]) => {
      const prop = k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
      const val = typeof v === 'number' && !UNITLESS.has(prop) ? `${v}px` : v
      return `${prop}: ${val};`
    })
    .join('\n')

// Group titles are technical → English in both languages.
const sections: { title: string; items: Entry[] }[] = [
  {
    title: 'Headings',
    items: [
      {
        role: { ru: 'Экран (Stats / Lobby)', en: 'Screen (Stats / Lobby)' },
        sample: { ru: 'Статистика партии', en: 'Match stats' },
        style: { ...heading, fontSize: 32, letterSpacing: '0.04em' },
      },
      {
        role: { ru: 'Modal', en: 'Modal' },
        sample: { ru: 'Создать игру', en: 'Create game' },
        style: { ...heading, fontSize: 20, textTransform: 'uppercase', letterSpacing: '0.06em' },
      },
      {
        role: { ru: 'Блок / подсекция', en: 'Block / subsection' },
        sample: { ru: 'Параметры лобби', en: 'Lobby settings' },
        style: { ...heading, fontSize: 16, textTransform: 'uppercase', letterSpacing: '0.04em' },
      },
    ],
  },
  {
    title: 'Captions and labels',
    items: [
      {
        role: { ru: 'Лейбл поля (Input)', en: 'Field label (Input)' },
        sample: { ru: 'Ваш никнейм', en: 'Your nickname' },
        style: {
          ...mono,
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.16em',
          color: 'rgb(255 255 255 / 70%)',
        },
      },
      {
        role: { ru: 'Лейбл секции (Stats / Lobby)', en: 'Section label (Stats / Lobby)' },
        sample: { ru: 'Победы', en: 'Wins' },
        style: {
          ...mono,
          fontSize: 12,
          textTransform: 'uppercase',
          letterSpacing: '0.14em',
          color: 'rgb(255 255 255 / 70%)',
        },
      },
      {
        role: { ru: 'Тег (Start)', en: 'Tag (Start)' },
        sample: { ru: 'Открытый P2P-проект', en: 'Open P2P project' },
        style: {
          ...mono,
          fontSize: 12,
          textTransform: 'uppercase',
          letterSpacing: '0.16em',
          color: 'var(--cat-release)',
        },
      },
      {
        role: { ru: 'Badge', en: 'Badge' },
        sample: { ru: 'хост', en: 'host' },
        style: {
          ...mono,
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          padding: '2px 8px',
          border: '1px solid rgb(255 255 255 / 18%)',
          borderRadius: 4,
        },
      },
    ],
  },
  {
    title: 'Values and input',
    items: [
      {
        role: { ru: 'Значение поля (Input)', en: 'Field value (Input)' },
        sample: { ru: 'DIMBO', en: 'DIMBO' },
        style: {
          ...mono,
          fontSize: 18,
          textTransform: 'uppercase',
          letterSpacing: '0.14em',
          color: '#fff',
        },
      },
      {
        role: { ru: 'Код игры (Lobby)', en: 'Game code (Lobby)' },
        sample: { ru: '4F2A-9K', en: '4F2A-9K' },
        style: { ...mono, fontSize: 26, letterSpacing: '0.2em', color: '#fff' },
      },
      {
        role: { ru: 'Крупное число (Stats)', en: 'Large number (Stats)' },
        sample: { ru: '12', en: '12' },
        style: { ...heading, fontSize: 40, lineHeight: 1 },
      },
    ],
  },
  {
    title: 'Buttons',
    items: [
      {
        role: { ru: 'Primary (брекеты)', en: 'Primary (brackets)' },
        sample: { ru: '[ создать игру ]', en: '[ create game ]' },
        style: {
          ...mono,
          fontSize: 17,
          textTransform: 'uppercase',
          letterSpacing: '0.18em',
          color: '#fff',
        },
      },
      {
        role: { ru: 'Tech / Danger', en: 'Tech / Danger' },
        sample: { ru: 'отмена', en: 'cancel' },
        style: {
          ...mono,
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.18em',
          color: 'rgb(255 255 255 / 60%)',
          padding: '6px 10px',
          border: '1px solid rgb(255 255 255 / 18%)',
          borderRadius: 4,
        },
      },
    ],
  },
  {
    title: 'Table / HUD',
    items: [
      {
        role: { ru: 'Имя игрока (Seat)', en: 'Player name (Seat)' },
        sample: { ru: 'dimbo', en: 'dimbo' },
        style: { ...text, fontSize: 13, letterSpacing: '0.03em' },
      },
      {
        role: { ru: 'Строка лога (MoveHistory)', en: 'Log line (MoveHistory)' },
        sample: { ru: 'dimbo выложил Frontend', en: 'dimbo played Frontend' },
        style: { ...text, fontSize: 12, lineHeight: 1.3 },
      },
      {
        role: { ru: 'Метка / счётчик', en: 'Marker / counter' },
        sample: { ru: 'Раунд 2', en: 'Round 2' },
        style: {
          ...mono,
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'rgb(255 255 255 / 50%)',
        },
      },
    ],
  },
  {
    title: 'Rules',
    items: [
      {
        role: { ru: 'Заголовок секции (Rules)', en: 'Section heading (Rules)' },
        sample: { ru: 'Описание карт', en: 'Card reference' },
        style: { ...heading, fontSize: 19, textTransform: 'uppercase', letterSpacing: '0.05em' },
      },
      {
        role: { ru: 'Подзаголовок (Rules)', en: 'Subheading (Rules)' },
        sample: { ru: 'Атакующие карты', en: 'Attack cards' },
        style: { ...heading, fontSize: 15, textTransform: 'uppercase', letterSpacing: '0.08em' },
      },
      {
        role: { ru: 'Тело (Rules)', en: 'Body (Rules)' },
        sample: {
          ru: 'Атакующие карты разыгрываются мгновенно — на свежий релиз противника или против руки других игроков.',
          en: "Attack cards are played instantly — on an opponent's fresh release or against other players' hands.",
        },
        style: { ...text, fontSize: 14, lineHeight: 1.62, color: 'rgb(255 255 255 / 86%)' },
      },
      {
        role: { ru: 'Имя карты (Rules)', en: 'Card name (Rules)' },
        sample: { ru: 'Code Review', en: 'Code Review' },
        style: {
          ...mono,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.04em',
          color: 'var(--cat-release)',
        },
      },
      {
        role: { ru: 'Описание карты (Rules)', en: 'Card description (Rules)' },
        sample: {
          ru: 'Разыгрывается одновременно с картой Release; делает релиз неуязвимым к атакам.',
          en: 'Played simultaneously with a Release card; makes the release immune to attacks.',
        },
        style: { ...text, fontSize: 14, lineHeight: 1.62, color: 'rgb(255 255 255 / 78%)' },
      },
      {
        role: { ru: 'Sudo-метка', en: 'Sudo marker' },
        sample: { ru: 'sudo Git Rebase', en: 'sudo Git Rebase' },
        style: {
          ...text,
          fontSize: 14,
          padding: '1px 6px',
          color: 'rgb(255 255 255 / 90%)',
          background: 'rgb(255 206 70 / 20%)',
        },
      },
      {
        role: { ru: 'Подсветка поиска — совпадение', en: 'Search highlight — match' },
        sample: { ru: 'release', en: 'release' },
        style: {
          ...text,
          fontSize: 14,
          padding: '1px 4px',
          borderRadius: 2,
          color: '#fff',
          background: 'rgb(255 230 120 / 28%)',
        },
      },
      {
        role: { ru: 'Подсветка поиска — активное', en: 'Search highlight — active' },
        sample: { ru: 'release', en: 'release' },
        style: {
          ...text,
          fontSize: 14,
          padding: '1px 4px',
          borderRadius: 2,
          color: '#1c1c1c',
          background: 'rgb(255 168 12 / 95%)',
        },
      },
    ],
  },
]

export default function TextStyles() {
  const { lang } = useLang()
  return (
    <section className={styles.root}>
      <h2 className={styles.h}>text styles</h2>
      {sections.map((sec) => (
        <div key={sec.title}>
          <h3 className={styles.subH}>{sec.title}</h3>
          <div className={styles.list}>
            {sec.items.map((s) => (
              <article key={s.role.en} className={styles.item}>
                <header className={styles.meta}>
                  <span className={styles.role}>{s.role[lang]}</span>
                </header>
                <div className={styles.sampleRow}>
                  <span style={s.style}>{s.sample[lang]}</span>
                </div>
                <pre className={styles.css}>{cssText(s.style)}</pre>
              </article>
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}
