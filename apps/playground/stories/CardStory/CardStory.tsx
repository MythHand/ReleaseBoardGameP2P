import type { CategoryId } from '@release/ui'
import type React from 'react'
import { type CSSProperties, useState } from 'react'
import { CARDS, CATEGORIES } from '@/cards'
import Card from '@/primitives/Card'
import styles from './CardStory.module.css'

type CardState = 'idle' | 'playable' | 'selected' | 'disabled'
const STATES: CardState[] = ['idle', 'playable', 'selected', 'disabled']

// порядок типов для сегментации
const ORDER: CategoryId[] = [
  'release',
  'attack',
  'defense',
  'protection',
  'operation',
  'support',
  'trigger',
  'ai',
]

export default function CardStory() {
  const [state, setState] = useState<CardState>('idle')
  const [tilt, setTilt] = useState(true)

  const groups = ORDER.map((cat) => ({
    cat,
    label: CATEGORIES[cat].label,
    accent: CATEGORIES[cat].accent,
    cards: CARDS.filter((c) => c.category === cat),
  })).filter((g) => g.cards.length)

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
        Наведи курсор на карту — подъём + наклон (чтение). Карты сегментированы по типам.
      </p>

      {groups.map((g) => (
        <section key={g.cat} className={styles.group}>
          <h3 className={styles.divider} style={{ '--accent': g.accent } as CSSProperties}>
            <span className={styles.dividerLabel}>{g.label}</span>
            <span className={styles.dividerLine} />
            <span className={styles.count}>{g.cards.length}</span>
          </h3>
          <div className={styles.grid}>
            {g.cards.map((card) => (
              <div key={card.id} className={styles.cell}>
                <Card card={card} state={state} tilt={tilt} />
                <div className={styles.cap}>
                  {card.name} · {card.category}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
