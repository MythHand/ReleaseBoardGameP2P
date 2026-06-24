import { useTranslation } from '@release/translation'
import { useState } from 'react'
import styles from '@/screens/Start/Rules.module.css'

interface Section {
  title: string
  note?: string
  body: string[]
}

export default function Rules() {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const query = q.trim().toLowerCase()

  const meta = t('rules.meta', { returnObjects: true }) as string[]
  const sections = t('rules.sections', { returnObjects: true }) as Section[]

  const matches = (s: Section) => {
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
        placeholder={t('rules.searchPlaceholder')}
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

      {shown.length === 0 && <p className={styles.empty}>{t('rules.notFound')}</p>}

      {!query && <p className={styles.foot}>{t('rules.foot')}</p>}
    </div>
  )
}
