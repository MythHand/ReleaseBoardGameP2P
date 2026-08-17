import { type ReactNode, useState } from 'react'
import { Navigate, NavLink, Route, Routes } from 'react-router'
import { CardLangProvider } from '@/cards/cardLang'
import AnimationAuditStory from '../stories/AnimationAuditStory'
import AnimationsStory from '../stories/AnimationsStory'
import ArrowStory from '../stories/ArrowStory'
import ChatBlock from '../stories/blocks/ChatBlock'
import ConfirmActionBlock from '../stories/blocks/ConfirmActionBlock'
import GameOverBlock from '../stories/blocks/GameOverBlock'
import GameSettingsBlock from '../stories/blocks/GameSettingsBlock'
import LangSwitcherBlock from '../stories/blocks/LangSwitcherBlock'
import LobbyCodeBlock from '../stories/blocks/LobbyCodeBlock'
import MenuBlock from '../stories/blocks/MenuBlock'
import MoveHistoryBlock from '../stories/blocks/MoveHistoryBlock'
import ParticipantsBlock from '../stories/blocks/ParticipantsBlock'
import PauseGameBlock from '../stories/blocks/PauseGameBlock'
import PhysicalEditionBlock from '../stories/blocks/PhysicalEditionBlock'
import PlayerSlotBlock from '../stories/blocks/PlayerSlotBlock'
import ReconnectBlock from '../stories/blocks/ReconnectBlock'
import ReleaseZoneBlock from '../stories/blocks/ReleaseZoneBlock'
import RulesBlock from '../stories/blocks/RulesBlock'
import SeatBlock from '../stories/blocks/SeatBlock'
import TurnDockBlock from '../stories/blocks/TurnDockBlock'
import CardParallaxStory from '../stories/CardParallaxStory'
import CardStory from '../stories/CardStory'
import ComboStory from '../stories/ComboStory'
import TextStyles from '../stories/foundations/TextStyles'
import TokenPreview from '../stories/foundations/TokenPreview'
import TypographyPreview from '../stories/foundations/TypographyPreview'
import HandLimitStory from '../stories/HandLimitStory'
import HandStory from '../stories/HandStory'
import InviteStory from '../stories/InviteStory'
import AiCardsStory from '../stories/interactive/AiCardsStory'
import CardPlayStory from '../stories/interactive/CardPlayStory'
import CardToHandStory from '../stories/interactive/CardToHandStory'
import DeckAnimationsStory from '../stories/interactive/DeckAnimationsStory'
import DefenseReleaseStory from '../stories/interactive/DefenseReleaseStory'
import DrawCardStory from '../stories/interactive/DrawCardStory'
import Error503Story from '../stories/interactive/Error503Story'
import GameDealStory from '../stories/interactive/GameDealStory'
import GameEndStory from '../stories/interactive/GameEndStory'
import GitCardsStory from '../stories/interactive/GitCards/GitCardsStory'
import OpponentTakesCardStory from '../stories/interactive/OpponentTakesCardStory'
import PickOpponentCardStory from '../stories/interactive/PickOpponentCardStory'
import PickSpecificCardStory from '../stories/interactive/PickSpecificCardStory'
import AvatarsKit from '../stories/kit/AvatarsKit'
import BadgesKit from '../stories/kit/BadgesKit'
import ButtonsKit from '../stories/kit/ButtonsKit'
import DrawerKit from '../stories/kit/DrawerKit'
import DropdownKit from '../stories/kit/DropdownKit'
import EdgeGlowKit from '../stories/kit/EdgeGlowKit'
import HudBackgroundKit from '../stories/kit/HudBackgroundKit'
import HudSurfaceKit from '../stories/kit/HudSurfaceKit'
import InputsKit from '../stories/kit/InputsKit'
import MessageKit from '../stories/kit/MessageKit'
import ModalsKit from '../stories/kit/ModalsKit'
import ModeSelectKit from '../stories/kit/ModeSelectKit'
import OverlayKit from '../stories/kit/OverlayKit'
import PilesKit from '../stories/kit/PilesKit'
import RingTimerKit from '../stories/kit/RingTimerKit'
import SlidersKit from '../stories/kit/SlidersKit'
import SpinnerKit from '../stories/kit/SpinnerKit'
import StatusDotKit from '../stories/kit/StatusDotKit'
import TabRailKit from '../stories/kit/TabRailKit'
import TextareaKit from '../stories/kit/TextareaKit'
import TogglesKit from '../stories/kit/TogglesKit'
import VideoPlayerKit from '../stories/kit/VideoPlayerKit'
import LoaderStory from '../stories/LoaderStory'
import LobbyChatStory from '../stories/LobbyChatStory'
import LobbyStory from '../stories/LobbyStory'
import StartStory from '../stories/StartStory'
import StatsChatStory from '../stories/StatsChatStory'
import StatsStory from '../stories/StatsStory'
import TableChatStory from '../stories/TableChatStory'
import TableStory from '../stories/TableStory'
import WelcomeStory from '../stories/WelcomeStory'
import { type Lang, LangContext, pick } from './lang'
import styles from './Playground.module.css'

interface Story {
  // Path segment for the story's route (e.g. 'card' → /card).
  id: string
  title: string
  render: () => ReactNode
}
interface Group {
  // Localized group heading. Story titles themselves stay language-agnostic
  // (they are already English), only the RU group headings get an EN variant.
  title: { ru: string; en: string }
  items: Story[]
}

// Реестр «историй», сгруппированный по смыслу. Каждая группа — раздел навигации;
// «Экраны» — слепки целых экранов, остальные — изолированные сущности/элементы.
const groups: Group[] = [
  {
    // приветственная вкладка — первой и без заголовка группы
    title: { ru: '', en: '' },
    items: [{ id: 'welcome', title: 'Welcome', render: () => <WelcomeStory /> }],
  },
  {
    title: { ru: 'Экраны', en: 'Screens' },
    items: [
      { id: 'loader', title: 'Loader', render: () => <LoaderStory /> },
      { id: 'start', title: 'Start screen', render: () => <StartStory /> },
      { id: 'invite', title: 'Invite', render: () => <InviteStory /> },
      { id: 'lobby', title: 'Lobby', render: () => <LobbyStory /> },
      { id: 'table', title: 'Table', render: () => <TableStory /> },
      { id: 'stats', title: 'Stats', render: () => <StatsStory /> },
      // copies of the three screens, to grow voice and text chat on without
      // disturbing the originals. Today they are identical by design.
      { id: 'lobby-chat', title: 'Lobby + chat', render: () => <LobbyChatStory /> },
      { id: 'table-chat', title: 'Table + chat', render: () => <TableChatStory /> },
      { id: 'stats-chat', title: 'Stats + chat', render: () => <StatsChatStory /> },
    ],
  },
  {
    title: { ru: 'Основа', en: 'Foundations' },
    items: [
      { id: 'colors', title: 'Colors', render: () => <TokenPreview /> },
      { id: 'typography', title: 'Typography', render: () => <TypographyPreview /> },
      { id: 'text-styles', title: 'Text styles', render: () => <TextStyles /> },
    ],
  },
  {
    title: { ru: 'Карты', en: 'Cards' },
    items: [
      { id: 'card', title: 'OG Card (PNG)', render: () => <CardStory /> },
      { id: 'card-parallax', title: 'Card', render: () => <CardParallaxStory /> },
      { id: 'hand', title: 'Hand', render: () => <HandStory /> },
      { id: 'hand-limit', title: 'Hand limit', render: () => <HandLimitStory /> },
    ],
  },
  {
    title: { ru: 'Интерактив', en: 'Interactive' },
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
      {
        id: 'pick-specific-card',
        title: 'Specific opponent card',
        render: () => <PickSpecificCardStory />,
      },
      {
        id: 'opponent-takes-card',
        title: 'Opponent takes your card',
        render: () => <OpponentTakesCardStory />,
      },
      { id: 'git-cards', title: 'Git cards', render: () => <GitCardsStory /> },
      { id: 'error-503', title: 'Error 503', render: () => <Error503Story /> },
      {
        id: 'defense-release',
        title: 'Defense Release',
        render: () => <DefenseReleaseStory />,
      },
      { id: 'ai-cards', title: 'AI cards', render: () => <AiCardsStory /> },
      { id: 'card-to-hand', title: 'Card to Hand', render: () => <CardToHandStory /> },
      { id: 'card-play', title: 'Card play', render: () => <CardPlayStory /> },
      { id: 'draw-card', title: 'Draw card', render: () => <DrawCardStory /> },
      { id: 'deck-animations', title: 'Deck animations', render: () => <DeckAnimationsStory /> },
      // the bookends of a match — the table before anything is dealt and one
      // move before it is over; both stand on the shared TableStage
      { id: 'game-deal', title: 'Game Deal', render: () => <GameDealStory /> },
      { id: 'game-end', title: 'Game End', render: () => <GameEndStory /> },
    ],
  },
  {
    // Контролы — интерактивные элементы ввода/выбора (как правило, с текстом).
    title: { ru: 'UI KIT · контролы', en: 'UI KIT · controls' },
    items: [
      { id: 'kit-buttons', title: 'Buttons', render: () => <ButtonsKit /> },
      { id: 'kit-inputs', title: 'Inputs', render: () => <InputsKit /> },
      { id: 'kit-textarea', title: 'Textarea', render: () => <TextareaKit /> },
      { id: 'kit-message', title: 'Message', render: () => <MessageKit /> },
      { id: 'kit-toggles', title: 'Toggles', render: () => <TogglesKit /> },
      { id: 'kit-sliders', title: 'Sliders', render: () => <SlidersKit /> },
      { id: 'kit-dropdown', title: 'Dropdown', render: () => <DropdownKit /> },
      { id: 'kit-mode-select', title: 'Mode select', render: () => <ModeSelectKit /> },
      { id: 'kit-tab-rail', title: 'Tab rail', render: () => <TabRailKit /> },
    ],
  },
  {
    // Поверхности и индикаторы — бейджи, аватары, стопки, оверлеи и т.п.
    title: { ru: 'UI KIT · поверхности', en: 'UI KIT · surfaces' },
    items: [
      { id: 'kit-badges', title: 'Badges', render: () => <BadgesKit /> },
      { id: 'kit-avatars', title: 'Avatars', render: () => <AvatarsKit /> },
      { id: 'kit-piles', title: 'Piles', render: () => <PilesKit /> },
      { id: 'kit-modals', title: 'Modal', render: () => <ModalsKit /> },
      { id: 'kit-drawer', title: 'Drawer', render: () => <DrawerKit /> },
      { id: 'kit-overlay', title: 'Overlay', render: () => <OverlayKit /> },
      { id: 'kit-edge-glow', title: 'Edge glow', render: () => <EdgeGlowKit /> },
      { id: 'kit-spinner', title: 'Spinner', render: () => <SpinnerKit /> },
      { id: 'kit-video-player', title: 'Video player', render: () => <VideoPlayerKit /> },
    ],
  },
  {
    // HUD-примитивы — служебный игровой интерфейс (таймеры, индикаторы, панели).
    title: { ru: 'UI KIT · HUD', en: 'UI KIT · HUD' },
    items: [
      { id: 'kit-ring-timer', title: 'Ring timer', render: () => <RingTimerKit /> },
      { id: 'kit-status-dot', title: 'Status dot', render: () => <StatusDotKit /> },
      { id: 'kit-hud-surface', title: 'HUD surface', render: () => <HudSurfaceKit /> },
      { id: 'kit-hud-background', title: 'HUD background', render: () => <HudBackgroundKit /> },
    ],
  },
  {
    // Готовые композитные куски — собранные из примитивов блоки, как на экранах.
    title: { ru: 'Блоки', en: 'Blocks' },
    items: [
      {
        id: 'block-game-settings',
        title: 'Game settings',
        render: () => <GameSettingsBlock />,
      },
      { id: 'block-rules', title: 'Rules', render: () => <RulesBlock /> },
      { id: 'block-menu', title: 'Menu', render: () => <MenuBlock /> },
      {
        id: 'block-physical-edition',
        title: 'Physical edition',
        render: () => <PhysicalEditionBlock />,
      },
      { id: 'block-seat', title: 'Seat', render: () => <SeatBlock /> },
      { id: 'block-release-zone', title: 'Release zone', render: () => <ReleaseZoneBlock /> },
      { id: 'block-turn-dock', title: 'Turn dock', render: () => <TurnDockBlock /> },
      { id: 'block-pause-game', title: 'Pause game', render: () => <PauseGameBlock /> },
      { id: 'block-confirm-action', title: 'Confirm action', render: () => <ConfirmActionBlock /> },
      { id: 'block-participants', title: 'Participants', render: () => <ParticipantsBlock /> },
      { id: 'block-chat', title: 'Chat', render: () => <ChatBlock /> },
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
      {/* composed card faces (CardFace → useCardLang) follow the preview language */}
      <CardLangProvider value={lang}>
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
              {groups.map((g) => {
                const groupTitle = pick(lang, g.title)
                return (
                  <div key={g.title.ru || g.items[0]?.id} className={styles.group}>
                    {groupTitle && <div className={styles.groupTitle}>{groupTitle}</div>}
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
                )
              })}
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
              {/* параллакс-карты — суб-роут на конкретную карту */}
              <Route path="/card-parallax/:cardId" element={<CardParallaxStory />} />
              {/* Unknown path → first story */}
              <Route path="*" element={<Navigate to={`/${firstId}`} replace />} />
            </Routes>
          </main>
        </div>
      </CardLangProvider>
    </LangContext.Provider>
  )
}
