import { useEffect, useRef, useState } from 'react'
import LangSwitcher, { type SwitchLang } from '@/blocks/LangSwitcher'
import LobbyCode, { LOBBY_CODE_COPY_EN, LOBBY_CODE_COPY_RU } from '@/blocks/LobbyCode'
import Rules, { RULES_COPY_RU, type RulesCopy } from '@/blocks/Rules'
import type { Card } from '@/cards/types'
import { type GameModesCopy, MODES_COPY_RU, type Setup } from '@/game/modes'
import GearIcon from '@/icons/GearIcon'
import Badge from '@/primitives/Badge'
import Drawer from '@/primitives/Drawer'
import Pile from '@/primitives/Pile'
import Slider from '@/primitives/Slider'
import TabRail, { type TabRailItem } from '@/primitives/TabRail'
import GameModes from '@/table/GameModes'
import GameOver from '@/table/GameOver'
import {
  GAME_OVER_COPY_RU,
  type GameOverCondition,
  type GameOverCopy,
} from '@/table/GameOver/GameOver'
import Hand from '@/table/Hand'
import type { HandItem } from '@/table/Hand/Hand'
import MoveHistory from '@/table/MoveHistory'
import {
  type HistoryEntry,
  MOVE_HISTORY_COPY_RU,
  type MoveHistoryCopy,
} from '@/table/MoveHistory/MoveHistory'
import Participants from '@/table/Participants'
import {
  PARTICIPANTS_COPY_RU,
  type Participant,
  type ParticipantsCopy,
  type Spectator,
} from '@/table/Participants/Participants'
import Reconnect, { RECONNECT_COPY_RU, type ReconnectCopy } from '@/table/Reconnect'
import ReleaseZone from '@/table/ReleaseZone'
import type { ReleaseSlots } from '@/table/ReleaseZone/ReleaseZone'
import Seat from '@/table/Seat'
import { SEAT_COPY_RU, type SeatCopy } from '@/table/Seat/Seat'
import styles from './Table.module.css'

interface Opponent {
  id: string
  name: string
  handCount: number
  release: ReleaseSlots
}

interface TableState {
  you: {
    name: string
    hand: HandItem[]
    release: ReleaseSlots
  }
  opponents: Opponent[]
  decks: {
    main: number
    events: number
    discard?: Card | null
    discardCount: number
  }
  turn?: string
  history: HistoryEntry[]
  setup: Setup
  participants: Participant[]
  spectators: Spectator[]
}

type Panel = 'settings' | 'history' | 'participants' | 'rules' | 'modes'
type View = 'oppEliminated' | 'youEliminated' | 'oppDisconnect' | 'youDisconnect'

interface Over {
  winnerId: string
  condition?: GameOverCondition
}

interface TableProps {
  state: TableState
  over?: Over | null
  onOverContinue?: () => void
  view?: View | null
  // текст режимов по языку (read-only панель «игровой режим»)
  modesCopy?: GameModesCopy
  // текст правил по языку (панель «правила»)
  rulesCopy?: RulesCopy
  // текст мест оппонентов по языку (статус / счётчик карт)
  seatCopy?: SeatCopy
  // текст панели «участники» по языку
  participantsCopy?: ParticipantsCopy
  // текст ленты ходов по языку
  historyCopy?: MoveHistoryCopy
  // текст окна переподключения по языку
  reconnectCopy?: ReconnectCopy
  // текст окна завершения партии по языку
  gameOverCopy?: GameOverCopy
  // собственный «хром»-текст стола по языку
  copy?: TableCopy
  // текущий язык и его смена — для свитчера языка в служебной вкладке
  lang?: SwitchLang
  onLangChange?: (lang: SwitchLang) => void
  // код игры — показывается в служебной вкладке (для зрителей), с копированием
  code?: string
  // роль: хост видит управление (лимит зрителей, исключение зрителей)
  role?: 'host' | 'guest'
  // лимит зрителей и его смена — слайдер в служебной вкладке (только для хоста)
  spectatorLimit?: number
  onSpectatorLimitChange?: (n: number) => void
  // исключение зрителя из панели «участники» (только для хоста)
  onKickSpectator?: (id: string) => void
}

// светофор для лимита зрителей (зеркало палитры из экрана Lobby):
// 0–8 зелёный, 9–18 жёлтый, 19–28 красный
const SPEC_MAX = 28
function specColorFor(n: number) {
  if (n <= 8) return '#8fd9b0'
  if (n <= 18) return '#e3b341'
  return '#ff6b81'
}

// Ширина выезжающей панели зависит от типа контента вкладки.
const DRAWER_WIDTH: Record<Panel, number> = {
  settings: 320, // настройки — узкая
  history: 420, // история — немного шире
  participants: 420, // участники — как история
  modes: 680, // режимы — как правила
  rules: 680, // правила — сильно шире
}

// Собственный «хром»-текст стола по языку (бейдж выбывания + подписи стопок).
export interface TableCopy {
  youEliminated: string
  deck: string
  events: string
  discard: string
  // подпись вкладки-настроек (для screen-reader на иконке-шестерёнке)
  settings: string
  // заголовки секций в панели настроек
  langTitle: string
  codeTitle: string
  // заголовок секции управления хоста + подпись слайдера лимита зрителей
  hostTitle: string
  specLimit: string
  // подписи текстовых вкладок рейла
  tabHistory: string
  tabParticipants: string
  tabRules: string
  tabModes: string
}

export const TABLE_COPY_RU: TableCopy = {
  youEliminated: 'вы выбыли из игры',
  deck: 'колода',
  events: 'события',
  discard: 'сброс',
  settings: 'настройки',
  langTitle: 'язык',
  codeTitle: 'код игры',
  hostTitle: 'управление',
  specLimit: 'лимит зрителей',
  tabHistory: 'история',
  tabParticipants: 'участники',
  tabRules: 'правила',
  tabModes: 'игровой режим',
}

export const TABLE_COPY_EN: TableCopy = {
  youEliminated: 'you are out',
  deck: 'deck',
  events: 'events',
  discard: 'discard',
  settings: 'settings',
  langTitle: 'language',
  codeTitle: 'game code',
  hostTitle: 'controls',
  specLimit: 'spectator limit',
  tabHistory: 'history',
  tabParticipants: 'participants',
  tabRules: 'rules',
  tabModes: 'game mode',
}

const EMPTY_RELEASE: ReleaseSlots = {
  frontend: undefined,
  backend: undefined,
  database: undefined,
}

// Стол = активное состояние игры. Каждый блок позиционируется независимо
// (абсолютно), без жёсткой сетки. Заполняет экран без скролла.
export default function Table({
  state,
  over = null,
  onOverContinue,
  view = null,
  modesCopy = MODES_COPY_RU,
  rulesCopy = RULES_COPY_RU,
  seatCopy = SEAT_COPY_RU,
  participantsCopy = PARTICIPANTS_COPY_RU,
  historyCopy = MOVE_HISTORY_COPY_RU,
  reconnectCopy = RECONNECT_COPY_RU,
  gameOverCopy = GAME_OVER_COPY_RU,
  copy = TABLE_COPY_RU,
  lang,
  onLangChange,
  code,
  role = 'guest',
  spectatorLimit,
  onSpectatorLimitChange,
  onKickSpectator,
}: TableProps) {
  const { you, opponents, decks, turn, history, setup, participants, spectators } = state
  const [panel, setPanel] = useState<Panel | null>(null)

  const isHost = role === 'host'
  const codeCopy = lang === 'en' ? LOBBY_CODE_COPY_EN : LOBBY_CODE_COPY_RU
  // секция управления хоста в настройках (сейчас — лимит зрителей)
  const hostControls = isHost && onSpectatorLimitChange && spectatorLimit != null
  const hasUpperSettings = Boolean(lang && onLangChange) || Boolean(code)

  // текстовые вкладки рейла (порядок = сверху вниз), подписи — по языку
  const textTabs: TabRailItem[] = [
    { id: 'history', label: copy.tabHistory },
    { id: 'participants', label: copy.tabParticipants },
    { id: 'rules', label: copy.tabRules },
    { id: 'modes', label: copy.tabModes },
  ]

  // квадратная вкладка «настройки» (шестерёнка) — когда есть что показать
  // (свитчер языка и/или код игры); служебный слот под визуальные опции
  const hasSettings = Boolean(onLangChange) || Boolean(code) || Boolean(hostControls)
  const railItems: TabRailItem[] = hasSettings
    ? [{ id: 'settings', label: copy.settings, icon: <GearIcon /> }, ...textTabs]
    : textTabs

  // завершение партии — оверлей поверх стола (триггерится извне)
  const overWinner = over ? participants.find((p) => p.id === over.winnerId) : null
  const youEliminated = view === 'youEliminated'

  const toggle = (p: Panel) => setPanel((cur) => (cur === p ? null : p))

  // при закрытии держим ширину последней открытой вкладки — чтобы панель
  // уезжала своей шириной, без скачка; при смене вкладок ширина плавно меняется
  const lastOpen = useRef<Panel>('history')
  useEffect(() => {
    if (panel) lastOpen.current = panel
  }, [panel])
  const drawerWidth = DRAWER_WIDTH[panel ?? lastOpen.current]

  return (
    <div className={styles.table}>
      <div className={styles.opponents}>
        {opponents.map((p, i) => {
          const eliminated = view === 'oppEliminated' && i === 0
          const disconnected = view === 'oppDisconnect' && i === 0
          // выбыл → карты в сброс: пустая зона релиза, рука = 0
          const shown = eliminated ? { ...p, handCount: 0, release: EMPTY_RELEASE } : p
          return (
            <Seat
              key={p.id}
              player={shown}
              active={turn === p.id}
              eliminated={eliminated}
              disconnected={disconnected}
              copy={seatCopy}
            />
          )
        })}
      </div>

      <div className={styles.decks}>
        <Pile label={copy.deck} deck="base" count={decks.main} width="150px" countPos="tl" />
        <Pile label={copy.events} deck="ai" count={decks.events} width="150px" countPos="tl" />
      </div>

      <div className={styles.discard}>
        <Pile
          label={copy.discard}
          topCard={decks.discard}
          count={decks.discardCount}
          width="116px"
        />
      </div>

      <div className={styles.you}>
        {youEliminated ? (
          <Badge size="lg" className={styles.youBadge}>
            {copy.youEliminated}
          </Badge>
        ) : (
          <>
            <ReleaseZone release={you.release} size="100px" />
            <div className={styles.handWrap}>
              <Hand items={you.hand} />
            </div>
          </>
        )}
      </div>

      {/* вертикальный рейл у правого края — переключает панели drawer */}
      <TabRail items={railItems} active={panel} onSelect={(id) => toggle(id as Panel)} />

      {/* выезжающая панель поверх контента (ширина — per-tab) */}
      <Drawer open={panel !== null} width={drawerWidth} className={styles.drawer}>
        {panel === 'settings' && (
          <div className={styles.settings}>
            {lang && onLangChange && (
              <section className={styles.settingsSection}>
                <div className={styles.settingsHead}>{copy.langTitle}</div>
                <LangSwitcher value={lang} onChange={onLangChange} variant="full" align="start" />
              </section>
            )}
            {code && (
              <section className={styles.settingsSection}>
                <div className={styles.settingsHead}>{copy.codeTitle}</div>
                <LobbyCode code={code} copy={codeCopy} align="start" reverse showLabel={false} />
              </section>
            )}
            {isHost && onSpectatorLimitChange && spectatorLimit != null && (
              <>
                {hasUpperSettings && <div className={styles.divider} />}
                <section className={styles.settingsSection}>
                  <div className={styles.settingsHead}>{copy.hostTitle}</div>
                  <div className={styles.specField}>
                    <div className={styles.specLabel}>{copy.specLimit}</div>
                    <Slider
                      value={spectatorLimit}
                      min={0}
                      max={SPEC_MAX}
                      onChange={onSpectatorLimitChange}
                      color={specColorFor(spectatorLimit)}
                      fill
                    />
                  </div>
                </section>
              </>
            )}
          </div>
        )}
        {panel === 'history' && <MoveHistory entries={history} copy={historyCopy} />}
        {panel === 'participants' && (
          <Participants
            players={participants}
            spectators={spectators}
            copy={participantsCopy}
            isHost={isHost}
            onKickSpectator={onKickSpectator}
          />
        )}
        {panel === 'rules' && (
          <div className={styles.scrollPanel}>
            <Rules copy={rulesCopy} />
          </div>
        )}
        {panel === 'modes' && <GameModes setup={setup} copy={modesCopy} />}
      </Drawer>

      {view === 'youDisconnect' && <Reconnect copy={reconnectCopy} />}

      {over && (
        <GameOver
          winner={overWinner}
          condition={over.condition}
          onContinue={onOverContinue}
          copy={gameOverCopy}
        />
      )}
    </div>
  )
}
