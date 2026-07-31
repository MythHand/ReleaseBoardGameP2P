import { useState } from 'react'
import CherryPick from './CherryPick'
import styles from './GitCards.module.css'
import Rebase from './Rebase'

// One page for the git-card interactions instead of a page per card. The
// technical bar carries a card selector on the LEFT; each card renders it first
// and lays out its own technical controls to the right. Adding another git card
// is one entry here + one component — no new page.
type GitCard = 'cherry' | 'rebase'

const CARDS: { id: GitCard; label: string }[] = [
  { id: 'cherry', label: 'cherry-pick' },
  { id: 'rebase', label: 'rebase' },
]

export default function GitCardsStory() {
  const [card, setCard] = useState<GitCard>('cherry')

  // the shared selector element, handed to the active card so it sits at the
  // start of that card's own control bar (one row: selector | card controls)
  const selector = (
    <div className={styles.selector}>
      {CARDS.map((c) => (
        <button
          key={c.id}
          type="button"
          className={`${styles.selBtn} ${card === c.id ? styles.selOn : ''}`}
          onClick={() => setCard(c.id)}
        >
          {c.label}
        </button>
      ))}
    </div>
  )

  return card === 'cherry' ? <CherryPick selector={selector} /> : <Rebase selector={selector} />
}
