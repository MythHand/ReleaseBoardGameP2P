import { useState } from 'react'
import styles from './Rules.module.css'

// Текст правил вынесен в данные (для поиска); копия передаётся пропсом, чтобы
// библиотека оставалась i18n-agnostic — формулировки задаёт приложение.
export interface RulesSection {
  title: string
  note?: string
  body: string[]
}

export interface RulesCopy {
  searchPlaceholder: string
  empty: string
  meta: string[]
  sections: RulesSection[]
  foot: string
}

export default function Rules({ copy }: { copy: RulesCopy }) {
  const [q, setQ] = useState('')
  const query = q.trim().toLowerCase()

  const matches = (s: RulesSection) => {
    if (!query) return true
    const hay = [s.title, s.note, ...s.body].filter(Boolean).join(' ').toLowerCase()
    return hay.includes(query)
  }
  const shown = copy.sections.filter(matches)

  return (
    <div className={styles.rules}>
      <input
        className={styles.search}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={copy.searchPlaceholder}
      />

      {!query && (
        <ul className={styles.meta}>
          {copy.meta.map((m) => (
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

      {shown.length === 0 && <p className={styles.empty}>{copy.empty}</p>}

      {!query && <p className={styles.foot}>{copy.foot}</p>}
    </div>
  )
}
