import { CARDS } from '@/cards'
import Card from '@/primitives/Card'
import type React from 'react'
import { useState } from 'react'
import styles from './CardStory.module.css'

type CardState = 'idle' | 'playable' | 'selected' | 'disabled'
const STATES: CardState[] = ['idle', 'playable', 'selected', 'disabled']

export default function CardStory() {
  const [state, setState] = useState<CardState>('idle')
  const [tilt, setTilt] = useState(true)

  return (
    <div className={styles.root}>
      <div className={styles.controls}>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={tilt}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTilt(e.target.checked)}
          />
          parallax-наклон
        </label>
        <div className={styles.states}>
          {STATES.map((s) => (
            <button
              type="button"
              key={s}
              className={s === state ? styles.on : styles.btn}
              onClick={() => setState(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <p className={styles.hint}>
        Наведи курсор на карту — подъём + наклон (чтение). По одной карте на категорию.
      </p>

      <div className={styles.grid}>
        {CARDS.map((card) => (
          <div key={card.id} className={styles.cell}>
            <Card card={card} state={state} tilt={tilt} />
            <div className={styles.cap}>
              {card.name} · {card.category}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
