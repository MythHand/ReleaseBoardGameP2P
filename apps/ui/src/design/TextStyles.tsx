import type { CSSProperties } from 'react'
import styles from './TypographyPreview.module.css'

// Текстовые стили по всему проекту (реальные значения из компонентов), сгруппированы
// по областям. Технический CSS под каждым образцом выводится из того же объекта style,
// что и сам образец — значения всегда совпадают. var(--font-text) = Fira Mono,
// var(--font-mono) = JetBrains Mono, var(--font-heading) = Onest.
const heading: CSSProperties = { fontFamily: 'var(--font-heading)', color: '#fff' }
const text: CSSProperties = { fontFamily: 'var(--font-text)', lineHeight: 1.5 }
const mono: CSSProperties = { fontFamily: 'var(--font-mono)' }

interface Entry {
  role: string
  sample: string
  style: CSSProperties
}

const UNITLESS = new Set(['font-weight', 'line-height', 'opacity'])

// CSSProperties → читаемый CSS (camelCase → kebab, числа → px кроме безразмерных).
const cssText = (style: CSSProperties): string =>
  Object.entries(style)
    .map(([k, v]) => {
      const prop = k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
      const val = typeof v === 'number' && !UNITLESS.has(prop) ? `${v}px` : v
      return `${prop}: ${val};`
    })
    .join('\n')

const sections: { title: string; items: Entry[] }[] = [
  {
    title: 'Заголовки',
    items: [
      {
        role: 'Экран (Stats / Lobby)',
        sample: 'Статистика партии',
        style: { ...heading, fontSize: 32, letterSpacing: '0.04em' },
      },
      {
        role: 'Модалка',
        sample: 'Создать игру',
        style: { ...heading, fontSize: 20, textTransform: 'uppercase', letterSpacing: '0.06em' },
      },
      {
        role: 'Блок / подсекция',
        sample: 'Параметры лобби',
        style: { ...heading, fontSize: 16, textTransform: 'uppercase', letterSpacing: '0.04em' },
      },
    ],
  },
  {
    title: 'Подписи и лейблы',
    items: [
      {
        role: 'Лейбл поля (Input)',
        sample: 'Ваш никнейм',
        style: {
          ...mono,
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.16em',
          color: 'rgb(255 255 255 / 70%)',
        },
      },
      {
        role: 'Лейбл секции (Stats / Lobby)',
        sample: 'Победы',
        style: {
          ...mono,
          fontSize: 12,
          textTransform: 'uppercase',
          letterSpacing: '0.14em',
          color: 'rgb(255 255 255 / 70%)',
        },
      },
      {
        role: 'Тег (Start)',
        sample: 'Открытый P2P-проект',
        style: {
          ...mono,
          fontSize: 12,
          textTransform: 'uppercase',
          letterSpacing: '0.16em',
          color: 'var(--cat-release)',
        },
      },
      {
        role: 'Бейдж (Badge)',
        sample: 'хост',
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
    title: 'Значения и ввод',
    items: [
      {
        role: 'Поле ввода (Input)',
        sample: 'DIMBO',
        style: {
          ...mono,
          fontSize: 18,
          textTransform: 'uppercase',
          letterSpacing: '0.14em',
          color: '#fff',
        },
      },
      {
        role: 'Код игры (Lobby)',
        sample: '4F2A-9K',
        style: { ...mono, fontSize: 26, letterSpacing: '0.2em', color: '#fff' },
      },
      {
        role: 'Крупное число (Stats)',
        sample: '12',
        style: { ...heading, fontSize: 40, lineHeight: 1 },
      },
    ],
  },
  {
    title: 'Кнопки',
    items: [
      {
        role: 'Primary (брекеты)',
        sample: '[ создать игру ]',
        style: {
          ...mono,
          fontSize: 17,
          textTransform: 'uppercase',
          letterSpacing: '0.18em',
          color: '#fff',
        },
      },
      {
        role: 'Tech / Danger',
        sample: 'отмена',
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
    title: 'Стол / HUD',
    items: [
      {
        role: 'Имя игрока (Seat)',
        sample: 'dimbo',
        style: { ...text, fontSize: 13, letterSpacing: '0.03em' },
      },
      {
        role: 'История хода (MoveHistory)',
        sample: 'dimbo выложил Frontend',
        style: { ...text, fontSize: 12, lineHeight: 1.3 },
      },
      {
        role: 'Метка / счётчик',
        sample: 'Раунд 2',
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
    title: 'Правила',
    items: [
      {
        role: 'Заголовок секции',
        sample: 'Описание карт',
        style: { ...heading, fontSize: 19, textTransform: 'uppercase', letterSpacing: '0.05em' },
      },
      {
        role: 'Подзаголовок',
        sample: 'Атакующие карты',
        style: { ...heading, fontSize: 15, textTransform: 'uppercase', letterSpacing: '0.08em' },
      },
      {
        role: 'Тело',
        sample:
          'Атакующие карты разыгрываются мгновенно — на свежий релиз противника или против руки других игроков.',
        style: { ...text, fontSize: 14, lineHeight: 1.62, color: 'rgb(255 255 255 / 86%)' },
      },
      {
        role: 'Имя карты',
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
        sample: 'Разыгрывается одновременно с картой Release; делает релиз неуязвимым к атакам.',
        style: { ...text, fontSize: 14, lineHeight: 1.62, color: 'rgb(255 255 255 / 78%)' },
      },
      {
        role: 'Sudo-метка',
        sample: 'sudo Git Rebase',
        style: {
          ...text,
          fontSize: 14,
          padding: '1px 6px',
          color: 'rgb(255 255 255 / 90%)',
          background: 'rgb(255 206 70 / 20%)',
        },
      },
      {
        role: 'Подсветка поиска — совпадение',
        sample: 'release',
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
        role: 'Подсветка поиска — активное',
        sample: 'release',
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
  return (
    <section className={styles.root}>
      <h2 className={styles.h}>стили текста</h2>
      {sections.map((sec) => (
        <div key={sec.title}>
          <h3 className={styles.subH}>{sec.title}</h3>
          <div className={styles.list}>
            {sec.items.map((s) => (
              <article key={s.role} className={styles.item}>
                <header className={styles.meta}>
                  <span className={styles.role}>{s.role}</span>
                </header>
                <div className={styles.sampleRow}>
                  <span style={s.style}>{s.sample}</span>
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
