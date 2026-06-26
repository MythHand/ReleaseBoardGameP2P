import { type ReactNode, useState } from 'react'
import { Navigate, NavLink, Route, Routes } from 'react-router'
import TextStyles from '@/design/TextStyles'
import TokenPreview from '@/design/TokenPreview'
import TypographyPreview from '@/design/TypographyPreview'
import AnimationsStory from '../stories/AnimationsStory'
import ArrowStory from '../stories/ArrowStory'
import GameSettingsBlock from '../stories/blocks/GameSettingsBlock'
import RulesBlock from '../stories/blocks/RulesBlock'
import CardStory from '../stories/CardStory'
import ComboStory from '../stories/ComboStory'
import HandStory from '../stories/HandStory'
import AvatarsKit from '../stories/kit/AvatarsKit'
import BadgesKit from '../stories/kit/BadgesKit'
import ButtonsKit from '../stories/kit/ButtonsKit'
import InputsKit from '../stories/kit/InputsKit'
import ModalsKit from '../stories/kit/ModalsKit'
import SlidersKit from '../stories/kit/SlidersKit'
import TogglesKit from '../stories/kit/TogglesKit'
import LoaderStory from '../stories/LoaderStory'
import LobbyStory from '../stories/LobbyStory'
import StartStory from '../stories/StartStory'
import StatsStory from '../stories/StatsStory'
import TableStory from '../stories/TableStory'
import { type Lang, LangContext } from './lang'
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
      { id: 'text-styles', title: 'Text styles', render: () => <TextStyles /> },
    ],
  },
  {
    title: 'Карты',
    items: [
      { id: 'card', title: 'Card', render: () => <CardStory /> },
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
  {
    // Каталог дизайн-элементов — пока заглушки, наполняем по мере сборки.
    title: 'UI KIT',
    items: [
      { id: 'kit-buttons', title: 'Buttons', render: () => <ButtonsKit /> },
      { id: 'kit-inputs', title: 'Inputs', render: () => <InputsKit /> },
      { id: 'kit-toggles', title: 'Toggles', render: () => <TogglesKit /> },
      { id: 'kit-sliders', title: 'Sliders', render: () => <SlidersKit /> },
      { id: 'kit-badges', title: 'Badges', render: () => <BadgesKit /> },
      { id: 'kit-avatars', title: 'Avatars', render: () => <AvatarsKit /> },
      { id: 'kit-modals', title: 'Modals', render: () => <ModalsKit /> },
    ],
  },
  {
    // Готовые композитные куски — собранные из примитивов блоки, как на экранах.
    title: 'Блоки',
    items: [
      {
        id: 'block-game-settings',
        title: 'Game settings',
        render: () => <GameSettingsBlock />,
      },
      { id: 'block-rules', title: 'Rules', render: () => <RulesBlock /> },
    ],
  },
]

const allStories = groups.flatMap((g) => g.items)
const firstId = allStories[0]?.id ?? ''

const LANGS: Lang[] = ['ru', 'en']

export default function Playground() {
  const [lang, setLang] = useState<Lang>('ru')

  return (
    <LangContext.Provider value={{ lang, setLang }}>
      <div className={styles.wrap}>
        <aside className={styles.sidebar}>
          <div className={styles.langRow}>
            <div className={styles.langSwitch}>
              <span
                className={styles.langThumb}
                style={{ transform: lang === 'en' ? 'translateX(100%)' : 'translateX(0)' }}
                aria-hidden="true"
              />
              {LANGS.map((l) => (
                <button
                  key={l}
                  type="button"
                  className={lang === l ? styles.langOn : styles.langOff}
                  onClick={() => setLang(l)}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
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
    </LangContext.Provider>
  )
}
