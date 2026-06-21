import TokenPreview from '@/design/TokenPreview'
import TypographyPreview from '@/design/TypographyPreview'
import type { ReactNode } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router'
import styles from './Playground.module.css'
import AnimationsStory from './stories/AnimationsStory'
import ArrowStory from './stories/ArrowStory'
import CardStory from './stories/CardStory'
import ComboStory from './stories/ComboStory'
import DeckStory from './stories/DeckStory'
import HandStory from './stories/HandStory'
import LoaderStory from './stories/LoaderStory'
import StartStory from './stories/StartStory'
import TableStory from './stories/TableStory'

interface Story {
  // Path segment for the story's route (e.g. 'card' → /card).
  id: string
  title: string
  render: () => ReactNode
}

// Реестр «историй». Каждая фаза добавляет сюда изолированные сцены
// (Card, Hand, ReactionWindow, экраны Lobby/GameOver и т.д.) —
// чтобы любой момент можно было открыть напрямую (по URL), не проходя всю игру.
const stories: Story[] = [
  { id: 'design-tokens', title: 'Design Tokens', render: () => <TokenPreview /> },
  { id: 'typography', title: 'Typography', render: () => <TypographyPreview /> },
  { id: 'card', title: 'Card', render: () => <CardStory /> },
  { id: 'deck', title: 'Deck (all)', render: () => <DeckStory /> },
  { id: 'hand', title: 'Hand', render: () => <HandStory /> },
  { id: 'animations', title: 'Animations', render: () => <AnimationsStory /> },
  { id: 'table', title: 'Table', render: () => <TableStory /> },
  { id: 'arrow', title: 'Arrow', render: () => <ArrowStory /> },
  { id: 'combo', title: 'Combo', render: () => <ComboStory /> },
  { id: 'loader', title: 'Loader', render: () => <LoaderStory /> },
  { id: 'start', title: 'Start screen', render: () => <StartStory /> },
  // { id: 'reaction', title: 'Reaction window', render: () => ... },   // Фаза 6
]

export default function Playground() {
  return (
    <div className={styles.wrap}>
      <aside className={styles.sidebar}>
        <div className={styles.title}>playground</div>
        <nav className={styles.nav}>
          {stories.map((s) => (
            <NavLink
              key={s.id}
              to={`/${s.id}`}
              className={({ isActive }) => (isActive ? styles.itemActive : styles.item)}
            >
              {s.title}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className={styles.stage}>
        <Routes>
          <Route index element={<Navigate to={`/${stories[0].id}`} replace />} />
          {stories.map((s) => (
            <Route key={s.id} path={`/${s.id}`} element={s.render()} />
          ))}
          {/* Unknown path → first story */}
          <Route path="*" element={<Navigate to={`/${stories[0].id}`} replace />} />
        </Routes>
      </main>
    </div>
  )
}
