import { useMemo, useState } from 'react'
import Table from '@/table/Table'
import { makeTable } from '@/mocks/table'
import styles from './TableStory.module.css'

export default function TableStory() {
  const [opps, setOpps] = useState(3)
  const state = useMemo(() => makeTable(opps), [opps])

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
      </div>
      <div className={styles.stage}>
        <Table state={state} />
      </div>
    </div>
  )
}
