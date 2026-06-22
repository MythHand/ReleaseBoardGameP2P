import { useMemo, useState } from 'react'
import { makeTable } from '@/mocks/table'
import Table from '@/table/Table'
import styles from './TableStory.module.css'

type GameOverCondition = 'release' | 'lastStanding'
type ViewState = 'oppEliminated' | 'youEliminated' | 'oppDisconnect' | 'youDisconnect'

interface EndVariant {
  id: string
  label: string
  winnerId: string
  condition: GameOverCondition
}
interface ViewItem {
  id: ViewState
  label: string
}

// варианты завершения партии — каждый отдельной кнопкой, чтобы все увидеть
const END_VARIANTS: EndVariant[] = [
  { id: 'win-release', label: 'победа: 3 релиза', winnerId: 'you', condition: 'release' },
  { id: 'win-last', label: 'победа: последний', winnerId: 'you', condition: 'lastStanding' },
  { id: 'opp-release', label: 'соперник: 3 релиза', winnerId: 'p2', condition: 'release' },
]

// состояния стола: выбывание/дисконнект соперника и самого игрока
const VIEW_STATES: ViewItem[] = [
  { id: 'oppEliminated', label: 'соперник выбыл' },
  { id: 'youEliminated', label: 'ты выбыл' },
  { id: 'oppDisconnect', label: 'дисконнект соперника' },
  { id: 'youDisconnect', label: 'твой дисконнект' },
]

export default function TableStory() {
  const [opps, setOpps] = useState(3)
  const [end, setEnd] = useState<string | null>(null)
  const [view, setView] = useState<ViewState | null>(null)
  const state = useMemo(() => makeTable(opps), [opps])

  const variant = END_VARIANTS.find((v) => v.id === end)
  const toggleEnd = (id: string) => setEnd((cur) => (cur === id ? null : id))
  const toggleView = (id: ViewState) => setView((cur) => (cur === id ? null : id))

  return (
    <div className={styles.root}>
      <div className={styles.controls}>
        <span className={styles.label}>оппонентов:</span>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            type="button"
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
              type="button"
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
              type="button"
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
