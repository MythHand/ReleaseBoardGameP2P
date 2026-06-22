import { useMemo, useState } from 'react'
import Table from '@/table/Table'
import { makeTable } from '@/mocks/table'
import styles from './TableStory.module.css'

// варианты завершения партии — каждый отдельной кнопкой, чтобы все увидеть
const END_VARIANTS = [
  { id: 'win-release', label: 'победа: 3 релиза', winnerId: 'you', condition: 'release' },
  { id: 'win-last', label: 'победа: последний', winnerId: 'you', condition: 'lastStanding' },
  { id: 'opp-release', label: 'соперник: 3 релиза', winnerId: 'p2', condition: 'release' },
]

// состояния стола: выбывание/дисконнект соперника и самого игрока
const VIEW_STATES = [
  { id: 'oppEliminated', label: 'соперник выбыл' },
  { id: 'youEliminated', label: 'ты выбыл' },
  { id: 'oppDisconnect', label: 'дисконнект соперника' },
  { id: 'youDisconnect', label: 'твой дисконнект' },
]

export default function TableStory() {
  const [opps, setOpps] = useState(3)
  const [end, setEnd] = useState(null) // id активного варианта завершения
  const [view, setView] = useState(null) // id активного состояния стола
  const state = useMemo(() => makeTable(opps), [opps])

  const variant = END_VARIANTS.find((v) => v.id === end)
  const toggleEnd = (id) => setEnd((cur) => (cur === id ? null : id))
  const toggleView = (id) => setView((cur) => (cur === id ? null : id))

  return (
    <div className={styles.root}>
      <div className={styles.controls}>
        <span className={styles.label}>оппонентов:</span>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            className={n === opps ? styles.on : styles.btn}
            onClick={() => setOpps(n)}
          >
            {n}
          </button>
        ))}
        <span className={styles.total}>всего игроков: {opps + 1}</span>

        <div className={styles.group}>
          <span className={styles.label}>состояние:</span>
          {VIEW_STATES.map((v) => (
            <button
              key={v.id}
              className={view === v.id ? styles.actionOn : styles.action}
              onClick={() => toggleView(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>

        <div className={styles.group}>
          <span className={styles.label}>завершение:</span>
          {END_VARIANTS.map((v) => (
            <button
              key={v.id}
              className={end === v.id ? styles.actionOn : styles.action}
              onClick={() => toggleEnd(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.stage}>
        <Table
          state={state}
          view={view}
          over={variant ? { winnerId: variant.winnerId, condition: variant.condition } : null}
          onOverContinue={() => setEnd(null)}
        />
      </div>
    </div>
  )
}
