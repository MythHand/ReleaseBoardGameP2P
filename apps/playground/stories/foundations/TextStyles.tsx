import type { CSSProperties } from 'react'
import { type Lang, useLang } from '../../Playground/lang'
import styles from './TextStyles.module.css'

// Applied text styles — the project's typography BY WHERE IT IS USED, not as code
// to paste. Each row: where/why it's used · the live sample · a readable anatomy
// of the type (family · size · weight · case · tracking). A small tag marks the
// contextual styling layered ON TOP of the type (colour / highlight, e.g. Rules);
// a component's own chrome (Badge border, Button box) is not shown here.
type Loc = Record<Lang, string>

const heading: CSSProperties = { fontFamily: 'var(--font-heading)', color: '#fff' }
const text: CSSProperties = { fontFamily: 'var(--font-text)', lineHeight: 1.5 }
const mono: CSSProperties = { fontFamily: 'var(--font-mono)' }

interface Entry {
  role: Loc
  sample: Loc
  style: CSSProperties
  // label for a contextual style layered on top of the type (accent / highlight)
  layer?: string
}

// family var → readable name
const FAMILY: Record<string, string> = {
  'var(--font-heading)': 'Onest',
  'var(--font-text)': 'Fira Mono',
  'var(--font-mono)': 'JetBrains Mono',
}

// Readable anatomy of the TYPE only (family · size · weight · case · tracking).
// Colour / highlight are the contextual layer and are shown as a tag, not here.
function anatomy(style: CSSProperties): string {
  const parts: string[] = []
  const fam = style.fontFamily as string | undefined
  if (fam) parts.push(FAMILY[fam] ?? fam)
  if (style.fontSize != null) parts.push(String(style.fontSize))
  if (style.fontWeight != null && style.fontWeight !== 400) parts.push(String(style.fontWeight))
  if (style.textTransform === 'uppercase') parts.push('uppercase')
  if (style.letterSpacing) parts.push(String(style.letterSpacing))
  return parts.join(' · ')
}

// Group titles are technical → English in both languages.
const sections: { title: string; items: Entry[] }[] = [
  {
    title: 'Headings',
    items: [
      {
        role: { ru: 'Заголовок экрана (Stats)', en: 'Screen title (Stats)' },
        sample: { ru: 'Статистика партии', en: 'Match stats' },
        style: { ...heading, fontSize: 32, letterSpacing: '0.04em' },
      },
      {
        role: { ru: 'Заголовок экрана (Lobby)', en: 'Screen title (Lobby)' },
        sample: { ru: 'Лобби', en: 'Lobby' },
        style: { ...heading, fontSize: 30, letterSpacing: '0.04em' },
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
        layer: 'accent',
      },
    ],
  },
  {
    title: 'Values',
    items: [
      {
        role: { ru: 'Крупное число (Stats)', en: 'Large number (Stats)' },
        sample: { ru: '12', en: '12' },
        style: { ...mono, fontSize: 52, fontWeight: 300 },
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
        layer: 'accent',
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
        layer: 'sudo',
      },
      {
        role: { ru: 'Подсветка поиска — совпадение', en: 'Search highlight — match' },
        sample: { ru: 'release', en: 'release' },
        style: {
          ...text,
          fontSize: 14,
          padding: '1px 4px',
          borderRadius: 2,
          color: 'var(--fg)',
          background: 'var(--yellow-28)',
        },
        layer: 'match',
      },
      {
        role: { ru: 'Подсветка поиска — активное', en: 'Search highlight — active' },
        sample: { ru: 'release', en: 'release' },
        style: {
          ...text,
          fontSize: 14,
          padding: '1px 4px',
          borderRadius: 2,
          color: 'var(--charcoal)',
          background: 'var(--orange-95)',
        },
        layer: 'active',
      },
    ],
  },
]

const INTRO: Loc = {
  ru: 'Текстовые стили проекта по месту применения. Слева — где и зачем, в центре — живой стиль, справа — его анатомия (семейство · размер · начертание · кейс · трекинг). Плашка отмечает стилизацию, навешенную поверх типа (цвет / подсветка).',
  en: 'The project’s text styles by where they are used. Left — where and why, centre — the live style, right — its anatomy (family · size · weight · case · tracking). A tag marks styling layered on top of the type (colour / highlight).',
}

export default function TextStyles() {
  const { lang } = useLang()
  return (
    <section className={styles.root}>
      <h2 className={styles.h}>text styles</h2>
      <p className={styles.intro}>{INTRO[lang]}</p>

      {sections.map((sec) => (
        <div key={sec.title} className={styles.group}>
          <h3 className={styles.groupH}>{sec.title}</h3>
          {sec.items.map((s) => (
            <div key={s.role.en} className={styles.row}>
              <span className={styles.where}>{s.role[lang]}</span>
              <span className={styles.sampleCell}>
                <span style={s.style}>{s.sample[lang]}</span>
                {s.layer && <span className={styles.layer}>{s.layer}</span>}
              </span>
              <span className={styles.anatomy}>{anatomy(s.style)}</span>
            </div>
          ))}
        </div>
      ))}
    </section>
  )
}
