import { type ReactNode, useState } from 'react'
import { Navigate, NavLink, Route, Routes } from 'react-router'
import TextStyles from '@/design/TextStyles'
import TokenPreview from '@/design/TokenPreview'
import TypographyPreview from '@/design/TypographyPreview'
import AnimationAuditStory from '../stories/AnimationAuditStory'
import AnimationsStory from '../stories/AnimationsStory'
import ArrowStory from '../stories/ArrowStory'
import GameOverBlock from '../stories/blocks/GameOverBlock'
import GameSettingsBlock from '../stories/blocks/GameSettingsBlock'
import LangSwitcherBlock from '../stories/blocks/LangSwitcherBlock'
import LobbyCodeBlock from '../stories/blocks/LobbyCodeBlock'
import MoveHistoryBlock from '../stories/blocks/MoveHistoryBlock'
import ParticipantsBlock from '../stories/blocks/ParticipantsBlock'
import PlayerSlotBlock from '../stories/blocks/PlayerSlotBlock'
import ReconnectBlock from '../stories/blocks/ReconnectBlock'
import ReleaseZoneBlock from '../stories/blocks/ReleaseZoneBlock'
import RulesBlock from '../stories/blocks/RulesBlock'
import SeatBlock from '../stories/blocks/SeatBlock'
import CardStory from '../stories/CardStory'
import ComboStory from '../stories/ComboStory'
import HandStory from '../stories/HandStory'
import InviteStory from '../stories/InviteStory'
import CardPlayStory from '../stories/interactive/CardPlayStory'
import CardToHandStory from '../stories/interactive/CardToHandStory'
import DealCardsStory from '../stories/interactive/DealCardsStory'
import DeckAnimationsStory from '../stories/interactive/DeckAnimationsStory'
import DrawCardStory from '../stories/interactive/DrawCardStory'
import PickOpponentCardStory from '../stories/interactive/PickOpponentCardStory'
import AvatarsKit from '../stories/kit/AvatarsKit'
import BadgesKit from '../stories/kit/BadgesKit'
import ButtonsKit from '../stories/kit/ButtonsKit'
import DrawerKit from '../stories/kit/DrawerKit'
import DropdownKit from '../stories/kit/DropdownKit'
import EdgeGlowKit from '../stories/kit/EdgeGlowKit'
import InputsKit from '../stories/kit/InputsKit'
import MenuKit from '../stories/kit/MenuKit'
import ModalsKit from '../stories/kit/ModalsKit'
import ModeSelectKit from '../stories/kit/ModeSelectKit'
import OverlayKit from '../stories/kit/OverlayKit'
import PilesKit from '../stories/kit/PilesKit'
import SlidersKit from '../stories/kit/SlidersKit'
import SpinnerKit from '../stories/kit/SpinnerKit'
import TabRailKit from '../stories/kit/TabRailKit'
import TogglesKit from '../stories/kit/TogglesKit'
import LoaderStory from '../stories/LoaderStory'
import LobbyStory from '../stories/LobbyStory'
import StartStory from '../stories/StartStory'
import StatsStory from '../stories/StatsStory'
import TableStory from '../stories/TableStory'
import WelcomeStory from '../stories/WelcomeStory'
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
    // приветственная вкладка — первой и без заголовка группы
    title: '',
    items: [{ id: 'welcome', title: 'Welcome', render: () => <WelcomeStory /> }],
  },
  {
    title: 'Экраны',
    items: [
      { id: 'loader', title: 'Loader', render: () => <LoaderStory /> },
      { id: 'start', title: 'Start screen', render: () => <StartStory /> },
      { id: 'invite', title: 'Invite', render: () => <InviteStory /> },
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
      {
        id: 'interaction-audit',
        title: 'Interaction audit',
        render: () => <AnimationAuditStory />,
      },
      { id: 'animations', title: 'Animations', render: () => <AnimationsStory /> },
      { id: 'arrow', title: 'Arrow', render: () => <ArrowStory /> },
      { id: 'combo', title: 'Combo', render: () => <ComboStory /> },
      {
        id: 'pick-opponent-card',
        title: 'Random opponent card',
        render: () => <PickOpponentCardStory />,
      },
      { id: 'card-to-hand', title: 'Card to Hand', render: () => <CardToHandStory /> },
      { id: 'card-play', title: 'Card play', render: () => <CardPlayStory /> },
      { id: 'draw-card', title: 'Draw card', render: () => <DrawCardStory /> },
      { id: 'deck-animations', title: 'Deck animations', render: () => <DeckAnimationsStory /> },
      { id: 'deal-cards', title: 'Deal cards', render: () => <DealCardsStory /> },
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
      { id: 'kit-menu', title: 'Menu', render: () => <MenuKit /> },
      { id: 'kit-dropdown', title: 'Dropdown', render: () => <DropdownKit /> },
      { id: 'kit-mode-select', title: 'Mode select', render: () => <ModeSelectKit /> },
      { id: 'kit-piles', title: 'Piles', render: () => <PilesKit /> },
      { id: 'kit-modals', title: 'Modal', render: () => <ModalsKit /> },
      { id: 'kit-drawer', title: 'Drawer', render: () => <DrawerKit /> },
      { id: 'kit-tab-rail', title: 'Tab rail', render: () => <TabRailKit /> },
      { id: 'kit-overlay', title: 'Overlay', render: () => <OverlayKit /> },
      { id: 'kit-edge-glow', title: 'Edge glow', render: () => <EdgeGlowKit /> },
      { id: 'kit-spinner', title: 'Spinner', render: () => <SpinnerKit /> },
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
      { id: 'block-seat', title: 'Seat', render: () => <SeatBlock /> },
      { id: 'block-release-zone', title: 'Release zone', render: () => <ReleaseZoneBlock /> },
      { id: 'block-participants', title: 'Participants', render: () => <ParticipantsBlock /> },
      { id: 'block-player-slot', title: 'Player slot', render: () => <PlayerSlotBlock /> },
      { id: 'block-lobby-code', title: 'Lobby code', render: () => <LobbyCodeBlock /> },
      { id: 'block-lang-switcher', title: 'Lang switcher', render: () => <LangSwitcherBlock /> },
      { id: 'block-move-history', title: 'Move history', render: () => <MoveHistoryBlock /> },
      { id: 'block-reconnect', title: 'Reconnect', render: () => <ReconnectBlock /> },
      { id: 'block-game-over', title: 'Game over', render: () => <GameOverBlock /> },
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
          <div className={styles.head}>
            <div className={styles.title}>Playground</div>
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
          </div>
          <nav className={styles.nav}>
            {groups.map((g) => (
              <div key={g.title || g.items[0]?.id} className={styles.group}>
                {g.title && <div className={styles.groupTitle}>{g.title}</div>}
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
            {/* словарь анимаций — суб-роут на конкретный пресет */}
            <Route path="/animations/:preset" element={<AnimationsStory />} />
            {/* Unknown path → first story */}
            <Route path="*" element={<Navigate to={`/${firstId}`} replace />} />
          </Routes>
        </main>
      </div>
    </LangContext.Provider>
  )
}
