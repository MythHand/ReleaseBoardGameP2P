import type { ReactNode } from 'react'
import { Navigate, NavLink, Route, Routes } from 'react-router'
import TokenPreview from '@/design/TokenPreview'
import TypographyPreview from '@/design/TypographyPreview'
import AnimationsStory from '../stories/AnimationsStory'
import ArrowStory from '../stories/ArrowStory'
import CardStory from '../stories/CardStory'
import ComboStory from '../stories/ComboStory'
import DeckStory from '../stories/DeckStory'
import HandStory from '../stories/HandStory'
import LoaderStory from '../stories/LoaderStory'
import LobbyStory from '../stories/LobbyStory'
import StartStory from '../stories/StartStory'
import StatsStory from '../stories/StatsStory'
import TableStory from '../stories/TableStory'
import styles from './Playground.module.css'

interface Story {
  // Path segment for the story's route (e.g. 'card' → /card).
  id: string
  title: string
  render: () => ReactNode
}
interface Group {
  title: string
  items: Story[]
}

// Реестр «историй», сгруппированный по смыслу. Каждая группа — раздел навигации;
// «Экраны» — слепки целых экранов, остальные — изолированные сущности/элементы.
const groups: Group[] = [
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
]

const allStories = groups.flatMap((g) => g.items)
const firstId = allStories[0]?.id ?? ''

export default function Playground() {
  return (
    <div className={styles.wrap}>
      <aside className={styles.sidebar}>
        <div className={styles.title}>playground</div>
        <nav className={styles.nav}>
          {groups.map((g) => (
            <div key={g.title} className={styles.group}>
              <div className={styles.groupTitle}>{g.title}</div>
              {g.items.map((s) => (
                <NavLink
                  key={s.id}
                  to={`/${s.id}`}
                  className={({ isActive }) => (isActive ? styles.itemActive : styles.item)}
                >
                  {s.title}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <main className={styles.stage}>
        <Routes>
          <Route index element={<Navigate to={`/${firstId}`} replace />} />
          {allStories.map((s) => (
            <Route key={s.id} path={`/${s.id}`} element={s.render()} />
          ))}
          {/* Unknown path → first story */}
          <Route path="*" element={<Navigate to={`/${firstId}`} replace />} />
        </Routes>
      </main>
    </div>
  )
}
