import { useState } from 'react'
import { TechSwitch } from '../../controls/TechControls'
import CherryPick from './CherryPick'
import Rebase from './Rebase'
import SystemUpgrade from './SystemUpgrade'

// One page for the git-card interactions instead of a page per card. The
// technical bar carries a card selector on the LEFT; each card renders it first
// and lays out its own technical controls to the right. Adding another git card
// is one entry here + one component — no new page.
type GitCard = 'cherry' | 'rebase' | 'system-upgrade'

const CARDS: { id: GitCard; label: string }[] = [
  { id: 'cherry', label: 'cherry-pick' },
  { id: 'rebase', label: 'rebase' },
  { id: 'system-upgrade', label: 'system upgrade' },
]

export default function GitCardsStory() {
  const [card, setCard] = useState<GitCard>('cherry')

  // the shared selector element, handed to the active card so it sits at the
  // START of that card's own control bar — it is navigation between the git
  // cards, a level above the scene's own controls, so it sits left of them all,
  // restart included.
  const selector = (
    <TechSwitch
      options={CARDS.map((c) => ({ value: c.id, label: c.label }))}
      value={card}
      onChange={setCard}
    />
  )

  if (card === 'cherry') return <CherryPick selector={selector} />
  if (card === 'rebase') return <Rebase selector={selector} />
  return <SystemUpgrade selector={selector} />
}
