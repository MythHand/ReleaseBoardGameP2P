import type { CSSProperties } from 'react'
import styles from './MoveHistory.module.css'

export interface HistoryEntry {
  id: number
  who: string
  kind?: string
  card?: string
  cat?: string
  text?: string
  children?: HistoryEntry[]
}

interface RowProps {
  e: HistoryEntry
  nested?: boolean
}

function Row({ e, nested = false }: RowProps) {
  const accent = e.cat ? `var(--cat-${e.cat})` : undefined
  const label = e.card ?? e.kind ?? e.text
  return (
    <>
      <div
        className={`${styles.row} ${nested ? styles.nested : ''}`}
        data-accented={accent ? 'true' : 'false'}
        style={accent ? ({ '--accent': accent } as CSSProperties) : undefined}
      >
        <span className={e.card ? styles.card : styles.action}>{label}</span>
        <span className={styles.who}>{e.who}</span>
      </div>
      {e.children?.map((c) => (
        <Row key={c.id} e={c} nested />
      ))}
    </>
  )
}

interface MoveHistoryProps {
  entries?: HistoryEntry[]
}

// История: слева — название карты/действия, справа — кто сделал;
// атаки/защиты по релизу вложены; слева фон-градиент из цвета типа карты.
export default function MoveHistory({ entries = [] }: MoveHistoryProps) {
  return (
    <div className={styles.box}>
      <div className={styles.title}>история ходов</div>
      <div className={styles.list}>
        {entries.map((e) => (
          <Row key={e.id} e={e} />
        ))}
      </div>
    </div>
  )
}
