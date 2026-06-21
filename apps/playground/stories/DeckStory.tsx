import type { CSSProperties } from 'react'
import type { CategoryId } from '@release/ui'
import Card from '@/primitives/Card'
import { CARDS, CATEGORIES } from '@/cards'
import styles from './DeckStory.module.css'

const ORDER: CategoryId[] = ['release', 'attack', 'defense', 'protection', 'operation', 'support', 'trigger', 'ai']

export default function DeckStory() {
  const groups = ORDER.map((cat) => ({
    cat,
    label: CATEGORIES[cat].label,
    accent: CATEGORIES[cat].accent,
    cards: CARDS.filter((c) => c.category === cat),
  })).filter((g) => g.cards.length)

  return (
    <div className={styles.root}>
      <p className={styles.hint}>
        Все карты колоды — {CARDS.length} уникальных, с реальными именами (считано с артов).
      </p>

      {groups.map((g) => (
        <section key={g.cat} className={styles.group}>
          <h3 className={styles.h} style={{ '--accent': g.accent } as CSSProperties}>
            {g.label}
            <span className={styles.count}>{g.cards.length}</span>
          </h3>
          <div className={styles.grid}>
            {g.cards.map((card) => (
              <div key={card.id} className={styles.cell}>
                <Card card={card} width="118px" />
                <span className={styles.qty}>×{card.qty}</span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
