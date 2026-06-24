import { useState } from 'react'
import styles from './Rules.module.css'

// Текст правил по docs/rules-board-game.md (сжато и структурно).
// Вынесен в данные, чтобы работал поиск; формулировки — без изменений.
export interface RulesSection {
  title: string
  note?: string
  body: string[]
}

const META = ['2–6 игроков', '15–45 минут', '104 карты + 21 событие']

const SECTIONS: RulesSection[] = [
  {
    title: 'Цель',
    body: [
      'Первым собрать три разные карты Release (Frontend, Backend, Database) в своей зоне релиза, отразив все атаки противников, — или остаться последним игроком в партии.',
    ],
  },
  {
    title: 'Подготовка',
    body: [
      'Две колоды по цвету рубашки: зелёная — основная, фиолетовая — события.',
      'Каждому: 1 карта Debugger + 4 случайные (всего 5 на руке).',
      'Карты AI и Error 503 на старте недопустимы — замените их на руке.',
      'Перетасуйте и положите обе колоды рубашкой вверх.',
    ],
  },
  {
    title: 'Ход игрока',
    note: 'действие / добор / действие / конец хода',
    body: [
      'До и после добора можно сыграть любое число карт (в том числе 0).',
      'Добор — ровно одна карта сверху основной колоды (обязателен).',
      'Конец хода обозначается словом «PUSH», ход идёт по часовой стрелке.',
    ],
  },
  {
    title: 'Релиз карт',
    body: [
      'Зона релиза — место для карт Release; по одной каждого типа.',
      'За ход — только один релиз; при выкладывании сбрасывается 1 карта с руки.',
      'На свежий релиз соперники могут мгновенно ответить атакой со значком молнии (Bug, Out of Memory, Legacy Code, Security Bug).',
      'Code Review играется вместе с Release и делает его неуязвимым к этим атакам (даже с Sudo). К уже выложенному релизу не применяется.',
    ],
  },
  {
    title: 'Атака и оборона',
    body: [
      'Атакующие карты (молния) играются мгновенно — на релиз или по руке.',
      'Оборона: Cancel (Hotfix, Rubber Ducky, PR Approved, Rollback) и Unicorn (Not a Bug, Works on my Machine).',
      'Sudo усиливает карты с эффектом sudo; Cancel против усиления не работает, Unicorn — работает.',
      'DDoS — единственная атака против защищённого релиза и Monitoring.',
    ],
  },
  {
    title: 'Карты-триггеры',
    body: [
      'AI: при доборе покажите всем и разыграйте случайный эффект из колоды событий.',
      'Error 503: при доборе покажите всем и нейтрализуйте (Debugger, Monitoring или жертва релиза) — иначе выбываете.',
    ],
  },
  {
    title: 'Конец игры',
    body: [
      'Партия заканчивается, когда у игрока в зоне релиза одновременно три разные карты Release — либо когда остаётся единственный игрок.',
    ],
  },
]

const FOOT =
  'Режимы (лимит руки, Fast Release, условие релиза, кол-во AI) выбираются перед партией — подробности появятся в окне создания игры.'

export interface RulesProps {
  meta?: string[]
  sections?: RulesSection[]
  foot?: string
  searchPlaceholder?: string
  notFoundText?: string
}

// Presentational + i18n-agnostic: copy is passed in as props (in-game callers
// use the bundled RU defaults; the frontend modal injects translated strings).
export default function Rules({
  meta = META,
  sections = SECTIONS,
  foot = FOOT,
  searchPlaceholder = 'поиск по правилам…',
  notFoundText = 'Ничего не найдено',
}: RulesProps = {}) {
  const [q, setQ] = useState('')
  const query = q.trim().toLowerCase()

  const matches = (s: RulesSection) => {
    if (!query) return true
    const hay = [s.title, s.note, ...s.body].filter(Boolean).join(' ').toLowerCase()
    return hay.includes(query)
  }
  const shown = sections.filter(matches)

  return (
    <div className={styles.rules}>
      <input
        className={styles.search}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={searchPlaceholder}
      />

      {!query && (
        <ul className={styles.meta}>
          {meta.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}

      {shown.map((s) => (
        <section key={s.title} className={styles.sec}>
          <h4 className={styles.h}>{s.title}</h4>
          {s.note && <p className={styles.muted}>{s.note}</p>}
          {s.body.length === 1 ? (
            <p>{s.body[0]}</p>
          ) : (
            <ul className={styles.list}>
              {s.body.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </section>
      ))}

      {shown.length === 0 && <p className={styles.empty}>{notFoundText}</p>}

      {!query && <p className={styles.foot}>{foot}</p>}
    </div>
  )
}
