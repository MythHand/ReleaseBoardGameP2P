import { useState } from 'react'
import TokenPreview from '@/design/TokenPreview.jsx'
import TypographyPreview from '@/design/TypographyPreview.jsx'
import CardStory from './stories/CardStory.jsx'
import HandStory from './stories/HandStory.jsx'
import AnimationsStory from './stories/AnimationsStory.jsx'
import TableStory from './stories/TableStory.jsx'
import ArrowStory from './stories/ArrowStory.jsx'
import ComboStory from './stories/ComboStory.jsx'
import LoaderStory from './stories/LoaderStory.jsx'
import DeckStory from './stories/DeckStory.jsx'
import StartStory from './stories/StartStory.jsx'
import LobbyStory from './stories/LobbyStory.jsx'
import StatsStory from './stories/StatsStory.jsx'
import styles from './Playground.module.css'

// Реестр «историй», сгруппированный по смыслу. Каждая группа — раздел навигации;
// «Экраны» — слепки целых экранов, остальные — изолированные сущности/элементы.
const groups = [
  {
    title: 'Экраны',
    items: [
      { id: 'start', title: 'Start screen', render: () => <StartStory /> },
      { id: 'loader', title: 'Loader', render: () => <LoaderStory /> },
      { id: 'lobby', title: 'Lobby', render: () => <LobbyStory /> },
      { id: 'table', title: 'Table', render: () => <TableStory /> },
      { id: 'stats', title: 'Stats', render: () => <StatsStory /> },
    ],
  },
  {
    title: 'Основа',
    items: [
      { id: 'design-tokens', title: 'Design Tokens', render: () => <TokenPreview /> },
      { id: 'typography', title: 'Typography', render: () => <TypographyPreview /> },
    ],
  },
  {
    title: 'Карты',
    items: [
      { id: 'card', title: 'Card', render: () => <CardStory /> },
      { id: 'deck', title: 'Deck (all)', render: () => <DeckStory /> },
      { id: 'hand', title: 'Hand', render: () => <HandStory /> },
    ],
  },
  {
    title: 'Интерактив',
    items: [
      { id: 'animations', title: 'Animations', render: () => <AnimationsStory /> },
      { id: 'arrow', title: 'Arrow', render: () => <ArrowStory /> },
      { id: 'combo', title: 'Combo', render: () => <ComboStory /> },
    ],
  },
  // { title: 'Фаза 6', items: [{ id: 'reaction', title: 'Reaction window', ... }] },
]

const allStories = groups.flatMap((g) => g.items)

export default function Playground() {
  const [active, setActive] = useState(allStories[0].id)
  const story = allStories.find((s) => s.id === active)

  return (
    <div className={styles.wrap}>
      <aside className={styles.sidebar}>
        <div className={styles.title}>playground</div>
        <nav className={styles.nav}>
          {groups.map((g) => (
            <div key={g.title} className={styles.group}>
              <div className={styles.groupTitle}>{g.title}</div>
              {g.items.map((s) => (
                <button
                  key={s.id}
                  className={s.id === active ? styles.itemActive : styles.item}
                  onClick={() => setActive(s.id)}
                >
                  {s.title}
                </button>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <main className={styles.stage}>{story?.render()}</main>
    </div>
  )
}
